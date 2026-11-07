namespace MarcaAi.Application.Features.Profile;

/// <summary>Atualização do perfil do profissional (dashboard/onboarding).</summary>
public sealed record UpdateProfileInput(
    string? Name,
    string Username,
    string TimeZone,
    string? Bio,
    string? Theme,        // DARK | LIGHT | SYSTEM
    string? BrandColor,
    string? Specialty = null,
    string? Council = null,            // CRM, CRP, CREFITO, CRN...
    string? RegistrationNumber = null,
    string? ClinicName = null);

/// <summary>Perfil editável do profissional autenticado (GET /me/profile).</summary>
public sealed record ProfileDto(
    string? Name,
    string? Username,
    string TimeZone,
    string? Bio,
    string? Image,
    string Theme,
    string? BrandColor,
    string? Specialty,
    string? Council,
    string? RegistrationNumber,
    string? ClinicName,
    bool Onboarded);
