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
    IEnumerable<ISplitPaymentService> splitProviders,
    IPayoutAccountService payouts,
    IConfiguration config,
    ILogger<BookingService> logger) : IBookingService
{
    /// <summary>Janela mínima (horas) para reembolso integral no cancelamento pelo paciente (decisão D6).</summary>
    private const int RefundWindowHours = 24;

    /// <summary>Antecedência mínima (horas) para o paciente remarcar sozinho e máximo de remarcações do paciente (D15).</summary>
    private const int RescheduleMinHours = 24;
    private const int GuestRescheduleLimit = 2;

    /// <summary>Quanto tempo uma reserva de consulta paga segura o horário esperando o pagamento (D14).</summary>
    private int PaymentHoldMinutes => int.TryParse(config["Payments:HoldMinutes"], out var m) && m > 0 ? m : 15;

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

        switch (await ValidateSlotAsync(request.OwnerId, eventType, startUtc, endUtc, cancellationToken))
        {
            case SlotCheck.InvalidDuration: return CreateBookingResult.InvalidDuration(eventType.Duration);
            case SlotCheck.Unavailable: return CreateBookingResult.Unavailable();
            case SlotCheck.NoSchedule: return CreateBookingResult.EventNotFound();
        }

        // Consulta paga online (D14): pagar para confirmar. Exige conta de recebimento ativa; a reserva segura o horário
        // por alguns minutos (PENDING) e é confirmada pelo webhook de pagamento — ou expira e libera o horário.
        var requiresPayment = eventType.Price is > 0 && !eventType.PayOnSite;
        if (requiresPayment && !await payouts.HasActiveReceiverForEventTypeAsync(eventType.Id, cancellationToken))
            return CreateBookingResult.PaymentUnavailable();

        var status = requiresPayment || eventType.RequiresConfirm ? BookingStatus.PENDING : BookingStatus.CONFIRMED;
        var dueAt = requiresPayment ? DateTime.UtcNow.AddMinutes(PaymentHoldMinutes) : (DateTime?)null;

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
            PaymentDueAt = dueAt,
            PriceCents = requiresPayment ? eventType.Price : null,
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

        // Cobrança: NÃO é criada aqui. Consultas pagas seguem para `POST /bookings/{uid}/pay`
        // (IBookingPaymentService), que cobra na conta do profissional/clínica com split. (F5: o antigo PIX
        // criado aqui caía na conta da plataforma, sem split, em paralelo ao fluxo correto.)

        // ── Notificações (e-mail + WhatsApp, best-effort) ────────────────────
        try
        {
            var owner = await db.Users.AsNoTracking()
                .Where(u => u.Id == request.OwnerId)
                .Select(u => new { u.Name, u.Email, u.TimeZone })
                .FirstOrDefaultAsync(cancellationToken);

            if (owner is not null)
            {
                var n = new BookingNotification(
                    booking.Uid, booking.GuestName, booking.GuestEmail, booking.GuestPhone,
                    owner.Name ?? "Profissional", owner.Email,
                    eventType.Title, startUtc, endUtc,
                    request.GuestTimeZone, owner.TimeZone,
                    eventType.LocationType, meetingUrl, eventType.RequiresConfirm,
                    dueAt, requiresPayment ? eventType.Price : null);
                // Reserva paga: só o paciente é avisado agora (valor e prazo); o profissional é avisado após o pagamento.
                if (requiresPayment) await notify.NotifyBookingPendingPaymentAsync(n, cancellationToken);
                else await notify.NotifyBookingCreatedAsync(n, cancellationToken);
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
            pixData,
            requiresPayment,
            dueAt is { } d ? new DateTimeOffset(DateTime.SpecifyKind(d, DateTimeKind.Utc)) : null,
            requiresPayment ? eventType.Price : null));
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
        await AfterConfirmedAsync(booking, cancellationToken);

        return new ConfirmBookingResult(ConfirmOutcome.Success);
    }

    // ── Pós-confirmação (aprovação do profissional OU baixa do pagamento) ─────────────────────────────
    private async Task AfterConfirmedAsync(Domain.Entities.Booking booking, CancellationToken cancellationToken)
    {
        // Google Calendar (best-effort).
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
            else if (booking.MeetingUrl is null)
            {
                booking.MeetingUrl = booking.EventType.LocationValue;
                await db.SaveChangesAsync(cancellationToken);
            }
        }
        catch (Exception ex) { logger.LogWarning(ex, "[Confirm] Google Calendar falhou para o booking {Uid}", booking.Uid); }

        try { await notify.NotifyBookingCreatedAsync(ToNotification(booking, requiresConfirm: false), cancellationToken); }
        catch (Exception ex) { logger.LogWarning(ex, "[Confirm] Notificação falhou para o booking {Uid}", booking.Uid); }
    }

    private static BookingNotification ToNotification(Domain.Entities.Booking b, bool? requiresConfirm = null) => new(
        b.Uid, b.GuestName, b.GuestEmail, b.GuestPhone,
        b.Owner.Name ?? "Profissional", b.Owner.Email,
        b.EventType.Title, b.StartTime, b.EndTime,
        b.GuestTimeZone, b.Owner.TimeZone,
        b.EventType.LocationType, b.MeetingUrl ?? b.EventType.LocationValue, requiresConfirm ?? b.EventType.RequiresConfirm,
        b.PaymentDueAt, b.PriceCents);

    public async Task OnPaymentConfirmedAsync(string uid, CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings.Include(b => b.EventType).Include(b => b.Owner)
            .FirstOrDefaultAsync(b => b.Uid == uid, cancellationToken);
        if (booking is null || booking.PaymentStatus != PaymentStatus.PAID) return;

        // Pagamento chegou depois da reserva expirar (ou cancelada): devolve o dinheiro — o horário pode já ter sido tomado.
        if (booking.Status == BookingStatus.CANCELLED)
        {
            logger.LogWarning("[Payment] Pagamento recebido para reserva cancelada/expirada {Uid}; reembolsando.", uid);
            await TryRefundAsync(booking, CanceledBy.OWNER, cancellationToken);
            return;
        }

        if (booking.Status != BookingStatus.PENDING) return; // já confirmada (idempotente)

        booking.PaymentDueAt = null;
        if (booking.EventType.RequiresConfirm)
        {
            // Pago, mas o profissional ainda precisa aprovar.
            await db.SaveChangesAsync(cancellationToken);
            try { await notify.NotifyBookingCreatedAsync(ToNotification(booking, requiresConfirm: true), cancellationToken); }
            catch (Exception ex) { logger.LogWarning(ex, "[Payment] Notificação falhou {Uid}", uid); }
            return;
        }

        booking.Status = BookingStatus.CONFIRMED;
        await db.SaveChangesAsync(cancellationToken);
        await AfterConfirmedAsync(booking, cancellationToken);
    }

    // ── Validação de horário compartilhada (criar e remarcar) ─────────────────────────────────────────
    private enum SlotCheck { Ok, InvalidDuration, Unavailable, NoSchedule }

    private async Task<SlotCheck> ValidateSlotAsync(
        string ownerId, EventType eventType, DateTime startUtc, DateTime endUtc, CancellationToken ct)
    {
        var requestedMinutes = (int)Math.Round((endUtc - startUtc).TotalMinutes);
        if (requestedMinutes != eventType.Duration) return SlotCheck.InvalidDuration;

        // Nunca no passado e dentro do limite de antecedência do serviço.
        var now = DateTime.UtcNow;
        if (startUtc <= now) return SlotCheck.Unavailable;
        if (eventType.BookingLimitDays is > 0 and var limit && startUtc > now.AddDays(limit)) return SlotCheck.Unavailable;

        var schedule = await db.Schedules.AsNoTracking()
            .Include(s => s.Availabilities).Include(s => s.Exceptions)
            .FirstOrDefaultAsync(s => s.UserId == ownerId && s.IsDefault, ct);
        if (schedule is null) return SlotCheck.NoSchedule;

        var scheduleData = new ScheduleData(
            schedule.TimeZone,
            schedule.Availabilities.Select(a => new AvailabilityRule(a.DayOfWeek, a.StartTime, a.EndTime)).ToList(),
            schedule.Exceptions.Select(x => new ScheduleExceptionData(x.Date, x.Type.ToString(), x.StartTime, x.EndTime)).ToList());

        var windows = AvailabilityCalculator.BuildAvailableWindows(
            scheduleData, startUtc.Date.AddDays(-1), startUtc.Date.AddDays(1).AddSeconds(-1));
        return windows.Any(d => d.Windows.Any(w => startUtc >= w.Start && endUtc <= w.End)) ? SlotCheck.Ok : SlotCheck.Unavailable;
    }

    // ── Remarcar ──────────────────────────────────────────────────────────────────────────────────────
    public async Task<RescheduleBookingResult> RescheduleAsync(
        string uid, DateTimeOffset newStartUtc, DateTimeOffset newEndUtc, string? actorUserId, CancellationToken cancellationToken = default)
    {
        var booking = await db.Bookings.Include(b => b.EventType).Include(b => b.Owner)
            .FirstOrDefaultAsync(b => b.Uid == uid, cancellationToken);
        if (booking is null) return new RescheduleBookingResult(RescheduleOutcome.NotFound, "Agendamento não encontrado.");
        if (booking.Status is not (BookingStatus.CONFIRMED or BookingStatus.PENDING))
            return new RescheduleBookingResult(RescheduleOutcome.NotAllowed, "Só consultas ativas podem ser remarcadas.");

        var now = DateTime.UtcNow;
        if (booking.StartTime <= now)
            return new RescheduleBookingResult(RescheduleOutcome.NotAllowed, "Esta consulta já começou ou já passou.");

        var isManager = actorUserId is not null && await IsOwnerOrManagerAsync(booking, actorUserId, cancellationToken);
        if (!isManager)
        {
            if ((booking.StartTime - now).TotalHours < RescheduleMinHours)
                return new RescheduleBookingResult(RescheduleOutcome.TooLate,
                    $"Só é possível remarcar com {RescheduleMinHours}h de antecedência. Entre em contato com o profissional.");
            if (booking.RescheduleCount >= GuestRescheduleLimit)
                return new RescheduleBookingResult(RescheduleOutcome.LimitReached,
                    $"Limite de {GuestRescheduleLimit} remarcações atingido. Entre em contato com o profissional.");
        }

        var startUtc = newStartUtc.UtcDateTime;
        var endUtc = newEndUtc.UtcDateTime;
        switch (await ValidateSlotAsync(booking.UserId, booking.EventType, startUtc, endUtc, cancellationToken))
        {
            case SlotCheck.InvalidDuration:
                return new RescheduleBookingResult(RescheduleOutcome.InvalidDuration, $"Duração inválida. Esperado: {booking.EventType.Duration} min.");
            case SlotCheck.Unavailable or SlotCheck.NoSchedule:
                return new RescheduleBookingResult(RescheduleOutcome.Unavailable, "Este horário está fora da disponibilidade do profissional.");
        }

        var oldStart = booking.StartTime;
        await using (var tx = await db.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted, cancellationToken))
        {
            if (await guard.HasConflictAsync(booking.UserId, startUtc, endUtc, cancellationToken, booking.Id))
            {
                await tx.RollbackAsync(cancellationToken);
                return new RescheduleBookingResult(RescheduleOutcome.Conflict, "Este horário acabou de ser reservado. Escolha outro horário.");
            }
            booking.StartTime = startUtc;
            booking.EndTime = endUtc;
            booking.RescheduleCount++;
            booking.ReminderSent = false;
            await db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);
        }

        // Google Calendar (best-effort): recria o evento no novo horário.
        if (!string.IsNullOrWhiteSpace(booking.MeetingId))
        {
            try
            {
                await google.DeleteEventAsync(booking.UserId, booking.MeetingId!, cancellationToken);
                booking.MeetingId = null;
                var ev = await google.CreateEventAsync(new CreateGoogleEventInput(
                    UserId: booking.UserId,
                    Title: $"{booking.EventType.Title} com {booking.GuestName}",
                    Description: $"Agendamento via MarcaAí (remarcado)\nPaciente: {booking.GuestName} ({booking.GuestEmail})",
                    StartUtc: startUtc, EndUtc: endUtc,
                    GuestName: booking.GuestName, GuestEmail: booking.GuestEmail,
                    CreateMeetLink: booking.EventType.LocationType == LocationType.GOOGLE_MEET), cancellationToken);
                if (ev is not null)
                {
                    booking.MeetingId = ev.EventId;
                    booking.MeetingUrl = ev.MeetLink ?? booking.EventType.LocationValue;
                }
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (Exception ex) { logger.LogWarning(ex, "[Reschedule] Google Calendar falhou para {Uid}", uid); }
        }

        try { await notify.NotifyBookingRescheduledAsync(ToNotification(booking), oldStart, cancellationToken); }
        catch (Exception ex) { logger.LogWarning(ex, "[Reschedule] Notificação falhou para {Uid}", uid); }

        var due = booking.PaymentDueAt is { } d ? new DateTimeOffset(DateTime.SpecifyKind(d, DateTimeKind.Utc)) : (DateTimeOffset?)null;
        return new RescheduleBookingResult(RescheduleOutcome.Success, Data: new BookingConfirmationDto(
            booking.Uid, booking.StartTime, booking.EndTime, booking.Status.ToString(), booking.EventType.RequiresConfirm,
            booking.EventType.Title, booking.MeetingUrl, null, due is not null, due, booking.PriceCents));
    }
}
