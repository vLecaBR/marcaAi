using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Application.Features.Bookings;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
            BookingOutcome.ConsentRequired or BookingOutcome.InvalidResponses =>
                Problem(statusCode: StatusCodes.Status422UnprocessableEntity, detail: result.Message),
            _ => Problem(statusCode: StatusCodes.Status500InternalServerError),
        };
    }

    /// <summary>Lista as consultas do profissional autenticado (dashboard). Filtros opcionais.</summary>
    [Authorize]
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<BookingListItemDto>>> List(
        [FromQuery] string? status, [FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to,
        CancellationToken ct)
    {
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var query = db.Bookings.AsNoTracking().Where(b => b.UserId == userId);

        if (!string.IsNullOrWhiteSpace(status) &&
            Enum.TryParse<Domain.Enums.BookingStatus>(status, ignoreCase: true, out var st))
            query = query.Where(b => b.Status == st);
        if (from is { } f) query = query.Where(b => b.StartTime >= f.UtcDateTime);
        if (to is { } t) query = query.Where(b => b.StartTime <= t.UtcDateTime);

        var items = await query
            .OrderByDescending(b => b.StartTime)
            .Select(b => new BookingListItemDto(
                b.Uid, b.GuestName, b.GuestEmail, b.GuestPhone,
                b.StartTime, b.EndTime, b.Status, b.EventType.Title,
                b.MeetingUrl, b.PaymentStatus))
            .ToListAsync(ct);

        return Ok(items);
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
                x.MeetingUrl, x.GuestTimeZone))
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
