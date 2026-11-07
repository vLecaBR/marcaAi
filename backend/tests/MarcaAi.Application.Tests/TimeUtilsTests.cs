using MarcaAi.Application.Scheduling;

namespace MarcaAi.Application.Tests;

public class TimeUtilsTests
{
    [Theory]
    [InlineData(30, 30)]
    [InlineData(60, 30)]
    [InlineData(90, 30)]
    [InlineData(45, 15)]
    [InlineData(15, 15)]
    [InlineData(50, 5)]
    [InlineData(20, 5)]
    public void GridMinutesFor_escolhe_passo_pela_duracao(int duracao, int esperado) =>
        Assert.Equal(esperado, TimeUtils.GridMinutesFor(duracao));

    [Fact]
    public void Apos_um_bloqueio_a_grade_de_50min_alinha_em_5_minutos()
    {
        var janela = new TimeRange(new DateTime(2026, 11, 9, 12, 0, 0, DateTimeKind.Utc), new DateTime(2026, 11, 9, 20, 0, 0, DateTimeKind.Utc));
        var ocupado = new[] { new TimeRange(new DateTime(2026, 11, 9, 12, 0, 0, DateTimeKind.Utc), new DateTime(2026, 11, 9, 12, 52, 0, DateTimeKind.Utc)) };

        var livres = TimeUtils.SubtractBusyFromWindow(janela, ocupado, TimeUtils.GridMinutesFor(50));

        // 12:52 alinha para 12:55 (grade de 5 min), e não para 13:00 (grade de 30 min).
        Assert.Equal(new DateTime(2026, 11, 9, 12, 55, 0, DateTimeKind.Utc), livres[0].Start);
    }

    [Fact]
    public void Grade_padrao_de_30min_continua_igual()
    {
        var janela = new TimeRange(new DateTime(2026, 11, 9, 12, 0, 0, DateTimeKind.Utc), new DateTime(2026, 11, 9, 20, 0, 0, DateTimeKind.Utc));
        var ocupado = new[] { new TimeRange(new DateTime(2026, 11, 9, 12, 0, 0, DateTimeKind.Utc), new DateTime(2026, 11, 9, 12, 20, 0, DateTimeKind.Utc)) };

        var livres = TimeUtils.SubtractBusyFromWindow(janela, ocupado);

        Assert.Equal(new DateTime(2026, 11, 9, 12, 30, 0, DateTimeKind.Utc), livres[0].Start);
    }
}
