using System.Net.Http.Json;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>
/// Sobe a API real (WebApplicationFactory) contra um Postgres 18 descartável (Testcontainers).
/// Uma instância por coleção de testes: o container e as migrations são criados uma única vez.
/// </summary>
public sealed class ApiFixture : WebApplicationFactory<Program>, IAsyncLifetime
{
    public const string StripeWebhookSecret = "whsec_integration_tests";
    public const string StripeConnectSecret = "whsec_integration_tests_connect";

    private readonly PostgreSqlContainer _pg = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("marcaai_test").WithUsername("marcaai").WithPassword("marcaai").Build();

    async Task IAsyncLifetime.InitializeAsync()
    {
        await _pg.StartAsync();
        // Variáveis de ambiente vencem user-secrets/appsettings (lidos cedo em Development): garante que o teste
        // NUNCA aponte para o banco de dev nem use chaves reais do desenvolvedor.
        var env = new Dictionary<string, string>
        {
            ["ConnectionStrings__Default"] = _pg.GetConnectionString(),
            ["Jwt__SigningKey"] = "chave-de-teste-de-integracao-com-mais-de-64-caracteres-0123456789-abcdef",
            ["Stripe__SecretKey"] = "sk_test_integration",
            ["Stripe__WebhookSecret"] = StripeWebhookSecret,
            ["Stripe__ConnectWebhookSecret"] = StripeConnectSecret,
            ["DataProtection__KeysPath"] = Path.Combine(Path.GetTempPath(), "marcaai-it-keys-" + Guid.NewGuid()),
            ["RateLimit__Multiplier"] = "1000",
            ["Jobs__OutboxEnabled"] = "false", // os testes do outbox rodam o job à mão (sem corrida com o agendamento)
            ["Payments__Provider"] = "Fake", // jornada paga offline (nunca fala com o Stripe)
            ["Resend__ApiKey"] = "", ["Smtp__Host"] = "", ["Google__ClientId"] = "", ["Google__ClientSecret"] = "",
            ["MercadoPago__AccessToken"] = "", ["MercadoPago__WebhookSecret"] = "",
        };
        foreach (var (k, v) in env) Environment.SetEnvironmentVariable(k, v);
    }
    Task IAsyncLifetime.DisposeAsync() => _pg.DisposeAsync().AsTask();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development"); // pula o validador de configuração de produção
    }

    public HttpClient NewClient() => CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false, AllowAutoRedirect = false });

    /// <summary>Executa algo direto no banco (seed/asserts).</summary>
    public async Task<T> WithDbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    /// <summary>Resolve serviços num escopo próprio (ex.: rodar um job).</summary>
    public async Task<T> WithServicesAsync<T>(Func<IServiceProvider, Task<T>> action)
    {
        using var scope = Services.CreateScope();
        return await action(scope.ServiceProvider);
    }

    public Task WithDbAsync(Func<ApplicationDbContext, Task> action) =>
        WithDbAsync<int>(async db => { await action(db); return 0; });

    /// <summary>Faz login por magic link (lendo o token direto do banco) e devolve um cliente autenticado.</summary>
    public async Task<TestUser> LoginAsync(string email)
    {
        var http = NewClient();
        (await http.PostAsJsonAsync("/api/v1/auth/magic-link/request", new { email })).EnsureSuccessStatusCode();

        var token = await WithDbAsync(db => db.VerificationTokens.Where(v => v.Identifier == email.ToLowerInvariant())
            .OrderByDescending(v => v.Expires).Select(v => v.Token).FirstAsync());

        var resp = await http.GetAsync($"/api/v1/auth/magic-link/verify?token={token}");
        resp.EnsureSuccessStatusCode();
        var me = await resp.Content.ReadFromJsonAsync<JsonElement>();
        var cookies = string.Join("; ", resp.Headers.GetValues("Set-Cookie").Select(c => c.Split(';')[0]));
        return new TestUser(this, me.GetProperty("id").GetString()!, email, cookies);
    }
}

/// <summary>Usuário logado: envia o cookie de sessão manualmente (os cookies são Secure/Lax e o host de teste é http).</summary>
public sealed class TestUser(ApiFixture api, string id, string email, string cookies)
{
    public string Id { get; } = id;
    public string Email { get; } = email;
    /// <summary>Cookie de sessão pronto para o cabeçalho (para usar com outro host de teste).</summary>
    public string Cookies { get; } = cookies;

    public Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, object? body = null)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Add("Cookie", cookies);
        if (body is not null) req.Content = JsonContent.Create(body);
        return api.NewClient().SendAsync(req);
    }

    public Task<HttpResponseMessage> GetAsync(string path) => SendAsync(HttpMethod.Get, path);
    public Task<HttpResponseMessage> PostAsync(string path, object? body = null) => SendAsync(HttpMethod.Post, path, body);
    public Task<HttpResponseMessage> PutAsync(string path, object? body) => SendAsync(HttpMethod.Put, path, body);
    public Task<HttpResponseMessage> DeleteAsync(string path) => SendAsync(HttpMethod.Delete, path);

    /// <summary>Onboarding mínimo: perfil com username + um tipo de consulta de 30 min. Devolve (ownerId, eventTypeId, username).</summary>
    public async Task<(string OwnerId, string EventTypeId, string Username)> OnboardAsync(string username)
    {
        (await PutAsync("/api/v1/me/profile", new
        {
            name = "Dra " + username, username, timeZone = "America/Sao_Paulo", bio = (string?)null, theme = "LIGHT", brandColor = (string?)null,
            specialty = (string?)null, council = (string?)null, registrationNumber = (string?)null, clinicName = (string?)null,
        })).EnsureSuccessStatusCode();

        (await PostAsync("/api/v1/event-types", new
        {
            title = "Consulta", slug = "consulta", duration = 30, locationType = "IN_PERSON", requiresConfirm = false,
            beforeEventBuffer = 0, afterEventBuffer = 0, bookingLimitDays = 60, locationValue = "Rua X", price = (int?)null,
            questions = Array.Empty<object>(),
        })).EnsureSuccessStatusCode();

        var pub = await api.NewClient().GetFromJsonAsync<JsonElement>($"/api/v1/public/{username}");
        return (pub.GetProperty("id").GetString()!, pub.GetProperty("eventTypes")[0].GetProperty("id").GetString()!, username);
    }
}

[CollectionDefinition("api")]
public sealed class ApiCollection : ICollectionFixture<ApiFixture>;
