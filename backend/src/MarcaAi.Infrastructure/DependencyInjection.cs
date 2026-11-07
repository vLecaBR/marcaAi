using Microsoft.AspNetCore.DataProtection;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Infrastructure.Billing;
using MarcaAi.Infrastructure.Bookings;
using MarcaAi.Infrastructure.Email;
using MarcaAi.Infrastructure.Identity;
using MarcaAi.Infrastructure.Persistence;
using MarcaAi.Infrastructure.Persistence.Concurrency;
using MarcaAi.Infrastructure.Persistence.Interceptors;
using MarcaAi.Infrastructure.Google;
using MarcaAi.Infrastructure.Jobs;
using MarcaAi.Infrastructure.Notifications;
using MarcaAi.Infrastructure.Payments;
using MarcaAi.Infrastructure.WhatsApp;
using MarcaAi.Infrastructure.Scheduling;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

namespace MarcaAi.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings:Default não configurada.");

        // Pool configurável (Database:MaxPoolSize, default 20). Hangfire usa outro pool (ver Program.cs).
        var connString = new NpgsqlConnectionStringBuilder(connectionString)
        {
            MaxPoolSize = configuration.GetValue("Database:MaxPoolSize", 20),
            ApplicationName = "marcaai-api",
        }.ConnectionString;

        // Enums NATIVOS do Postgres — EF 9+/10: o MapEnum vai DENTRO do UseNpgsql.
        // Isso configura o EF (tipo da coluna + CREATE TYPE nas migrations) E a camada ADO do Npgsql.
        // O translator preserva os labels exatos (DARK, GOOGLE_MEET, NO_SHOW...).
        var translator = new PreserveCaseNameTranslator();

        services.AddSingleton<AuditableInterceptor>();

        services.AddDbContext<ApplicationDbContext>((sp, options) =>
        {
            options.UseNpgsql(connString, npg =>
            {
                npg.MigrationsHistoryTable("__ef_migrations_history");
                npg.MapEnum<Domain.Enums.Theme>("Theme", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.TeamRole>("TeamRole", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.EventTypeColor>("EventTypeColor", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.LocationType>("LocationType", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.QuestionType>("QuestionType", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.ExceptionType>("ExceptionType", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.BookingStatus>("BookingStatus", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.PaymentStatus>("PaymentStatus", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.CanceledBy>("CanceledBy", nameTranslator: translator);
                // Split de marketplace (Fase 2) — sub-contas de recebimento.
                npg.MapEnum<Domain.Enums.PaymentProvider>("PaymentProvider", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.PayoutAccountStatus>("PayoutAccountStatus", nameTranslator: translator);
                npg.MapEnum<Domain.Enums.PayoutOwnerType>("PayoutOwnerType", nameTranslator: translator);
            });
            options.AddInterceptors(sp.GetRequiredService<AuditableInterceptor>());
        });

        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<IBookingConcurrencyGuard, BookingConcurrencyGuard>();
        services.AddScoped<IBookingService, BookingService>();
        services.AddScoped<IAvailabilityService, AvailabilityService>();
        services.AddScoped<IBillingService, StripeBillingService>();
        // Billing individual (Solo Pro) + enforcement de features premium por plano (Q7).
        services.AddScoped<IUserBillingService, UserBillingService>();
        services.AddScoped<IPlanAccessService, PlanAccessService>();
        services.AddHttpClient<IPixPaymentService, MercadoPagoPixService>();
        // Tokens OAuth dos vendedores (Mercado Pago) são cifrados com Data Protection. As chaves precisam
        // persistir entre restarts/containers (DataProtection:KeysPath, volume no compose) — senão os tokens
        // ficam ilegíveis e os vendedores precisam reconectar.
        var dp = services.AddDataProtection().SetApplicationName("MarcaAi");
        if (!string.IsNullOrWhiteSpace(configuration["DataProtection:KeysPath"]))
            dp.PersistKeysToFileSystem(new DirectoryInfo(configuration["DataProtection:KeysPath"]!));
        services.AddScoped<IWebhookEventStore, WebhookEventStore>();
        services.AddHttpClient<MercadoPagoConnectService>();
        services.AddScoped<IMercadoPagoConnectService>(sp => sp.GetRequiredService<MercadoPagoConnectService>());
        services.AddScoped<IConnectOnboardingService>(sp => sp.GetRequiredService<MercadoPagoConnectService>());
        services.AddScoped<IPayoutAccountService, PayoutAccountService>();

        // Split de cartão via Stripe Connect: um único StripeConnectService serve como
        // provedor de cobrança (ISplitPaymentService, resolvido por IEnumerable no roteador)
        // e como handler do webhook do Connect (IStripeConnectWebhookHandler).
        services.AddScoped<StripeConnectService>();
        services.AddScoped<ISplitPaymentService>(sp => sp.GetRequiredService<StripeConnectService>());
        services.AddScoped<IStripeConnectWebhookHandler>(sp => sp.GetRequiredService<StripeConnectService>());
        // Onboarding da conta conectada (Express + Account Link) resolvido por provedor no
        // PayoutAccountService via IEnumerable<IConnectOnboardingService>.
        services.AddScoped<IConnectOnboardingService>(sp => sp.GetRequiredService<StripeConnectService>());
        // Split de PIX via Mercado Pago (typed HttpClient). Somado à coleção de ISplitPaymentService,
        // permitindo que o BookingPaymentService resolva MERCADO_PAGO por IEnumerable.
        services.AddHttpClient<ISplitPaymentService, MercadoPagoSplitService>();
        services.AddScoped<IBookingPaymentService, BookingPaymentService>();
        // Leitura financeira (Fase 5): projeções agregadas dos snapshots de Booking.
        services.AddScoped<IFinanceReportService, MarcaAi.Infrastructure.Finance.FinanceReportService>();
        services.AddHttpClient<IGoogleCalendarService, GoogleCalendarService>();
        services.AddScoped<IUserProvisioning, UserProvisioning>();
        // E-mail: Resend se houver API key; senão, loga o link no console (dev).
        if (!string.IsNullOrWhiteSpace(configuration["Resend:ApiKey"]))
            services.AddHttpClient<IMagicLinkSender, ResendMagicLinkSender>();
        else
            services.AddScoped<IMagicLinkSender, LoggingMagicLinkSender>();

        // E-mail client (notificações): Resend se houver key; senão log.
        if (!string.IsNullOrWhiteSpace(configuration["Resend:ApiKey"]))
            services.AddHttpClient<IEmailClient, ResendEmailClient>();
        else
            services.AddScoped<IEmailClient, LoggingEmailClient>();

        // WhatsApp: Evolution API se configurada; senão log (modo simulado).
        if (!string.IsNullOrWhiteSpace(configuration["WhatsApp:ApiUrl"]) &&
            !string.IsNullOrWhiteSpace(configuration["WhatsApp:ApiKey"]))
            services.AddHttpClient<IWhatsAppSender, EvolutionWhatsAppSender>();
        else
            services.AddScoped<IWhatsAppSender, LoggingWhatsAppSender>();

        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IReminderJob, ReminderJob>();
        services.AddSingleton<IJwtTokenService, JwtTokenService>();

        return services;
    }
}
