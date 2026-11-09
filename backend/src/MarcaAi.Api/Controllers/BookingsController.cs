using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Bookings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

[ApiController]
[Route("api/v1/bookings")]
public sealed class BookingsController(
    IBookingService bookings, IBookingPaymentService payments, IApplicationDbContext db) : ControllerBase
{
    /// <summary>Corpo do início de pagamento: método/provedor da consulta.</summary>
    public sealed record PayRequest(Domain.Enums.PaymentProvider Provider);

    /// <summary>
    /// Inicia o pagamento da consulta e roteia para o provedor (cartão → Stripe Connect).
    /// Retorna o clientSecret para o frontend confirmar. A baixa (PAID) ocorre via webhook.
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("booking-pay")]
    [Idempotent(ttlMinutes: 30)] // Idempotency-Key: duplo clique/retry devolve a mesma intenção de pagamento
    [HttpPost("{uid}/pay")]
    public async Task<IActionResult> Pay(string uid, [FromBody] PayRequest body, CancellationToken ct)
    {
        var r = await payments.InitiateAsync(uid, body.Provider, ct);
        return r.Outcome switch
        {
            PaymentInitOutcome.Success => Ok(new
            {
                provider = r.Provider,
                providerPaymentId = r.ProviderPaymentId,
                clientSecret = r.ClientSecret,          // cartão (Stripe)
                pixQrCode = r.PixQrCode,                 // PIX copia-e-cola (Mercado Pago)
                pixQrCodeBase64 = r.PixQrCodeBase64,
                pixTicketUrl = r.PixTicketUrl,
                amountCents = r.AmountCents,
                applicationFeeCents = r.ApplicationFeeCents,
            }),
            PaymentInitOutcome.BookingNotFound => Problem(statusCode: StatusCodes.Status404NotFound, detail: r.Message),
            PaymentInitOutcome.NotPayable => Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: r.Message),
            PaymentInitOutcome.AlreadyPaid => Problem(statusCode: StatusCodes.Status409Conflict, detail: r.Message),
            PaymentInitOutcome.NoActiveAccount => Problem(statusCode: StatusCodes.Status409Conflict, detail: r.Message),
            _ => Problem(statusCode: StatusCodes.Status502BadGateway, detail: r.Message),
        };
    }

    /// <summary>Agenda uma consulta (fluxo público do paciente). Protegido contra double-booking.</summary>
    [AllowAnonymous]
    [EnableRateLimiting("booking-create")]
    [Idempotent] // Idempotency-Key: duplo clique/retry devolve a mesma consulta, sem criar outra
    [HttpPost]
    public async Task<ActionResult<BookingConfirmationDto>> Create(
        [FromBody] CreateBookingRequest request, CancellationToken ct)
    {
        var result = await bookings.CreateAsync(request, ct);
        return result.Outcome switch
        {
            BookingOutcome.Success =>
                CreatedAtAction(nameof(GetByUid), new { uid = result.Data!.Uid }, result.Data),
            BookingOutcome.EventNotFound =>
                Problem(statusCode: StatusCodes.Status404NotFound, detail: result.Message),
            BookingOutcome.InvalidDuration =>
                Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: result.Message),
            BookingOutcome.Unavailable =>
                Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: result.Message),
            BookingOutcome.Conflict =>
                Problem(statusCode: StatusCodes.Status409Conflict, detail: result.Message),
            BookingOutcome.PaymentUnavailable =>
                Problem(statusCode: StatusCodes.Status409Conflict, detail: result.Message),
            BookingOutcome.ConsentRequired or BookingOutcome.InvalidResponses =>
                Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: result.Message),
            _ => Problem(statusCode: StatusCodes.Status500InternalServerError),
        };
    }

    private static readonly System.Linq.Expressions.Expression<Func<Domain.Entities.Booking, BookingListItemDto>> ToListItem = b =>
        new BookingListItemDto(
            b.Uid, b.GuestName, b.GuestEmail, b.GuestPhone, b.StartTime, b.EndTime, b.Status,
            new BookingEventTypeDto(b.EventType.Title, b.EventType.Color, b.EventType.Duration, b.EventType.LocationType),
            b.MeetingUrl, b.PaymentStatus);

    /// <summary>
    /// Lista paginada das consultas do profissional autenticado (dashboard). Filtros: <c>status</c>, <c>from</c>/<c>to</c>,
    /// <c>q</c> (nome ou e-mail do paciente) e <c>scope</c> = upcoming | pending | past | cancelled (as abas da tela).
    /// Paginação: <c>page</c> (1…) e <c>pageSize</c> (padrão 20, máx. 100). Devolve <c>{ items, total, page, pageSize }</c>.
    /// </summary>
    [Authorize]
    [HttpGet]
    public async Task<ActionResult<PagedResult<BookingListItemDto>>> List(
        [FromQuery] string? status, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        [FromQuery] string? q, [FromQuery] string? scope, [FromQuery] int? page, [FromQuery] int? pageSize,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var (pg, size) = PagedResult<BookingListItemDto>.Normalize(page, pageSize);

        var query = db.Bookings.AsNoTracking().Where(b => b.UserId == userId);

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<Domain.Enums.BookingStatus>(status, ignoreCase: true, out var st))
            query = query.Where(b => b.Status == st);
        if (from is { } f) query = query.Where(b => b.StartTime >= f.UtcDateTime);
        if (to is { } t) query = query.Where(b => b.StartTime <= t.UtcDateTime);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var like = "%" + q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            query = query.Where(b => EF.Functions.ILike(b.GuestName, like) || EF.Functions.ILike(b.GuestEmail, like));
        }

        var now = DateTime.UtcNow;
        var ascending = false;
        switch (scope?.ToLowerInvariant())
        {
            case "upcoming": query = query.Where(b => b.Status == Domain.Enums.BookingStatus.CONFIRMED && b.StartTime > now); ascending = true; break;
            case "pending": query = query.Where(b => b.Status == Domain.Enums.BookingStatus.PENDING && b.StartTime > now); ascending = true; break;
            case "past": query = query.Where(b => b.Status == Domain.Enums.BookingStatus.CONFIRMED && b.StartTime <= now); break;
            case "cancelled": query = query.Where(b => b.Status == Domain.Enums.BookingStatus.CANCELLED || (b.Status == Domain.Enums.BookingStatus.PENDING && b.StartTime <= now)); break;
        }

        var total = await query.CountAsync(ct);
        var ordered = ascending ? query.OrderBy(b => b.StartTime).ThenBy(b => b.Id) : query.OrderByDescending(b => b.StartTime).ThenBy(b => b.Id);
        var items = await ordered.Skip((pg - 1) * size).Take(size).Select(ToListItem).ToListAsync(ct);

        return Ok(new PagedResult<BookingListItemDto>(items, total, pg, size));
    }

    /// <summary>Contagens por aba/status e as próximas consultas — alimenta o dashboard sem baixar a lista inteira.</summary>
    [Authorize]
    [HttpGet("summary")]
    public async Task<ActionResult<BookingSummaryDto>> Summary(CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();
        var now = DateTime.UtcNow;
        var own = db.Bookings.AsNoTracking().Where(b => b.UserId == userId);

        var byStatus = await own.GroupBy(b => b.Status).Select(g => new { Status = g.Key, N = g.Count() }).ToListAsync(ct);
        int N(Domain.Enums.BookingStatus s) => byStatus.FirstOrDefault(x => x.Status == s)?.N ?? 0;
        var upcoming = await own.CountAsync(b => b.Status == Domain.Enums.BookingStatus.CONFIRMED && b.StartTime > now, ct);
        var pendingApproval = await own.CountAsync(b => b.Status == Domain.Enums.BookingStatus.PENDING && b.StartTime > now, ct);
        var past = await own.CountAsync(b => b.Status == Domain.Enums.BookingStatus.CONFIRMED && b.StartTime <= now, ct);
        var cancelledOrExpired = await own.CountAsync(b => b.Status == Domain.Enums.BookingStatus.CANCELLED || (b.Status == Domain.Enums.BookingStatus.PENDING && b.StartTime <= now), ct);
        var nextUp = await own.Where(b => (b.Status == Domain.Enums.BookingStatus.CONFIRMED || b.Status == Domain.Enums.BookingStatus.PENDING) && b.StartTime >= now)
            .OrderBy(b => b.StartTime).ThenBy(b => b.Id).Take(5).Select(ToListItem).ToListAsync(ct);

        return Ok(new BookingSummaryDto(
            byStatus.Sum(x => x.N), N(Domain.Enums.BookingStatus.CONFIRMED), N(Domain.Enums.BookingStatus.PENDING), N(Domain.Enums.BookingStatus.CANCELLED),
            upcoming, pendingApproval, past, cancelledOrExpired, nextUp));
    }

    /// <summary>Detalhe público da consulta (página de confirmação/gerenciamento).</summary>
    [AllowAnonymous]
    [HttpGet("{uid}")]
    public async Task<ActionResult<BookingDetailDto>> GetByUid(string uid, CancellationToken ct)
    {
        var b = await db.Bookings.AsNoTracking()
            .Where(x => x.Uid == uid)
            .Select(x => new BookingDetailDto(
                x.Uid, x.GuestName, x.GuestEmail, x.StartTime, x.EndTime,
                x.Status, x.EventType.Title, x.Owner.Name ?? "Profissional",
                x.MeetingUrl, x.GuestTimeZone,
                x.UserId, x.Owner.Username, x.EventTypeId, x.EventType.Slug, x.EventType.LocationType.ToString(),
                x.EventType.LocationValue, x.PriceCents ?? x.EventType.Price, x.EventType.PayOnSite,
                x.PaymentStatus.ToString(), x.PaymentDueAt == null ? null : new DateTimeOffset(DateTime.SpecifyKind(x.PaymentDueAt.Value, DateTimeKind.Utc)),
                x.RescheduleCount, x.EventType.BookingLimitDays))
            .FirstOrDefaultAsync(ct);

        return b is null
            ? Problem(statusCode: StatusCodes.Status404NotFound, detail: "Agendamento não encontrado.")
            : Ok(b);
    }

    /// <summary>Aprova manualmente uma consulta PENDING (dono ou gestor da clínica).</summary>
    [Authorize]
    [HttpPost("{uid}/confirm")]
    public async Task<IActionResult> Confirm(string uid, CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var result = await bookings.ConfirmAsync(uid, userId, ct);
        return result.Outcome switch
        {
            ConfirmOutcome.Success => NoContent(),
            ConfirmOutcome.NotFound or ConfirmOutcome.Forbidden =>
                Problem(statusCode: StatusCodes.Status404NotFound, detail: "Agendamento não encontrado."),
            ConfirmOutcome.NotPending => Problem(statusCode: StatusCodes.Status409Conflict, detail: result.Message),
            _ => Problem(statusCode: StatusCodes.Status500InternalServerError),
        };
    }

    /// <summary>Cancela a consulta pelo uid (paciente ou profissional). Remove o evento do Google.</summary>
    [AllowAnonymous]
    public sealed record RescheduleRequest(DateTimeOffset StartTimeUtc, DateTimeOffset EndTimeUtc);

    /// <summary>
    /// Remarca a consulta (paciente pelo link, ou profissional logado). O paciente só remarca com 24h+ de antecedência e até
    /// 2 vezes; o profissional/gestor, sem esses limites. O papel vem da sessão, nunca do corpo.
    /// </summary>
    [AllowAnonymous]
    [EnableRateLimiting("booking-create")]
    [HttpPost("{uid}/reschedule")]
    public async Task<IActionResult> Reschedule(string uid, [FromBody] RescheduleRequest body, CancellationToken ct)
    {
        var r = await bookings.RescheduleAsync(uid, body.StartTimeUtc, body.EndTimeUtc, User.GetUserId(), ct);
        return r.Outcome switch
        {
            RescheduleOutcome.Success => Ok(r.Data),
            RescheduleOutcome.NotFound => Problem(statusCode: StatusCodes.Status404NotFound, detail: r.Message),
            RescheduleOutcome.Conflict => Problem(statusCode: StatusCodes.Status409Conflict, detail: r.Message),
            _ => Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: r.Message, title: r.Outcome.ToString()),
        };
    }

    [HttpPost("{uid}/cancel")]
    public async Task<IActionResult> Cancel(string uid, [FromBody] CancelBookingRequest? body, CancellationToken ct)
    {
        var result = await bookings.CancelAsync(uid, body?.Reason, body?.CanceledBy, User.GetUserId(), ct);
        return result.Outcome switch
        {
            CancelOutcome.Success => Ok(new { refund = result.Refund }),
            CancelOutcome.NotFound => Problem(statusCode: StatusCodes.Status404NotFound, detail: result.Message),
            CancelOutcome.AlreadyCancelled => Problem(statusCode: StatusCodes.Status409Conflict, detail: result.Message),
            _ => Problem(statusCode: StatusCodes.Status500InternalServerError),
        };
    }
}
