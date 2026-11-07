using System.Security.Cryptography;
using System.Text;
using MarcaAi.Application.Features.Billing;
using MarcaAi.Application.Features.Payments;

namespace MarcaAi.Application.Tests;

public class FeeByPlanTests
{
    // Aceite F5: platformFeeCents gravado = feeBps × preço para cada plano (Solo 10%, Solo Pro 5%, Clínica 2,49%, Clínica Pro 1,99%).
    [Theory]
    [InlineData("SOLO", 10_000, 1_000)]
    [InlineData("SOLO_PRO", 10_000, 500)]
    [InlineData("CLINICA", 10_000, 249)]
    [InlineData("CLINICA_PRO", 10_000, 199)]
    [InlineData("SOLO", 15_000, 1_500)]
    [InlineData("CLINICA", 15_050, 375)]      // 374,745 → arredonda para cima
    [InlineData("CLINICA_PRO", 15_050, 299)]  // 299,495 → arredonda para baixo
    public void PlatformFee_matches_plan_bps(string plan, int gross, int expectedFee)
    {
        var bps = PlanCatalog.FeeBpsFor(plan);
        var r = FeeCalculator.Compute(new FeeInput(gross, bps, 0));
        Assert.Equal(expectedFee, r.PlatformFeeCents);
        Assert.Equal(gross - expectedFee, r.NetToProviderCents);
    }

    [Fact]
    public void Plan_bps_constants_are_the_published_prices()
    {
        Assert.Equal(1000, PlanCatalog.SoloFeeBps);
        Assert.Equal(500, PlanCatalog.SoloProFeeBps);
        Assert.Equal(249, PlanCatalog.ClinicaFeeBps);
        Assert.Equal(199, PlanCatalog.ClinicaProFeeBps);
    }

    [Fact]
    public void Full_refund_returns_whole_fee()
    {
        var original = FeeCalculator.Compute(new FeeInput(10_000, 500, 0));
        var refund = FeeCalculator.ComputeRefund(original, 10_000);
        Assert.Equal(500, refund.PlatformFeeReturnedCents);
        Assert.Equal(9_500, refund.NetReversedFromProviderCents);
    }
}

public class MercadoPagoSignatureTests
{
    private const string Secret = "segredo-de-teste";
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-11-07T12:00:00Z");

    private static string Sign(string dataId, string requestId, long ts, string secret = Secret)
    {
        var manifest = $"id:{dataId};request-id:{requestId};ts:{ts};";
        var v1 = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(manifest))).ToLowerInvariant();
        return $"ts={ts},v1={v1}";
    }

    [Fact]
    public void Accepts_valid_signature_with_millisecond_ts()
    {
        var ts = Now.ToUnixTimeMilliseconds();
        Assert.True(MercadoPagoSignature.IsValid(Secret, Sign("12345", "req-1", ts), "req-1", "12345", Now));
    }

    [Fact]
    public void Rejects_wrong_secret_tampered_id_and_missing_header()
    {
        var ts = Now.ToUnixTimeMilliseconds();
        Assert.False(MercadoPagoSignature.IsValid(Secret, Sign("12345", "req-1", ts, "outro"), "req-1", "12345", Now));
        Assert.False(MercadoPagoSignature.IsValid(Secret, Sign("12345", "req-1", ts), "req-1", "99999", Now));
        Assert.False(MercadoPagoSignature.IsValid(Secret, Sign("12345", "req-1", ts), "req-2", "12345", Now));
        Assert.False(MercadoPagoSignature.IsValid(Secret, null, "req-1", "12345", Now));
        Assert.False(MercadoPagoSignature.IsValid("", Sign("12345", "req-1", ts), "req-1", "12345", Now));
    }

    [Fact]
    public void Rejects_replay_older_than_max_age()
    {
        var old = Now.AddMinutes(-30).ToUnixTimeMilliseconds();
        Assert.False(MercadoPagoSignature.IsValid(Secret, Sign("12345", "req-1", old), "req-1", "12345", Now));
    }

    [Fact]
    public void Lowercases_alphanumeric_ids_like_the_provider()
    {
        var ts = Now.ToUnixTimeMilliseconds();
        Assert.True(MercadoPagoSignature.IsValid(Secret, Sign("abc123", "r", ts), "r", "ABC123", Now));
    }
}
