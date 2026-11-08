using System.Reflection;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence.ValueGenerators;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MarcaAi.Infrastructure.Persistence;

/// <summary>
/// DbContext principal. Faz o "scaffold" manual do schema existente:
/// - Tabelas em snake_case (@@map do Prisma).
/// - Colunas em camelCase (nomes originais do Prisma) via convenção automática + overrides.
/// - Enums nativos do Postgres (registrados via MapEnum no UseNpgsql — ver DependencyInjection).
/// - PKs string geradas por CUID na aplicação.
/// A partir daqui a autoridade do schema é do EF Core (code-first / migrations).
/// </summary>
public class ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
    : DbContext(options), IApplicationDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<VerificationToken> VerificationTokens => Set<VerificationToken>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();
    public DbSet<EventType> EventTypes => Set<EventType>();
    public DbSet<EventTypeQuestion> EventTypeQuestions => Set<EventTypeQuestion>();
    public DbSet<Schedule> Schedules => Set<Schedule>();
    public DbSet<ScheduleAvailability> ScheduleAvailabilities => Set<ScheduleAvailability>();
    public DbSet<ScheduleException> ScheduleExceptions => Set<ScheduleException>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingResponse> BookingResponses => Set<BookingResponse>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<UserSubscription> UserSubscriptions => Set<UserSubscription>();
    public DbSet<PayoutAccount> PayoutAccounts => Set<PayoutAccount>();
    public DbSet<ProcessedWebhookEvent> ProcessedWebhookEvents => Set<ProcessedWebhookEvent>();
    public DbSet<ErrorEvent> ErrorEvents => Set<ErrorEvent>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        // Enums nativos: configurados via MapEnum no UseNpgsql (Infrastructure/DependencyInjection.cs),
        // que no EF 9+/10 já cria os tipos nas migrations e define o tipo das colunas.
        ConfigureTables(b);

        // 2) Convenção: toda coluna vira camelCase do nome da propriedade
        //    (ex.: StartTime -> "startTime"), salvo overrides definidos abaixo.
        ApplyCamelCaseColumnNames(b);

        // 3) PKs string + Booking.Uid geradas por CUID na aplicação.
        ApplyCuidGeneration(b);
    }

    private static void ConfigureTables(ModelBuilder b)
    {
        // ---- users ----
        b.Entity<User>(e =>
        {
            e.ToTable("users");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Email).IsUnique();
            e.HasIndex(x => x.Username).IsUnique();
            e.HasIndex(x => x.Email);
            e.HasIndex(x => x.Username);
        });

        // ---- accounts ----
        b.Entity<Account>(e =>
        {
            e.ToTable("accounts");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.Provider, x.ProviderAccountId }).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasOne(x => x.User).WithMany(u => u.Accounts)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            // Overrides snake_case (NextAuth) — divergem da convenção camelCase.
            e.Property(x => x.RefreshToken).HasColumnName("refresh_token");
            e.Property(x => x.AccessToken).HasColumnName("access_token");
            e.Property(x => x.ExpiresAt).HasColumnName("expires_at");
            e.Property(x => x.TokenType).HasColumnName("token_type");
            e.Property(x => x.IdToken).HasColumnName("id_token");
            e.Property(x => x.SessionState).HasColumnName("session_state");
        });

        // ---- sessions ----
        b.Entity<Session>(e =>
        {
            e.ToTable("sessions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.SessionToken).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasOne(x => x.User).WithMany(u => u.Sessions)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- verification_tokens (sem Id; chave composta = @@unique) ----
        b.Entity<VerificationToken>(e =>
        {
            e.ToTable("verification_tokens");
            e.HasKey(x => new { x.Identifier, x.Token });
            e.HasIndex(x => x.Token).IsUnique();
        });

        // ---- teams ----
        b.Entity<Team>(e =>
        {
            e.ToTable("teams");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Slug).IsUnique();
        });

        // ---- team_members ----
        b.Entity<TeamMember>(e =>
        {
            e.ToTable("team_members");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.TeamId, x.UserId }).IsUnique();
            e.HasIndex(x => x.TeamId);
            e.HasIndex(x => x.UserId);
            e.HasOne(x => x.Team).WithMany(t => t.Members)
                .HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany(u => u.TeamMembers)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- event_types ----
        b.Entity<EventType>(e =>
        {
            e.ToTable("event_types");
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.UserId, x.Slug }).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.TeamId);
            e.HasIndex(x => x.Slug);
            e.HasOne(x => x.User).WithMany(u => u.EventTypes)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.Team).WithMany(t => t.EventTypes)
                .HasForeignKey(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- event_type_questions ----
        b.Entity<EventTypeQuestion>(e =>
        {
            e.ToTable("event_type_questions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.EventTypeId);
            e.HasOne(x => x.EventType).WithMany(t => t.Questions)
                .HasForeignKey(x => x.EventTypeId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- schedules ----
        b.Entity<Schedule>(e =>
        {
            e.ToTable("schedules");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserId);
            e.HasOne(x => x.User).WithMany(u => u.Schedules)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- schedule_availabilities ----
        b.Entity<ScheduleAvailability>(e =>
        {
            e.ToTable("schedule_availabilities");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ScheduleId);
            e.HasOne(x => x.Schedule).WithMany(s => s.Availabilities)
                .HasForeignKey(x => x.ScheduleId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- schedule_exceptions ----
        b.Entity<ScheduleException>(e =>
        {
            e.ToTable("schedule_exceptions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ScheduleId);
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.Date);
            e.Property(x => x.Date).HasColumnType("date");
            e.HasOne(x => x.Schedule).WithMany(s => s.Exceptions)
                .HasForeignKey(x => x.ScheduleId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.User).WithMany(u => u.ScheduleExceptions)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- bookings ----
        b.Entity<Booking>(e =>
        {
            e.ToTable("bookings");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Uid).IsUnique();
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.EventTypeId);
            e.HasIndex(x => x.StartTime);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.GuestEmail);
            // Lookup do webhook de pagamento por id do provedor (idempotência — spec §9).
            e.HasIndex(x => x.ProviderPaymentId);
            e.HasIndex(x => x.PayoutAccountId);
            // Índice composto crítico p/ a query anti double-booking.
            e.HasIndex(x => new { x.UserId, x.StartTime, x.EndTime, x.Status });
            e.HasOne(x => x.Owner).WithMany(u => u.BookingsAsOwner)
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.EventType).WithMany(t => t.Bookings)
                .HasForeignKey(x => x.EventTypeId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- booking_responses ----
        b.Entity<BookingResponse>(e =>
        {
            e.ToTable("booking_responses");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.BookingId);
            e.HasOne(x => x.Booking).WithMany(bk => bk.Responses)
                .HasForeignKey(x => x.BookingId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- subscriptions ----
        b.Entity<Subscription>(e =>
        {
            e.ToTable("subscriptions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TeamId).IsUnique();
            e.HasIndex(x => x.StripeCustomerId).IsUnique();
            e.HasIndex(x => x.StripeSubscriptionId).IsUnique();
            e.HasOne(x => x.Team).WithOne(t => t.Subscription)
                .HasForeignKey<Subscription>(x => x.TeamId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- user_subscriptions (assinatura individual do profissional; Q7) ----
        b.Entity<UserSubscription>(e =>
        {
            e.ToTable("user_subscriptions");
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.UserId).IsUnique();
            e.HasIndex(x => x.StripeCustomerId).IsUnique();
            e.HasIndex(x => x.StripeSubscriptionId).IsUnique();
            e.HasOne(x => x.User).WithMany()
                .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // ---- payout_accounts (sub-conta de recebimento; Fase 2 do split) ----
        // Ownership polimórfico (OwnerType + OwnerId): SEM propriedade de navegação em
        // User/Team e SEM FK (a coluna aponta ora para users, ora para teams). A integridade
        // do owner é garantida na Application. Ver financial-split-spec.md §5.2/§5.3.
        b.Entity<PayoutAccount>(e =>
        {
            e.ToTable("payout_accounts");
            e.HasKey(x => x.Id);
            // Uma conta por (owner, provider): permite MP + Stripe para o mesmo owner.
            e.HasIndex(x => new { x.OwnerType, x.OwnerId, x.Provider }).IsUnique();
            e.HasIndex(x => new { x.OwnerType, x.OwnerId });
            e.HasIndex(x => new { x.Provider, x.ExternalAccountId });
        });

        // ---- processed_webhook_events (idempotência de webhooks; F5) ----
        b.Entity<ProcessedWebhookEvent>(e =>
        {
            e.ToTable("processed_webhook_events");
            e.HasKey(x => new { x.Provider, x.EventId });
            e.Property(x => x.Provider).HasMaxLength(32);
            e.Property(x => x.EventId).HasMaxLength(200);
            e.HasIndex(x => x.ProcessedAt);
        });

        // ---- error_events (erros inesperados, sem dado pessoal; V2) ----
        b.Entity<ErrorEvent>(e =>
        {
            e.ToTable("error_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Source).HasMaxLength(8);
            e.Property(x => x.Message).HasMaxLength(300);
            e.Property(x => x.Detail).HasMaxLength(1500);
            e.Property(x => x.Path).HasMaxLength(200);
            e.HasIndex(x => x.CreatedAt);
        });
    }

    /// <summary>Aplica nomes de coluna camelCase (padrão do Prisma) a todas as propriedades
    /// que ainda usam o nome default, sem sobrescrever overrides explícitos.</summary>
    private static void ApplyCamelCaseColumnNames(ModelBuilder b)
    {
        foreach (var entity in b.Model.GetEntityTypes())
        {
            foreach (var prop in entity.GetProperties())
            {
                // Respeita overrides já definidos (ex.: refresh_token).
                var current = prop.GetColumnName();
                if (current != prop.Name) continue;
                prop.SetColumnName(ToCamelCase(prop.Name));
            }
        }
    }

    private static void ApplyCuidGeneration(ModelBuilder b)
    {
        foreach (var entity in b.Model.GetEntityTypes())
        {
            var idProp = entity.FindProperty("Id");
            if (idProp is not null && idProp.ClrType == typeof(string))
            {
                idProp.SetValueGeneratorFactory((_, __) => new CuidValueGenerator());
                idProp.ValueGenerated = Microsoft.EntityFrameworkCore.Metadata.ValueGenerated.OnAdd;
            }
        }

        // Booking.Uid: id público NÃO adivinhável (128 bits aleatórios) — dá acesso anônimo à consulta (achado #16).
        var uid = b.Entity<Booking>().Property(x => x.Uid);
        uid.HasValueGenerator<PublicIdValueGenerator>().ValueGeneratedOnAdd();
    }

    private static string ToCamelCase(string name) =>
        string.IsNullOrEmpty(name) || char.IsLower(name[0])
            ? name
            : char.ToLowerInvariant(name[0]) + name[1..];
}
