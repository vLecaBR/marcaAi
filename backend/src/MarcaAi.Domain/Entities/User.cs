using MarcaAi.Domain.Enums;

namespace MarcaAi.Domain.Entities;

/// <summary>Profissional da saúde / dono de agenda. Tabela "users".</summary>
public class User
{
    public string Id { get; set; } = default!;
    public string? Name { get; set; }
    public string Email { get; set; } = default!;
    public DateTime? EmailVerified { get; set; }
    public string? Image { get; set; }
    public string? Username { get; set; }
    public string? Bio { get; set; }
    // Perfil profissional de saúde (F4). Dados do próprio profissional.
    public string? Specialty { get; set; }
    public string? Council { get; set; }              // CRM, CRP, CREFITO, CRN...
    public string? RegistrationNumber { get; set; }
    public string? ClinicName { get; set; }
    /// <summary>Fim do teste grátis de 30 dias (plano Solo Pro). Preenchido no cadastro.</summary>
    public DateTime? TrialEndsAt { get; set; }
    public string TimeZone { get; set; } = "America/Sao_Paulo";
    public string Locale { get; set; } = "pt-BR";
    public bool Onboarded { get; set; }

    public Theme Theme { get; set; } = Theme.DARK;
    public string? BrandColor { get; set; } = "#7c3aed";

    public string? RecurringEventId { get; set; }
    public int? RecurringIndex { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<Account> Accounts { get; set; } = new List<Account>();
    public ICollection<Session> Sessions { get; set; } = new List<Session>();
    public ICollection<EventType> EventTypes { get; set; } = new List<EventType>();
    public ICollection<Schedule> Schedules { get; set; } = new List<Schedule>();
    public ICollection<ScheduleException> ScheduleExceptions { get; set; } = new List<ScheduleException>();
    public ICollection<Booking> BookingsAsOwner { get; set; } = new List<Booking>();
    public ICollection<TeamMember> TeamMembers { get; set; } = new List<TeamMember>();
}
