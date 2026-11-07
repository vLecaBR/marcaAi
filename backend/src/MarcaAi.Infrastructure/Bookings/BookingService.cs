using System.Data;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Bookings;
using MarcaAi.Application.Features.Google;
using MarcaAi.Application.Features.Notifications;
using MarcaAi.Application.Features.Payments;
using MarcaAi.Application.Scheduling;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MarcaAi.Infrastructure.Bookings;

/// <summary>
/// Core do agendamento (v1 enxuta): valida evento + duração e cria a consulta sob proteção
/// pessimista anti double-booking.
///
/// Concorrência (decisão firmada): isolamento PADRÃO Read Committed + SELECT ... FOR UPDATE
/// SKIP LOCKED (via IBookingConcurrencyGuard) DENTRO da mesma transação do INSERT.
///
/// Fora do escopo desta fatia: PIX, Google Calendar, e-mail/WhatsApp e recorrência
/// (serão adicionados como camadas seguintes).
/// </summary>
public sealed class BookingService(
    ApplicationDbContext db,
    IBookingConcurrencyGuard guard,
    IGoogleCalendarService google,
    INotificationService notify,
    IPixPaymentService pix,
    IEnumerable<ISplitPaymentService> splitProviders,
    IConfiguration config,
    ILogger<BookingService> logger) : IBookingService
{
    /// <summary>Janela mínima (horas) para reembolso integral no cancelamento pelo paciente (decisão D6).</summary>
    private const int RefundWindowHours = 24;

    /// <summary>Versão do aviso de privacidade aceito. Atualize ao publicar a política revisada (LGPD).</summary>
    private string PolicyVersion => config["Privacy:PolicyVersion"] ?? "rascunho-2026-11";

    public async Task<CreateBookingResult> CreateAsync(
        CreateBookingRequest request, CancellationToken cancellationToken = default)
    {
        // LGPD (Arts. 8º e 11): sem aceite do aviso de privacidade não se coleta dado de saúde.
        if (!request.ConsentAccepted)
            return CreateBookingResult.ConsentRequired();

        var startUtc = request.StartTimeUtc.UtcDateTime;
        var endUtc = request.EndTimeUtc.UtcDateTime;

        var eventType = await db.EventTypes
            .AsNoTracking()
            .FirstOrDefaultAsync(
                e => e.Id == request.EventTypeId && e.UserId == request.OwnerId && e.IsActive,
                cancellationToken);

        if (eventType is null)
            return CreateBookingResult.EventNotFound();

        // Respostas do formulário pré-consulta: só perguntas deste tipo; obrigatórias preenchidas; tamanho limitado.
        var questions = await db.EventTypeQuestions.AsNoTracking()
            .Where(q => q.EventTypeId == eventType.Id).ToListAsync(cancellationToken);
        var responses = (request.Responses ?? Array.Empty<BookingResponseInput>())
            .Where(r => !string.IsNullOrWhiteSpace(r.Answer)).ToList();
        if (responses.Any(r => questions.All(q => q.Id != r.QuestionId)))
            return CreateBookingResult.InvalidResponses("Resposta para pergunta inexistente.");
        if (responses.Any(r => r.Answer.Length > 2000))
            return CreateBookingResult.InvalidResponses("Resposta muito longa (máx. 2000 caracteres).");
        var missing = questions.FirstOrDefault(q => q.Required && responses.All(r => r.QuestionId != q.Id));
        if (missing is not null)
            return CreateBookingResult.InvalidResponses($"Responda a pergunta obrigatória: {missing.Label}");

        var requestedMinutes = (int)Math.Round((endUtc - startUtc).TotalMinutes);
        if (requestedMinutes != eventType.Duration)
            return CreateBookingResult.InvalidDuration(eventType.Duration);

        // Validação de disponibilidade: o horário precisa cair numa janela da agenda.
        var schedule = await db.Schedules.AsNoTracking()
            .Include(s => s.Availabilities)
            .Include(s => s.Exceptions)
            .FirstOrDefaultAsync(s => s.UserId == request.OwnerId && s.IsDefault, cancellationToken);
        if (schedule is null)
            return CreateBookingResult.EventNotFound();

        var scheduleData = new ScheduleData(
            schedule.TimeZone,
            schedule.Availabilities.Select(a => new AvailabilityRule(a.DayOfWeek, a.StartTime, a.EndTime)).ToList(),
            schedule.Exceptions.Select(x => new ScheduleExceptionData(x.Date, x.Type.ToString(), x.StartTime, x.EndTime)).ToList());

        var windows = AvailabilityCalculator.BuildAvailableWindows(
            scheduleData, startUtc.Date.AddDays(-1), startUtc.Date.AddDays(1).AddSeconds(-1));

        var fitsWindow = windows.Any(d => d.Windows.Any(w => startUtc >= w.Start && endUtc <= w.End));
        if (!fitsWindow)
            return CreateBookingResult.Unavailable();

        var status = eventType.RequiresConfirm ? BookingStatus.PENDING : BookingStatus.CONFIRMED;

        var booking = new Domain.Entities.Booking
        {
            UserId = request.OwnerId,
            EventTypeId = request.EventTypeId,
            GuestName = request.GuestName,
            GuestEmail = request.GuestEmail,
            GuestPhone = request.GuestPhone,
            GuestNotes = request.GuestNotes,
            StartTime = startUtc,
            EndTime = endUtc,
            GuestTimeZone = request.GuestTimeZone,
            Status = status,
            PaymentStatus = PaymentStatus.UNPAID,
            ConsentAt = DateTime.UtcNow,
            ConsentVersion = PolicyVersion,
        };
        foreach (var r in responses)
            booking.Responses.Add(new BookingResponse { QuestionId = r.QuestionId, Answer = r.Answer.Trim() });

        // Transação explícita (Read Committed) — escopo FECHADO antes de qualquer chamada externa,
        // para o refresh de token do Google não colidir com a transação já commitada.
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken))
        {
            // Trava pessimista SKIP LOCKED antes de inserir.
            if (await guard.HasConflictAsync(request.OwnerId, startUtc, endUtc, cancellationToken))
            {
                await tx.RollbackAsync(cancellationToken);
                return CreateBookingResult.Conflict();
            }

            db.Bookings.Add(booking);
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }

        // ── Google Calendar (best-effort, fora da transação) ─────────────────
        // Se o Google falhar, NÃO desfazemos a consulta (não pode se perder). Apenas logamos.
        string? meetingUrl = eventType.LocationValue;
        PixCharge? pixData = null;
        if (status == BookingStatus.CONFIRMED)
        {
            try
            {
                var ev = await google.CreateEventAsync(new CreateGoogleEventInput(
                    UserId: request.OwnerId,
                    Title: $"{eventType.Title} com {request.GuestName}",
                    Description: $"Agendamento via MarcaAí\nPaciente: {request.GuestName} ({request.GuestEmail})\nObservações: {request.GuestNotes ?? "—"}",
                    StartUtc: startUtc,
                    EndUtc: endUtc,
                    GuestName: request.GuestName,
                    GuestEmail: request.GuestEmail,
                    CreateMeetLink: eventType.LocationType == LocationType.GOOGLE_MEET), cancellationToken);

                if (ev is not null)
                {
                    booking.MeetingId = ev.EventId;
                    booking.MeetingUrl = ev.MeetLink ?? meetingUrl;
                    meetingUrl = booking.MeetingUrl;
                    await db.SaveChangesAsync(cancellationToken);
                }
            }
            catch
            {
                // best-effort — a consulta permanece criada mesmo se o Google falhar.
            }
        }

        // ── Cobrança PIX (se a consulta tem preço) — best-effort ─────────────
        if (eventType.Price is > 0)
        {
            try
            {
                pixData = await pix.CreateAsync(
                    eventType.Price.Value / 100m,
                    $"Consulta: {eventType.Title}",
                    request.GuestEmail,
                    request.GuestName.Split(' ')[0],
                    booking.Uid, cancellationToken);

                if (pixData is not null)
                {
                    booking.PaymentReference = pixData.Id;
                    await db.SaveChangesAsync(cancellationToken);
                }
            }
            catch { /* best-effort — a consulta é criada mesmo se o PIX falhar */ }
        }

        // ── Notificações (e-mail + WhatsApp, best-effort) ────────────────────
        try
        {
            var owner = await db.Users.AsNoTracking()
                .Where(u => u.Id == request.OwnerId)
                .Select(u => new { u.Name, u.Email, u.TimeZone })
                .FirstOrDefaultAsync(cancellationToken);

            if (owner is not null)
            {
                await notify.NotifyBookingCreatedAsync(new BookingNotification(
                    booking.Uid, booking.GuestName, booking.GuestEmail, booking.GuestPhone,
                    owner.Name ?? "Profissional", owner.Email,
                    eventType.Title, startUtc, endUtc,
                    request.GuestTimeZone, owner.TimeZone,
                    eventType.LocationType, meetingUrl, eventType.RequiresConfirm),
                    cancellationToken);
            }
        }
        catch { /* notificação é best-effort */ }

        return CreateBookingResult.Success(new BookingConfirmationDto(
            booking.Uid,
            booking.StartTime,
            booking.EndTime,
            status.ToString(),
            eventType.RequiresConfirm,
            eventType.Title,
            meetingUrl,
            pixData));
    }

    public async Task<CancelBookingResult> CancelAsync(
        string uid, string? reason, string? canceledBy, string? actorUserId = null, CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings
            .Include(b => b.EventType)
            .Include(b => b.Owner)
            .FirstOrDefaultAsync(b => b.Uid == uid, cancellationToken);
        if (booking is null)
            return new CancelBookingResult(CancelOutcome.NotFound, "Agendamento não encontrado.");
        if (booking.Status == BookingStatus.CANCELLED)
            return new CancelBookingResult(CancelOutcome.AlreadyCancelled, "Agendamento já está cancelado.");

        // O papel vem da identidade autenticada, nunca do corpo (que é anônimo e forjável).
        var actorIsManager = actorUserId is not null && await IsOwnerOrManagerAsync(booking, actorUserId, cancellationToken);
        var by = actorIsManager ? CanceledBy.OWNER : CanceledBy.GUEST;

        booking.Status = BookingStatus.CANCELLED;
        booking.CancelReason = reason;
        booking.CanceledAt = DateTime.UtcNow;
        booking.CanceledBy = by;
        await db.SaveChangesAsync(cancellationToken);

        // Reembolso (D6): integral se o paciente cancela com 24h+ de antecedência; sempre que o cancelamento é do profissional.
        var refund = await TryRefundAsync(booking, by, cancellationToken);

        // Remove o evento do Google Calendar (best-effort).
        if (!string.IsNullOrWhiteSpace(booking.MeetingId))
        {
            try { await google.DeleteEventAsync(booking.UserId, booking.MeetingId!, cancellationToken); }
            catch { /* best-effort */ }
        }

        // Notifica o cancelamento (best-effort).
        try
        {
            await notify.NotifyBookingCancelledAsync(new BookingNotification(
                booking.Uid, booking.GuestName, booking.GuestEmail, booking.GuestPhone,
                booking.Owner.Name ?? "Profissional", booking.Owner.Email,
                booking.EventType.Title, booking.StartTime, booking.EndTime,
                booking.GuestTimeZone, booking.Owner.TimeZone,
                booking.EventType.LocationType, booking.MeetingUrl, booking.EventType.RequiresConfirm),
                reason, cancellationToken);
        }
        catch { /* best-effort */ }

        return new CancelBookingResult(CancelOutcome.Success, Refund: refund);
    }

    private async Task<string?> TryRefundAsync(Domain.Entities.Booking booking, CanceledBy by, CancellationToken ct)
    {
        if (booking.PaymentStatus != PaymentStatus.PAID) return null;

        var eligible = by == CanceledBy.OWNER || (booking.StartTime - DateTime.UtcNow).TotalHours >= RefundWindowHours;
        if (!eligible) return "NOT_ELIGIBLE";

        var provider = splitProviders.FirstOrDefault(s => s.Provider == booking.PaymentProvider);
        if (provider is null || string.IsNullOrWhiteSpace(booking.ProviderPaymentId))
        {
            logger.LogWarning("[Refund] Booking {Uid} sem provedor/pagamento identificável; reembolso manual necessário.", booking.Uid);
            return "FAILED";
        }

        var result = await provider.RefundAsync(booking.ProviderPaymentId!, null, ct);
        if (result is null)
        {
            logger.LogError("[Refund] Falha no reembolso do booking {Uid}; reembolso manual necessário.", booking.Uid);
            return "FAILED";
        }

        booking.PaymentStatus = PaymentStatus.REFUNDED;
        booking.RefundedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return "REFUNDED";
    }

    private async Task<bool> IsOwnerOrManagerAsync(Domain.Entities.Booking booking, string userId, CancellationToken ct)
    {
        if (booking.UserId == userId) return true;
        if (booking.EventType.TeamId is not { } teamId) return false;
        var role = await db.TeamMembers.AsNoTracking()
            .Where(m => m.TeamId == teamId && m.UserId == userId)
            .Select(m => (TeamRole?)m.Role).FirstOrDefaultAsync(ct);
        return role is TeamRole.OWNER or TeamRole.ADMIN;
    }

    public async Task<ConfirmBookingResult> ConfirmAsync(string uid, string actorUserId, CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings
            .Include(b => b.EventType)
            .Include(b => b.Owner)
            .FirstOrDefaultAsync(b => b.Uid == uid, cancellationToken);
        if (booking is null || !await IsOwnerOrManagerAsync(booking, actorUserId, cancellationToken))
            return new ConfirmBookingResult(ConfirmOutcome.NotFound);
        if (booking.Status != BookingStatus.PENDING)
            return new ConfirmBookingResult(ConfirmOutcome.NotPending, "Só consultas pendentes podem ser aprovadas.");

        booking.Status = BookingStatus.CONFIRMED;
        await db.SaveChangesAsync(cancellationToken);

        // Google Calendar (best-effort) — mesma regra da criação direta.
        try
        {
            var ev = await google.CreateEventAsync(new CreateGoogleEventInput(
                UserId: booking.UserId,
                Title: $"{booking.EventType.Title} com {booking.GuestName}",
                Description: $"Agendamento via MarcaAí\nPaciente: {booking.GuestName} ({booking.GuestEmail})\nObservações: {booking.GuestNotes ?? "—"}",
                StartUtc: booking.StartTime,
                EndUtc: booking.EndTime,
                GuestName: booking.GuestName,
                GuestEmail: booking.GuestEmail,
                CreateMeetLink: booking.EventType.LocationType == LocationType.GOOGLE_MEET), cancellationToken);
            if (ev is not null)
            {
                booking.MeetingId = ev.EventId;
                booking.MeetingUrl = ev.MeetLink ?? booking.EventType.LocationValue;
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        catch (Exception ex) { logger.LogWarning(ex, "[Confirm] Google Calendar falhou para o booking {Uid}", booking.Uid); }

        // Notifica o paciente (a mensagem de "criada" com RequiresConfirm=false informa a confirmação).
        try
        {
            await notify.NotifyBookingCreatedAsync(new BookingNotification(
                booking.Uid, booking.GuestName, booking.GuestEmail, booking.GuestPhone,
                booking.Owner.Name ?? "Profissional", booking.Owner.Email,
                booking.EventType.Title, booking.StartTime, booking.EndTime,
                booking.GuestTimeZone, booking.Owner.TimeZone,
                booking.EventType.LocationType, booking.MeetingUrl, false), cancellationToken);
        }
        catch (Exception ex) { logger.LogWarning(ex, "[Confirm] Notificação falhou para o booking {Uid}", booking.Uid); }

        return new ConfirmBookingResult(ConfirmOutcome.Success);
    }
}
