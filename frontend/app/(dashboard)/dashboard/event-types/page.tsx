import type { Metadata } from "next"
import { EventTypeList } from "@/components/event-types/event-type-list"
import { requireOnboarded } from "@/lib/auth/guards"
import { serverApiFetch } from "@/lib/api/http-client"
import { endpoints } from "@/lib/api/endpoints"
import type { EventTypeDetailDto, EventTypeSummaryDto, TeamSummaryDto } from "@/lib/api/types"

export const metadata: Metadata = { title: "Tipos de consulta" }

/**
 * Lista de tipos de consulta — 100% via API .NET (`GET /event-types` + `GET /event-types/{id}` por item,
 * que traz buffers, limite de agenda, local e perguntas para o formulário de edição).
 */
export default async function EventTypesPage() {
  const user = await requireOnboarded()

  const [items, teams] = await Promise.all([
    serverApiFetch<EventTypeSummaryDto[]>(endpoints.eventTypes.root),
    serverApiFetch<TeamSummaryDto[]>(endpoints.teams.root).catch(() => [] as TeamSummaryDto[]),
  ])

  const details = await Promise.all(
    (items ?? []).map((e) =>
      serverApiFetch<EventTypeDetailDto>(endpoints.eventTypes.byId(e.id)).catch(() => null),
    ),
  )

  const eventTypes = (items ?? []).map((e, i) => {
    const d = details[i]
    return {
      id: e.id,
      title: e.title,
      slug: e.slug,
      description: e.description,
      duration: e.duration,
      color: e.color,
      isActive: e.isActive,
      requiresConfirm: e.requiresConfirm,
      beforeEventBuffer: d?.beforeEventBuffer ?? 0,
      afterEventBuffer: d?.afterEventBuffer ?? 0,
      bookingLimitDays: d?.bookingLimitDays ?? null,
      locationType: e.locationType,
      locationValue: d?.locationValue ?? null,
      price: e.price,
      payOnSite: d?.payOnSite ?? e.payOnSite ?? false,
      questions: d?.questions ?? [],
      teamId: null as string | null,
      _count: { bookings: e.bookingCount },
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>Tipos de consulta</h1>
        <p className="text-muted-foreground mt-1">
          Crie os serviços que seus pacientes podem agendar — com duração, local e preço.
        </p>
      </div>

      <EventTypeList
        eventTypes={eventTypes as never}
        username={user.username ?? ""}
        teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  )
}
