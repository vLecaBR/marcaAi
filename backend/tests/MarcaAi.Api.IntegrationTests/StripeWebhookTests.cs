using System.Net;
using System.Security.Cryptography;
using System.Text;
using MarcaAi.Domain.Entities;
using MarcaAi.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace MarcaAi.Api.IntegrationTests;

/// <summary>Webhooks do Stripe com payload assinado (HMAC) como o Stripe real envia.</summary>
[Collection("api")]
public class StripeWebhookTests(ApiFixture api)
{
    private static string Assina(string payload, string secret)
    {
        var t = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{t}.{payload}"));
        return $"t={t},v1={Convert.ToHexString(mac).ToLowerInvariant()}";
    }

    private static string EventoPaymentIntent(string eventId, string type, string intentId, string bookingUid) => $$"""
        {
          "id": "{{eventId}}", "object": "event", "api_version": "{{Stripe.StripeConfiguration.ApiVersion}}",
          "created": {{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}}, "livemode": false, "type": "{{type}}",
          "data": { "object": {
            "id": "{{intentId}}", "object": "payment_intent", "amount": 10000, "currency": "brl", "status": "requires_payment_method",
            "metadata": { "bookingUid": "{{bookingUid}}" }
          } }
        }
        """;

    private Task<HttpResponseMessage> Envia(string rota, string payload, string? assinatura)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, rota) { Content = new StringContent(payload, Encoding.UTF8, "application/json") };
        if (assinatura is not null) req.Headers.Add("Stripe-Signature", assinatura);
        return api.NewClient().SendAsync(req);
    }

    private async Task<(string Uid, string IntentId)> ConsultaComPagamentoPendenteAsync()
    {
        var uid = "uid-" + Guid.NewGuid().ToString("N");
        var intent = "pi_" + Guid.NewGuid().ToString("N")[..20];
        await api.WithDbAsync(async db =>
        {
            var dono = new User { Id = Guid.NewGuid().ToString("N"), Email = $"{uid}@example.test", Name = "Dono", TimeZone = "America/Sao_Paulo" };
            db.Users.Add(dono);
            var evt = new EventType
            {
                Id = Guid.NewGuid().ToString("N"), UserId = dono.Id, Title = "Consulta", Slug = "consulta", Duration = 30, IsActive = true,
            };
            db.EventTypes.Add(evt);
            db.Bookings.Add(new Booking
            {
                Uid = uid, UserId = dono.Id, EventTypeId = evt.Id, GuestName = "Paciente", GuestEmail = "p@example.test", GuestTimeZone = "UTC",
                StartTime = DateTime.UtcNow.AddDays(5), EndTime = DateTime.UtcNow.AddDays(5).AddMinutes(30), Status = BookingStatus.CONFIRMED,
                PaymentStatus = PaymentStatus.PENDING, PriceCents = 10000, ProviderPaymentId = intent,
            });
            await db.SaveChangesAsync();
        });
        return (uid, intent);
    }

    [Fact]
    public async Task Sem_assinatura_e_recusado()
    {
        Assert.Equal(HttpStatusCode.BadRequest, (await Envia("/api/v1/webhooks/stripe", "{}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await Envia("/api/v1/webhooks/stripe/connect", "{}", null)).StatusCode);
    }

    [Fact]
    public async Task Assinatura_invalida_e_recusada_e_nada_e_alterado()
    {
        var (uid, intent) = await ConsultaComPagamentoPendenteAsync();
        var payload = EventoPaymentIntent("evt_bad_" + uid, "payment_intent.payment_failed", intent, uid);

        var resp = await Envia("/api/v1/webhooks/stripe", payload, Assina(payload, "whsec_chave_errada"));

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        var status = await api.WithDbAsync(db => db.Bookings.Where(b => b.Uid == uid).Select(b => b.PaymentStatus).SingleAsync());
        Assert.Equal(PaymentStatus.PENDING, status);
    }

    [Fact]
    public async Task Payload_adulterado_depois_de_assinado_e_recusado()
    {
        var (uid, intent) = await ConsultaComPagamentoPendenteAsync();
        var original = EventoPaymentIntent("evt_tamper_" + uid, "payment_intent.payment_failed", intent, uid);
        var assinatura = Assina(original, ApiFixture.StripeWebhookSecret);

        var resp = await Envia("/api/v1/webhooks/stripe", original.Replace("10000", "1"), assinatura);

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
    }

    [Fact]
    public async Task Evento_valido_atualiza_o_pagamento_e_o_reenvio_e_idempotente()
    {
        var (uid, intent) = await ConsultaComPagamentoPendenteAsync();
        var eventId = "evt_ok_" + uid;
        var payload = EventoPaymentIntent(eventId, "payment_intent.payment_failed", intent, uid);

        var primeira = await Envia("/api/v1/webhooks/stripe", payload, Assina(payload, ApiFixture.StripeWebhookSecret));
        Assert.Equal(HttpStatusCode.OK, primeira.StatusCode);
        Assert.Equal(PaymentStatus.FAILED, await api.WithDbAsync(db => db.Bookings.Where(b => b.Uid == uid).Select(b => b.PaymentStatus).SingleAsync()));

        // Volta o estado "na mão" e reenvia o MESMO evento: não pode reprocessar.
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.SingleAsync(x => x.Uid == uid);
            b.PaymentStatus = PaymentStatus.PENDING;
            await db.SaveChangesAsync();
        });
        var reenvio = await Envia("/api/v1/webhooks/stripe", payload, Assina(payload, ApiFixture.StripeWebhookSecret));

        Assert.Equal(HttpStatusCode.OK, reenvio.StatusCode);
        Assert.Equal(PaymentStatus.PENDING, await api.WithDbAsync(db => db.Bookings.Where(b => b.Uid == uid).Select(b => b.PaymentStatus).SingleAsync()));
        Assert.Equal(1, await api.WithDbAsync(db => db.ProcessedWebhookEvents.CountAsync(e => e.Provider == "stripe-payments" && e.EventId == eventId)));
    }

    [Fact]
    public async Task Falha_de_pagamento_nunca_sobrescreve_um_pagamento_ja_confirmado()
    {
        var (uid, intent) = await ConsultaComPagamentoPendenteAsync();
        await api.WithDbAsync(async db =>
        {
            var b = await db.Bookings.SingleAsync(x => x.Uid == uid);
            b.PaymentStatus = PaymentStatus.PAID;
            await db.SaveChangesAsync();
        });
        var payload = EventoPaymentIntent("evt_paid_" + uid, "payment_intent.payment_failed", intent, uid);

        var resp = await Envia("/api/v1/webhooks/stripe", payload, Assina(payload, ApiFixture.StripeWebhookSecret));

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal(PaymentStatus.PAID, await api.WithDbAsync(db => db.Bookings.Where(b => b.Uid == uid).Select(b => b.PaymentStatus).SingleAsync()));
    }
}
