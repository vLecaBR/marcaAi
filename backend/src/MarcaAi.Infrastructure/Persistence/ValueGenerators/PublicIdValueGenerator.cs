using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.ValueGeneration;

namespace MarcaAi.Infrastructure.Persistence.ValueGenerators;

/// <summary>
/// Gera ids públicos NÃO adivinháveis (128 bits aleatórios, base64url, 22 caracteres) — usado em <c>Booking.Uid</c>, que dá
/// acesso anônimo ao detalhe/cancelamento/remarcação da consulta. O CUID v1 antigo tinha timestamp + contador e era
/// previsível (achado #16 / G20). Consultas antigas mantêm o uid que já têm.
/// </summary>
public sealed class PublicIdValueGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => Create();

    public static string Create() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(16)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
