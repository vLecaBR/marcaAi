using System.Text;
using Hangfire;
using MarcaAi.Application.Common.Interfaces;
using Hangfire.PostgreSql;
using MarcaAi.Application;
using MarcaAi.Infrastructure;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Camadas (Clean Architecture) — Application + Infrastructure (EF/Npgsql/CUID).
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MVC / OpenAPI / ProblemDetails (RFC 7807 para todos os erros).
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.AddScoped<MarcaAi.Api.Auth.AuthSessionWriter>();
builder.Services.AddControllers()
    .AddJsonOptions(o =>
        o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Instance = ctx.HttpContext.Request.Path;
        ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
    };
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORS — frontend Next.js com credenciais (cookies HttpOnly).
// ─────────────────────────────────────────────────────────────────────────────
var frontendOrigin = builder.Configuration["Cors:FrontendOrigin"] ?? "http://localhost:3000";
const string CorsPolicy = "frontend";
builder.Services.AddCors(o => o.AddPolicy(CorsPolicy, p => p
    .WithOrigins(frontendOrigin)
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials())); // obrigatório p/ enviar/receber o cookie de sessão

// ─────────────────────────────────────────────────────────────────────────────
// 4. Antiforgery (CSRF) — necessário porque o token trafega em cookie.
//    O frontend lê o cookie XSRF e reenvia no header X-XSRF-TOKEN.
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.AddAntiforgery(o =>
{
    o.HeaderName = "X-XSRF-TOKEN";
    o.Cookie.Name = "marcaai_csrf";
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Autenticação: JWT (lido de cookie HttpOnly) + Google OIDC p/ o login.
// ─────────────────────────────────────────────────────────────────────────────
var jwt = builder.Configuration.GetSection("Jwt");
var cookieName = jwt["CookieName"] ?? "marcaai_at";
var signingKey = jwt["SigningKey"] ?? throw new InvalidOperationException("Jwt:SigningKey ausente.");

var authBuilder = builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    // 5a. Valida o access token (JWT) extraído do cookie HttpOnly.
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // mantém 'sub','onboarded',... sem remapear p/ URIs
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt["Issuer"],
            ValidAudience = jwt["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
        // O token NÃO vem no header Authorization; vem do cookie HttpOnly.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (ctx.Request.Cookies.TryGetValue(cookieName, out var token))
                    ctx.Token = token;
                return Task.CompletedTask;
            }
        };
    })
    // 5b. Cookie temporário só para correlacionar o handshake externo do Google.
    .AddCookie("ext", o =>
    {
        o.Cookie.SameSite = SameSiteMode.Lax; // Lax: precisa sobreviver ao redirect do Google.
        o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        o.Cookie.HttpOnly = true;
    });

// 5c. Google OAuth (code flow) — registrado APENAS se houver credenciais.
// O handler do Google é remoto e roda em toda requisição procurando callbacks;
// com ClientId vazio ele lança e derruba todos os requests. Condicionar evita isso em dev.
var googleId = builder.Configuration["Google:ClientId"];
var googleSecret = builder.Configuration["Google:ClientSecret"];
if (!string.IsNullOrWhiteSpace(googleId) && !string.IsNullOrWhiteSpace(googleSecret))
{
    authBuilder.AddGoogle(options =>
    {
        options.SignInScheme = "ext";
        options.ClientId = googleId;
        options.ClientSecret = googleSecret;
        options.CallbackPath = "/api/v1/auth/google/callback";
        options.AccessType = "offline";   // garante refresh_token
        options.SaveTokens = true;
        options.Scope.Add("https://www.googleapis.com/auth/calendar.readonly");
        options.Scope.Add("https://www.googleapis.com/auth/calendar.events");
        options.AdditionalAuthorizationParameters["prompt"] = "consent";
    });
}

builder.Services.AddAuthorization(options =>
{
    // Enforcement de onboarding (antes no proxy.ts) vira policy.
    options.AddPolicy("Onboarded", p => p.RequireClaim("onboarded", "true"));
    // RBAC de clínica (antes inline nas actions) — checagem fina fica nos handlers.
    options.AddPolicy("TeamOwner", p => p.RequireClaim("team_role", "OWNER"));
    options.AddPolicy("TeamManager", p => p.RequireClaim("team_role", "OWNER", "ADMIN"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Hangfire (jobs de lembrete de consulta / no-show) sobre PostgreSQL.
// ─────────────────────────────────────────────────────────────────────────────
// Pool e workers configuráveis (Hangfire:MaxPoolSize, default 5; Hangfire:WorkerCount, default 5).
// A API usa outro pool (ver Infrastructure/DependencyInjection.cs).
var hangfireConn = new Npgsql.NpgsqlConnectionStringBuilder(
    builder.Configuration.GetConnectionString("Default")!)
{
    MaxPoolSize = builder.Configuration.GetValue("Hangfire:MaxPoolSize", 5),
    ApplicationName = "marcaai-hangfire"
}.ConnectionString;

builder.Services.AddHangfire(cfg => cfg
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UsePostgreSqlStorage(o => o.UseNpgsqlConnection(hangfireConn)));
builder.Services.AddHangfireServer(o =>
{
    o.WorkerCount = builder.Configuration.GetValue("Hangfire:WorkerCount", 5);
    o.SchedulePollingInterval = TimeSpan.FromSeconds(30);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6b. Forwarded headers — atrás de proxy que termina TLS (Render/Vercel/etc.).
//     Sem isso, Request.IsHttps=false internamente: o UseHttpsRedirection entra em
//     loop e os cookies de sessão não recebem Secure. Confiamos no X-Forwarded-Proto/For
//     injetados pela borda.
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

// ─────────────────────────────────────────────────────────────────────────────
// 6c. Migrations no boot — aplica o schema pendente (EF Core) ao subir. Simples para
//     uma instância única (free tier). Se escalar para múltiplas réplicas, mover isto
//     para um job/step de release dedicado.
// ─────────────────────────────────────────────────────────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.Migrate();
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Pipeline.
// ─────────────────────────────────────────────────────────────────────────────
app.UseForwardedHeaders();       // 1º: corrige scheme/host atrás do proxy (ver 6b)
app.UseExceptionHandler();       // -> ProblemDetails
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}
else
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.UseCors(CorsPolicy);
app.UseAuthentication();
app.UseAuthorization();

// Dashboard do Hangfire (proteger por auth/policy em produção).
app.UseHangfireDashboard("/hangfire");

app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "marcaai-api" }));

// Lembretes de consulta a cada 15 min (anti no-show) — substitui o GET /api/cron/reminders do Next.
app.Services.GetRequiredService<IRecurringJobManager>()
    .AddOrUpdate<IReminderJob>("consultas-reminders",
        j => j.DispatchDueAsync(CancellationToken.None), "*/15 * * * *");

app.Run();
