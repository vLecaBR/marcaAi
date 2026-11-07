using MarcaAi.Application.Scheduling;

namespace MarcaAi.Application.Tests;

/// <summary>AvailabilityCalculator, SlotCalculator e TimeUtils (fusos, DST, exceções, buffers, grade).</summary>
public class SchedulingTests
{
    private const string SP = "America/Sao_Paulo";
    private const string NY = "America/New_York";

    private static DateTime Utc(int y, int mo, int d, int h = 0, int mi = 0) => new(y, mo, d, h, mi, 0, DateTimeKind.Utc);

    private static ScheduleData Agenda(string tz, IEnumerable<AvailabilityRule> regras, IEnumerable<ScheduleExceptionData>? ex = null) =>
        new(tz, regras.ToList(), (ex ?? []).ToList());

    // ---------- TimeUtils ----------

    [Fact]
    public void BuildUtcDateTime_converte_horario_local_de_Sao_Paulo_para_UTC()
    {
        // São Paulo = UTC-3 (sem horário de verão desde 2019). 09:00 local = 12:00 UTC.
        var dia = Utc(2030, 6, 10, 15);
        Assert.Equal(Utc(2030, 6, 10, 12), TimeUtils.BuildUtcDateTime(dia, "09:00", SP));
    }

    [Fact]
    public void BuildUtcDateTime_respeita_horario_de_verao_em_Nova_York()
    {
        // Inverno (EST, UTC-5) vs verão (EDT, UTC-4): 09:00 local muda de 14:00 para 13:00 UTC.
        Assert.Equal(Utc(2030, 1, 15, 14), TimeUtils.BuildUtcDateTime(Utc(2030, 1, 15, 17), "09:00", NY));
        Assert.Equal(Utc(2030, 7, 15, 13), TimeUtils.BuildUtcDateTime(Utc(2030, 7, 15, 17), "09:00", NY));
    }

    [Fact]
    public void DayOfWeekInZone_usa_o_dia_local_e_nao_o_do_UTC()
    {
        // 2030-06-10 01:00 UTC ainda é domingo (09/06) às 22:00 em São Paulo.
        var instante = Utc(2030, 6, 10, 1);
        Assert.Equal((int)DayOfWeek.Sunday, TimeUtils.DayOfWeekInZone(instante, SP));
        Assert.Equal((int)DayOfWeek.Monday, TimeUtils.DayOfWeekInZone(instante, "UTC"));
    }

    [Fact]
    public void EachDayBetween_gera_um_item_por_dia_local_inclusive()
    {
        var dias = TimeUtils.EachDayBetween(Utc(2030, 6, 10, 12), Utc(2030, 6, 12, 12), SP);
        Assert.Equal(3, dias.Count);
    }

    [Fact]
    public void EachDayBetween_atravessa_a_virada_de_DST_sem_pular_nem_repetir_dia()
    {
        // Em 2030 o horário de verão americano começa em 10/03.
        var dias = TimeUtils.EachDayBetween(Utc(2030, 3, 9, 17), Utc(2030, 3, 12, 17), NY);
        Assert.Equal(4, dias.Count);
        Assert.Equal(dias.Count, dias.Select(d => TimeUtils.LocalDate(d, NY)).Distinct().Count());
    }

    [Theory]
    [InlineData(10, 12, 11, 13, true)]   // sobrepõe
    [InlineData(10, 14, 11, 12, true)]   // contém
    [InlineData(10, 11, 11, 12, false)]  // encostam: fronteira aberta
    [InlineData(10, 11, 12, 13, false)]  // disjuntos
    public void RangesOverlap_trata_fronteira_como_aberta(int a1, int a2, int b1, int b2, bool esperado) =>
        Assert.Equal(esperado, TimeUtils.RangesOverlap(Utc(2030, 1, 1, a1), Utc(2030, 1, 1, a2), Utc(2030, 1, 1, b1), Utc(2030, 1, 1, b2)));

    [Fact]
    public void GenerateSlotsInWindow_respeita_buffers_e_nao_ultrapassa_o_fim()
    {
        // Janela 09:00-12:00 UTC, consulta de 30 min com 10 min antes e 10 min depois (bloco de 50 min).
        var slots = TimeUtils.GenerateSlotsInWindow(new TimeRange(Utc(2030, 1, 1, 9), Utc(2030, 1, 1, 12)), 30, 10, 10);

        Assert.All(slots, s => Assert.Equal(TimeSpan.FromMinutes(30), s.End - s.Start));
        Assert.Equal(Utc(2030, 1, 1, 9, 10), slots[0].Start); // buffer antes
        Assert.Equal(Utc(2030, 1, 1, 9, 50), slots[1].Start); // próximo: +duração +buffer depois
        Assert.All(slots, s => Assert.True(s.End.AddMinutes(10) <= Utc(2030, 1, 1, 12)));
    }

    [Fact]
    public void GenerateSlotsInWindow_janela_menor_que_a_consulta_nao_gera_nada() =>
        Assert.Empty(TimeUtils.GenerateSlotsInWindow(new TimeRange(Utc(2030, 1, 1, 9), Utc(2030, 1, 1, 9, 20)), 30, 0, 0));

    [Fact]
    public void FormatDateInZone_usa_a_data_do_fuso_do_visitante()
    {
        // 02:00 UTC de 11/06 ainda é 10/06 à noite em São Paulo.
        Assert.Equal("2030-06-10", TimeUtils.FormatDateInZone(Utc(2030, 6, 11, 2), SP));
        Assert.Equal("2030-06-11", TimeUtils.FormatDateInZone(Utc(2030, 6, 11, 2), "UTC"));
    }

    // ---------- AvailabilityCalculator ----------

    // 2030-06-10 é uma segunda-feira (DayOfWeek = 1).
    private static readonly DateTime Segunda = Utc(2030, 6, 10, 15);

    [Fact]
    public void Disponibilidade_gera_a_janela_do_dia_da_semana_configurado()
    {
        var agenda = Agenda(SP, [new AvailabilityRule(1, "09:00", "12:00")]);

        var dias = AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda);

        var dia = Assert.Single(dias);
        var janela = Assert.Single(dia.Windows);
        Assert.Equal(Utc(2030, 6, 10, 12), janela.Start);
        Assert.Equal(Utc(2030, 6, 10, 15), janela.End);
    }

    [Fact]
    public void Disponibilidade_ignora_dias_sem_regra()
    {
        var agenda = Agenda(SP, [new AvailabilityRule(2, "09:00", "12:00")]); // só terça
        Assert.Empty(AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda));
    }

    [Theory]
    [InlineData("BLOCKED")]
    [InlineData("VACATION")]
    public void Bloqueio_ou_ferias_de_dia_inteiro_remove_o_dia(string tipo)
    {
        var agenda = Agenda(SP, [new AvailabilityRule(1, "09:00", "12:00")],
            [new ScheduleExceptionData(new DateOnly(2030, 6, 10), tipo, null, null)]);

        Assert.Empty(AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda));
    }

    [Fact]
    public void Bloqueio_parcial_no_meio_fragmenta_a_janela_em_duas()
    {
        var agenda = Agenda(SP, [new AvailabilityRule(1, "09:00", "18:00")],
            [new ScheduleExceptionData(new DateOnly(2030, 6, 10), "BLOCKED", "12:00", "14:00")]);

        var janelas = Assert.Single(AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda)).Windows;

        Assert.Equal(2, janelas.Count);
        Assert.Equal(Utc(2030, 6, 10, 12), janelas[0].Start);  // 09:00 local
        Assert.Equal(Utc(2030, 6, 10, 15), janelas[0].End);    // 12:00 local
        Assert.Equal(Utc(2030, 6, 10, 17), janelas[1].Start);  // 14:00 local
        Assert.Equal(Utc(2030, 6, 10, 21), janelas[1].End);    // 18:00 local
    }

    [Fact]
    public void Bloqueio_que_cobre_a_janela_toda_remove_o_dia()
    {
        var agenda = Agenda(SP, [new AvailabilityRule(1, "09:00", "12:00")],
            [new ScheduleExceptionData(new DateOnly(2030, 6, 10), "BLOCKED", "08:00", "13:00")]);

        Assert.Empty(AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda));
    }

    [Fact]
    public void Override_substitui_as_janelas_do_dia()
    {
        var agenda = Agenda(SP, [new AvailabilityRule(1, "09:00", "18:00")],
            [new ScheduleExceptionData(new DateOnly(2030, 6, 10), "OVERRIDE", "10:00", "11:00")]);

        var janela = Assert.Single(Assert.Single(AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda)).Windows);

        Assert.Equal(Utc(2030, 6, 10, 13), janela.Start);
        Assert.Equal(Utc(2030, 6, 10, 14), janela.End);
    }

    [Fact]
    public void Excecao_de_outra_data_nao_afeta_o_dia()
    {
        var agenda = Agenda(SP, [new AvailabilityRule(1, "09:00", "12:00")],
            [new ScheduleExceptionData(new DateOnly(2030, 6, 17), "BLOCKED", null, null)]);

        Assert.Single(AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda));
    }

    [Fact]
    public void Duas_regras_no_mesmo_dia_geram_duas_janelas()
    {
        var agenda = Agenda(SP, [new AvailabilityRule(1, "08:00", "12:00"), new AvailabilityRule(1, "14:00", "18:00")]);
        Assert.Equal(2, Assert.Single(AvailabilityCalculator.BuildAvailableWindows(agenda, Segunda, Segunda)).Windows.Count);
    }

    [Fact]
    public void Disponibilidade_acompanha_o_horario_de_verao_do_fuso_do_profissional()
    {
        var agenda = Agenda(NY, [new AvailabilityRule(1, "09:00", "10:00")]);

        // Segunda 2030-03-04 (EST) e segunda 2030-03-11 (EDT, após a virada de 10/03).
        var inverno = AvailabilityCalculator.BuildAvailableWindows(agenda, Utc(2030, 3, 4, 17), Utc(2030, 3, 4, 17));
        var verao = AvailabilityCalculator.BuildAvailableWindows(agenda, Utc(2030, 3, 11, 17), Utc(2030, 3, 11, 17));

        Assert.Equal(14, inverno[0].Windows[0].Start.Hour);
        Assert.Equal(13, verao[0].Windows[0].Start.Hour);
    }

    // ---------- SlotCalculator ----------

    private static List<DayAvailability> Dia(DateTime inicio, DateTime fim) =>
        [new DayAvailability(inicio.Date, 1, [new TimeRange(inicio, fim)])];

    private static SlotInput Entrada(int duracao, int antes = 0, int depois = 0, int? limite = null) =>
        new(duracao, antes, depois, Utc(2030, 1, 1), Utc(2030, 12, 31), SP, limite);

    [Fact]
    public void Slots_cobrem_a_janela_em_blocos_da_duracao()
    {
        var slots = SlotCalculator.ComputeAvailableSlots(Dia(Utc(2030, 6, 10, 12), Utc(2030, 6, 10, 15)), [], Entrada(30));
        Assert.Equal(6, slots.Count);
        Assert.Equal(Utc(2030, 6, 10, 12), slots[0].StartUtc);
        Assert.Equal(Utc(2030, 6, 10, 15), slots[^1].EndUtc);
    }

    [Fact]
    public void Slot_ocupado_por_agendamento_nao_e_oferecido()
    {
        var ocupado = new BookingConflict(Utc(2030, 6, 10, 13), Utc(2030, 6, 10, 13, 30));

        var slots = SlotCalculator.ComputeAvailableSlots(Dia(Utc(2030, 6, 10, 12), Utc(2030, 6, 10, 15)), [ocupado], Entrada(30));

        Assert.Equal(5, slots.Count);
        Assert.DoesNotContain(slots, s => s.StartUtc == Utc(2030, 6, 10, 13));
    }

    [Fact]
    public void Buffers_do_agendamento_existente_tambem_bloqueiam_horarios_vizinhos()
    {
        var ocupado = new BookingConflict(Utc(2030, 6, 10, 13), Utc(2030, 6, 10, 13, 30));

        var slots = SlotCalculator.ComputeAvailableSlots(Dia(Utc(2030, 6, 10, 12), Utc(2030, 6, 10, 15)), [ocupado], Entrada(30, antes: 0, depois: 15));

        // Nenhum slot pode começar dentro de 13:00-13:45 (consulta + buffer depois).
        Assert.DoesNotContain(slots, s => s.StartUtc >= Utc(2030, 6, 10, 13) && s.StartUtc < Utc(2030, 6, 10, 13, 45));
    }

    [Fact]
    public void Slots_nunca_se_sobrepoem_a_agendamentos_existentes()
    {
        var existentes = new[]
        {
            new BookingConflict(Utc(2030, 6, 10, 12, 30), Utc(2030, 6, 10, 13)),
            new BookingConflict(Utc(2030, 6, 10, 14), Utc(2030, 6, 10, 14, 30)),
        };

        var slots = SlotCalculator.ComputeAvailableSlots(Dia(Utc(2030, 6, 10, 12), Utc(2030, 6, 10, 16)), existentes, Entrada(30, 5, 5));

        Assert.NotEmpty(slots);
        foreach (var s in slots)
            Assert.DoesNotContain(existentes, b => TimeUtils.RangesOverlap(s.StartUtc, s.EndUtc, b.StartTime, b.EndTime));
    }

    [Fact]
    public void Slots_no_passado_sao_descartados()
    {
        var ontem = DateTime.UtcNow.Date.AddDays(-1);
        var slots = SlotCalculator.ComputeAvailableSlots(
            [new DayAvailability(ontem, 1, [new TimeRange(ontem.AddHours(12), ontem.AddHours(15))])], [], Entrada(30));
        Assert.Empty(slots);
    }

    [Fact]
    public void Limite_de_dias_a_frente_corta_datas_alem_do_limite()
    {
        var hoje = DateTime.UtcNow.Date;
        var perto = hoje.AddDays(3);
        var longe = hoje.AddDays(40);
        var dias = new List<DayAvailability>
        {
            new(perto, 1, [new TimeRange(perto.AddHours(15), perto.AddHours(16))]),
            new(longe, 1, [new TimeRange(longe.AddHours(15), longe.AddHours(16))]),
        };

        var slots = SlotCalculator.ComputeAvailableSlots(dias, [], Entrada(30, limite: 14));

        Assert.All(slots, s => Assert.True(s.StartUtc < hoje.AddDays(15)));
        Assert.NotEmpty(slots);
    }

    [Fact]
    public void GroupByDate_agrupa_pelo_dia_local_do_visitante()
    {
        var slots = new List<Slot>
        {
            new(Utc(2030, 6, 11, 1), Utc(2030, 6, 11, 1, 30)),  // 22:00 de 10/06 em SP
            new(Utc(2030, 6, 11, 13), Utc(2030, 6, 11, 13, 30)), // 10:00 de 11/06 em SP
        };

        var grupos = SlotCalculator.GroupByDate(slots, SP);

        Assert.Equal(["2030-06-10", "2030-06-11"], grupos.Keys.OrderBy(k => k).ToArray());
    }
}
