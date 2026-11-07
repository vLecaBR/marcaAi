using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Google;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Google;

/// <summary>
/// Integração com o Google Calendar via HTTP. Porte de lib/google/calendar.ts (Next):
/// refresh automático de token, FreeBusy, criação de evento com Meet e exclusão.
/// Tokens ficam na tabela accounts (provider=google), mesmas colunas do NextAuth.
/// </summary>
public sealed class GoogleCalendarService(
    HttpClient http,
    ApplicationDbContext db,
    IConfiguration config,
    IOAuthTokenProtector tokens,
    ILogger<GoogleCalendarService> logger) : IGoogleCalendarService
{
    private const string TokenUrl = "https://oauth2.googleapis.com/token";
    private const string CalendarApi = "https://www.googleapis.com/calendar/v3";

    // ── Token válido (com refresh) ───────────────────────────────────────────
    private async Task<string?> GetValidAccessTokenAsync(string userId, CancellationToken ct)
    {
        var account = await db.Accounts
            .FirstOrDefaultAsync(a => a.UserId == userId && a.Provider == "google", ct);
        if (account is null) return null;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // Token ainda válido por >= 5 min
        if (account.ExpiresAt is { } exp && (long)exp * 1000 > nowMs + 5 * 60 * 1000)
            return tokens.Unprotect(account.AccessToken);

        if (string.IsNullOrWhiteSpace(account.RefreshToken))
        {
            logger.LogWarning("[Google] Sem refresh_token para o usuário {UserId}", userId);
            return null;
        }

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, TokenUrl)
            {
                Content = new FormUrlEncodedContent(new Dictionary<string, string>
                {
                    ["client_id"] = config["Google:ClientId"] ?? "",
                    ["client_secret"] = config["Google:ClientSecret"] ?? "",
                    ["grant_type"] = "refresh_token",
                    ["refresh_token"] = tokens.Unprotect(account.RefreshToken) ?? "",
                }),
            };
            using var res = await http.SendAsync(req, ct);
            var body = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[Google] Falha no refresh de token"); if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[Google] Falha no refresh de token — corpo da resposta: {Body}", body);
                return null;
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var accessToken = root.GetProperty("access_token").GetString();
            var expiresIn = root.TryGetProperty("expires_in", out var ei) ? ei.GetInt32() : 3600;

            account.AccessToken = tokens.Protect(accessToken);
            account.ExpiresAt = (int)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() + expiresIn);
            if (root.TryGetProperty("refresh_token", out var rt) && rt.GetString() is { } newRt)
                account.RefreshToken = tokens.Protect(newRt); // Google às vezes reenvia
            await db.SaveChangesAsync(ct);

            return accessToken;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[Google] Erro ao renovar token");
            return null;
        }
    }

    private void SetAuth(HttpRequestMessage req, string token) =>
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

    // ── FreeBusy ─────────────────────────────────────────────────────────────
    public async Task<IReadOnlyList<GoogleBusySlot>> GetBusySlotsAsync(
        string userId, DateTime timeMinUtc, DateTime timeMaxUtc, CancellationToken ct = default)
    {
        var token = await GetValidAccessTokenAsync(userId, ct);
        if (token is null) return Array.Empty<GoogleBusySlot>();

        try
        {
            var payload = JsonSerializer.Serialize(new
            {
                timeMin = timeMinUtc.ToUniversalTime().ToString("o"),
                timeMax = timeMaxUtc.ToUniversalTime().ToString("o"),
                items = new[] { new { id = "primary" } },
            });

            using var req = new HttpRequestMessage(HttpMethod.Post, $"{CalendarApi}/freeBusy")
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            SetAuth(req, token);

            using var res = await http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[Google] FreeBusy falhou"); if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[Google] FreeBusy falhou — corpo da resposta: {Body}", await res.Content.ReadAsStringAsync(ct));
                return Array.Empty<GoogleBusySlot>();
            }

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            if (!doc.RootElement.TryGetProperty("calendars", out var cals) ||
                !cals.TryGetProperty("primary", out var primary) ||
                !primary.TryGetProperty("busy", out var busy))
                return Array.Empty<GoogleBusySlot>();

            var slots = new List<GoogleBusySlot>();
            foreach (var b in busy.EnumerateArray())
            {
                if (DateTime.TryParse(b.GetProperty("start").GetString(), out var s) &&
                    DateTime.TryParse(b.GetProperty("end").GetString(), out var e))
                    slots.Add(new GoogleBusySlot(s.ToUniversalTime(), e.ToUniversalTime()));
            }
            return slots;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[Google] Erro no FreeBusy");
            return Array.Empty<GoogleBusySlot>();
        }
    }

    // ── Criar evento (+ Meet) ────────────────────────────────────────────────
    public async Task<GoogleEventResult?> CreateEventAsync(CreateGoogleEventInput input, CancellationToken ct = default)
    {
        var token = await GetValidAccessTokenAsync(input.UserId, ct);
        if (token is null) return null;

        object body = input.CreateMeetLink
            ? new
            {
                summary = input.Title,
                description = input.Description,
                start = new { dateTime = input.StartUtc.ToUniversalTime().ToString("o") },
                end = new { dateTime = input.EndUtc.ToUniversalTime().ToString("o") },
                attendees = new[] { new { email = input.GuestEmail, displayName = input.GuestName } },
                conferenceData = new
                {
                    createRequest = new
                    {
                        requestId = $"meet_{Guid.NewGuid():N}",
                        conferenceSolutionKey = new { type = "hangoutsMeet" },
                    },
                },
            }
            : new
            {
                summary = input.Title,
                description = input.Description,
                start = new { dateTime = input.StartUtc.ToUniversalTime().ToString("o") },
                end = new { dateTime = input.EndUtc.ToUniversalTime().ToString("o") },
                attendees = new[] { new { email = input.GuestEmail, displayName = input.GuestName } },
            };

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post,
                $"{CalendarApi}/calendars/primary/events?conferenceDataVersion=1")
            {
                Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"),
            };
            SetAuth(req, token);

            using var res = await http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                logger.LogError("[Google] Criar evento falhou"); if (logger.IsEnabled(LogLevel.Debug)) logger.LogDebug("[Google] Criar evento falhou — corpo da resposta: {Body}", await res.Content.ReadAsStringAsync(ct));
                return null;
            }

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync(ct));
            var root = doc.RootElement;
            var eventId = root.GetProperty("id").GetString()!;

            string? meetLink = null;
            if (root.TryGetProperty("conferenceData", out var cd) &&
                cd.TryGetProperty("entryPoints", out var eps))
            {
                foreach (var ep in eps.EnumerateArray())
                {
                    if (ep.TryGetProperty("entryPointType", out var t) && t.GetString() == "video")
                    {
                        meetLink = ep.GetProperty("uri").GetString();
                        break;
                    }
                }
            }

            return new GoogleEventResult(eventId, meetLink);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[Google] Erro ao criar evento");
            return null;
        }
    }

    // ── Deletar evento ───────────────────────────────────────────────────────
    public async Task<bool> DeleteEventAsync(string userId, string eventId, CancellationToken ct = default)
    {
        var token = await GetValidAccessTokenAsync(userId, ct);
        if (token is null) return false;

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Delete,
                $"{CalendarApi}/calendars/primary/events/{eventId}");
            SetAuth(req, token);
            using var res = await http.SendAsync(req, ct);
            return res.IsSuccessStatusCode || res.StatusCode == System.Net.HttpStatusCode.NotFound;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[Google] Erro ao deletar evento");
            return false;
        }
    }
}
