using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Auth;
using MarcaAi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Infrastructure.Identity;

/// <summary>
/// Localiza ou cria o usuário. Ao criar, semeia a "Agenda Padrão" (seg–sex 09:00–18:00),
/// replicando o evento createUser do NextAuth (auth.ts). IDs são gerados por CUID (value generator do EF).
/// </summary>
public sealed class UserProvisioning(IApplicationDbContext db) : IUserProvisioning
{
    public async Task<User> FindOrCreateByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = email.Trim().ToLowerInvariant();

        var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == normalized, cancellationToken);
        if (existing is not null) return existing;

        var user = NewUserWithDefaultSchedule(normalized);
        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }

    public async Task<User> FindOrCreateWithGoogleAsync(GoogleProfile profile, CancellationToken cancellationToken = default)
    {
        var normalized = profile.Email.Trim().ToLowerInvariant();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == normalized, cancellationToken);
        if (user is null)
        {
            user = NewUserWithDefaultSchedule(normalized);
            if (!string.IsNullOrWhiteSpace(profile.Name)) user.Name = profile.Name;
            db.Users.Add(user);
            await db.SaveChangesAsync(cancellationToken); // materializa o Id (CUID) para a FK da Account
        }

        // Upsert da conta OAuth Google (mesmas colunas do NextAuth — compatibilidade de dados).
        var account = await db.Accounts.FirstOrDefaultAsync(
            a => a.Provider == "google" && a.ProviderAccountId == profile.GoogleUserId, cancellationToken);

        if (account is null)
        {
            account = new Account
            {
                UserId = user.Id,
                Type = "oauth",
                Provider = "google",
                ProviderAccountId = profile.GoogleUserId,
            };
            db.Accounts.Add(account);
        }

        account.AccessToken = profile.AccessToken;
        // Google nem sempre reenvia o refresh_token; preserva o anterior se vier nulo.
        if (!string.IsNullOrWhiteSpace(profile.RefreshToken))
            account.RefreshToken = profile.RefreshToken;
        account.ExpiresAt = profile.ExpiresAtUnix is { } e ? (int)e : account.ExpiresAt;
        account.Scope = profile.Scope ?? account.Scope;
        account.TokenType = "Bearer";

        await db.SaveChangesAsync(cancellationToken);
        return user;
    }

    private static User NewUserWithDefaultSchedule(string email) => new()
    {
        Email = email,
        EmailVerified = DateTime.UtcNow,
        Onboarded = false,
        TrialEndsAt = DateTime.UtcNow.AddDays(MarcaAi.Application.Features.Billing.TrialPolicy.Days),
        Schedules =
        {
            new Schedule
            {
                Name = "Agenda Padrão",
                TimeZone = "America/Sao_Paulo",
                IsDefault = true,
                Availabilities =
                {
                    new ScheduleAvailability { DayOfWeek = 1, StartTime = "09:00", EndTime = "18:00" },
                    new ScheduleAvailability { DayOfWeek = 2, StartTime = "09:00", EndTime = "18:00" },
                    new ScheduleAvailability { DayOfWeek = 3, StartTime = "09:00", EndTime = "18:00" },
                    new ScheduleAvailability { DayOfWeek = 4, StartTime = "09:00", EndTime = "18:00" },
                    new ScheduleAvailability { DayOfWeek = 5, StartTime = "09:00", EndTime = "18:00" },
                },
            },
        },
    };
}
