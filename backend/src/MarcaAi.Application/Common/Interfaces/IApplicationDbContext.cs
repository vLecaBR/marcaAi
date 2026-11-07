using MarcaAi.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Application.Common.Interfaces;

/// <summary>Porta do DbContext exposta à Application (mantém a Application livre do EF concreto).</summary>
public interface IApplicationDbContext
{
    DbSet<User> Users { get; }
    DbSet<Account> Accounts { get; }
    DbSet<Session> Sessions { get; }
    DbSet<VerificationToken> VerificationTokens { get; }
    DbSet<Team> Teams { get; }
    DbSet<TeamMember> TeamMembers { get; }
    DbSet<EventType> EventTypes { get; }
    DbSet<EventTypeQuestion> EventTypeQuestions { get; }
    DbSet<Schedule> Schedules { get; }
    DbSet<ScheduleAvailability> ScheduleAvailabilities { get; }
    DbSet<ScheduleException> ScheduleExceptions { get; }
    DbSet<Booking> Bookings { get; }
    DbSet<BookingResponse> BookingResponses { get; }
    DbSet<Subscription> Subscriptions { get; }
    DbSet<UserSubscription> UserSubscriptions { get; }
    DbSet<PayoutAccount> PayoutAccounts { get; }
    DbSet<ProcessedWebhookEvent> ProcessedWebhookEvents { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
