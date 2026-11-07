using MarcaAi.Api.Auth;
using MarcaAi.Application.Common.Interfaces;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using MarcaAi.Infrastructure.Payments;
using MarcaAi.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.Controllers;

/// <summary>
/// Atalhos de DESENVOLVIMENTO para o pagamento simulado (<c>Payments:Provider=Fake</c>). Respondem 404 em qualquer outra
/// configuração e SEMPRE em produção (além do boot recusar Fake em produção). Passam pelo mesmo caminho do webhook real
/// (<see cref="IBookingService.OnPaymentConfirmedAsync"/>).
/// </summary>
[ApiController]
[Route("api/v1/dev")]
public sealed class DevPaymentsController(
    ApplicationDbContext db, IBookingService bookings, IConfiguration config, IWebHostEnvironment env) : ControllerBase
{
    private bool Enabled =>
        !env.IsProduction() && string.Equals(config["Payments:Provider"], "Fake", StringComparison.OrdinalIgnoreCase);

    /// <summary>Ativa os recebimentos simulados do usuário logado (conta Stripe "ACTIVE" fictícia).</summary>
    [Authorize]
    [HttpPost("payouts/activate")]
    public async Task<IActionResult> ActivatePayouts(CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        var userId = User.GetUserId();
        if (userId is null) return Unauthorized();

        var acc = await db.PayoutAccounts.FirstOrDefaultAsync(a =>
            a.OwnerType == PayoutOwnerType.USER && a.OwnerId == userId && a.Provider == PaymentProvider.STRIPE, ct);
        if (acc is null)
        {
            acc = new PayoutAccount { OwnerType = PayoutOwnerType.USER, OwnerId = userId, Provider = PaymentProvider.STRIPE, ExternalAccountId = "" };
            db.PayoutAccounts.Add(acc);
        }
        if (string.IsNullOrEmpty(acc.ExternalAccountId)) acc.ExternalAccountId = "acct_fake_" + Guid.NewGuid().ToString("N")[..12];
        acc.Status = PayoutAccountStatus.ACTIVE;
        acc.ChargesEnabled = true;
        acc.PayoutsEnabled = true;
        await db.SaveChangesAsync(ct);
        return Ok(new { activated = true });
    }

    /// <summary>Simula a aprovação do pagamento (equivale ao webhook payment_intent.succeeded).</summary>
    [AllowAnonymous]
    [HttpPost("payments/{uid}/approve")]
    public async Task<IActionResult> Approve(string uid, CancellationToken ct)
    {
        if (!Enabled) return NotFound();
        var booking = await db.Bookings.FirstOrDefaultAsync(b => b.Uid == uid, ct);
        if (booking is null) return NotFound();
        if (booking.ProviderPaymentId is null || !booking.ProviderPaymentId.StartsWith(FakePaymentProvider.PaymentIdPrefix))
            return Problem(statusCode: 409, detail: "Inicie o pagamento (POST /bookings/{uid}/pay) antes de aprovar.");

        if (booking.PaymentStatus != PaymentStatus.PAID)
        {
            booking.PaymentStatus = PaymentStatus.PAID;
            booking.PaidAt = DateTime.UtcNow;
            if (booking.PriceCents is { } gross && booking.PlatformFeeCents is { } fee) booking.NetToProviderCents ??= gross - fee;
            await db.SaveChangesAsync(ct);
        }
        await bookings.OnPaymentConfirmedAsync(uid, ct);
        return Ok(new { paid = true });
    }
}
