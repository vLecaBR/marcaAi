using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Direitos do titular (LGPD Art. 18). O profissional (controlador) atende pacientes: exportar (acesso/portabilidade)
/// e anonimizar. O próprio profissional pode exportar e excluir a sua conta. Prazo legal de resposta: 15 dias (Art. 19, II),
/// aqui atendido de forma imediata. O e-mail do paciente trafega no corpo (POST), não na URL, para não cair em logs.
/// </summary>
[ApiController]
[Route("api/v1/privacy")]
[Authorize]
public sealed class PrivacyController(IApplicationDbContext db, AuthSessionWriter session) : ControllerBase
{
    public sealed record PatientRequest(string Email);
    public sealed record DeleteAccountRequest(string Confirm);

    // ── Paciente: acesso / portabilidade ─────────────────────────────────────
    [HttpPost("patients/export")]
    public async Task<IActionResult> ExportPatient([FromBody] PatientRequest body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var email = body.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email)) return Problem(statusCode: 422, detail: "E-mail do paciente é obrigatório.");

        var rows = await db.Bookings.AsNoTracking()
            .Where(b => b.UserId == userId && b.GuestEmail.ToLower() == email)
            .OrderBy(b => b.StartTime)
            .Select(b => new
            {
                b.Uid, Consulta = b.EventType.Title, b.StartTime, b.EndTime, Status = b.Status.ToString(),
                Paciente = new { b.GuestName, b.GuestEmail, b.GuestPhone, b.GuestNotes, b.GuestTimeZone },
                Respostas = b.Responses.Select(r => new
                {
                    Pergunta = db.EventTypeQuestions.Where(q => q.Id == r.QuestionId).Select(q => q.Label).FirstOrDefault(),
                    r.Answer,
                }).ToList(),
                Consentimento = new { b.ConsentAt, b.ConsentVersion },
                Pagamento = new { Status = b.PaymentStatus.ToString(), b.PriceCents, b.PaidAt, b.RefundedAt },
                b.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(new { geradoEm = DateTime.UtcNow, titular = email, total = rows.Count, consultas = rows });
    }

    // ── Paciente: anonimização (Art. 18, IV) ─────────────────────────────────
    /// <summary>
    /// Remove identificadores do paciente nas consultas do profissional (nome, e-mail, telefone, observações e respostas),
    /// preservando os registros financeiros/fiscais (Art. 16, I — cumprimento de obrigação legal).
    /// </summary>
    [HttpPost("patients/anonymize")]
    public async Task<IActionResult> AnonymizePatient([FromBody] PatientRequest body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var email = body.Email?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email)) return Problem(statusCode: 422, detail: "E-mail do paciente é obrigatório.");

        var bookings = await db.Bookings.Include(b => b.Responses)
            .Where(b => b.UserId == userId && b.GuestEmail.ToLower() == email)
            .ToListAsync(ct);
        if (bookings.Count == 0) return NotFound();

        foreach (var b in bookings)
        {
            b.GuestName = "Paciente anonimizado";
            b.GuestEmail = $"anonimizado+{b.Id}@anonimizado.invalid";
            b.GuestPhone = null;
            b.GuestNotes = null;
            db.BookingResponses.RemoveRange(b.Responses);
        }
        await db.SaveChangesAsync(ct);
        return Ok(new { anonimizadas = bookings.Count });
    }

    // ── Conta do profissional: acesso ────────────────────────────────────────
    [HttpGet("account/export")]
    public async Task<IActionResult> ExportAccount(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var user = await db.Users.AsNoTracking().Where(u => u.Id == userId)
            .Select(u => new
            {
                u.Name, u.Email, u.Username, u.Bio, u.TimeZone, u.Specialty, u.Council, u.RegistrationNumber, u.ClinicName,
                u.TrialEndsAt, u.CreatedAt,
            }).FirstOrDefaultAsync(ct);
        if (user is null) return Unauthorized();

        var eventTypes = await db.EventTypes.AsNoTracking().Where(e => e.UserId == userId)
            .Select(e => new { e.Title, e.Slug, e.Duration, e.Price, e.Currency }).ToListAsync(ct);
        var teams = await db.TeamMembers.AsNoTracking().Where(m => m.UserId == userId)
            .Select(m => new { Clinica = m.Team.Name, Papel = m.Role.ToString() }).ToListAsync(ct);
        var bookings = await db.Bookings.AsNoTracking().CountAsync(b => b.UserId == userId, ct);

        return Ok(new { geradoEm = DateTime.UtcNow, conta = user, tiposDeConsulta = eventTypes, clinicas = teams,
                        totalDeConsultas = bookings, observacao = "Dados de pacientes: use /privacy/patients/export." });
    }

    // ── Conta do profissional: eliminação (Art. 18, VI) ──────────────────────
    /// <summary>
    /// Exclui a conta e os dados vinculados (consultas e respostas dos pacientes, agenda, tipos, assinaturas locais).
    /// Bloqueia (409) se houver assinatura paga viva ou clínica com outros membros — resolva antes.
    /// Contas de recebimento no Stripe/Mercado Pago precisam ser encerradas nos próprios provedores.
    /// </summary>
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount([FromBody] DeleteAccountRequest body, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        if (!string.Equals(body.Confirm, "EXCLUIR", StringComparison.Ordinal))
            return Problem(statusCode: 422, detail: "Envie confirm = \"EXCLUIR\" para confirmar a exclusão.");

        var sub = await db.UserSubscriptions.AsNoTracking().Where(s => s.UserId == userId)
            .Select(s => s.Status).FirstOrDefaultAsync(ct);
        if ((sub ?? "").Trim().ToLowerInvariant() is "active" or "trialing" or "past_due")
            return Problem(statusCode: 409, detail: "Cancele a assinatura antes de excluir a conta.");

        var myTeams = await db.TeamMembers.Where(m => m.UserId == userId).ToListAsync(ct);
        foreach (var m in myTeams)
        {
            var others = await db.TeamMembers.CountAsync(x => x.TeamId == m.TeamId && x.UserId != userId, ct);
            if (m.Role == TeamRole.OWNER && others > 0)
                return Problem(statusCode: 409, detail: "Você é dono de uma clínica com outros membros. Transfira a posse ou remova os membros antes.");
        }

        // Clínicas só suas são removidas por inteiro (cascata: membros, tipos, assinatura).
        foreach (var m in myTeams.Where(m => m.Role == TeamRole.OWNER))
        {
            var team = await db.Teams.FirstOrDefaultAsync(t => t.Id == m.TeamId, ct);
            if (team is not null) db.Teams.Remove(team);
        }

        // Contas de recebimento são polimórficas (sem FK): remover as do usuário.
        db.PayoutAccounts.RemoveRange(await db.PayoutAccounts.Where(a => a.OwnerType == PayoutOwnerType.USER && a.OwnerId == userId).ToListAsync(ct));
        db.Users.Remove((await db.Users.FirstAsync(u => u.Id == userId, ct)));
        await db.SaveChangesAsync(ct);

        // Encerra a sessão.
        session.Clear(HttpContext);
        return NoContent();
    }
}
