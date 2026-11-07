import { redirect } from "next/navigation"

/**
 * Agendamento com um profissional dentro do contexto da clínica.
 * Redireciona para a página individual do profissional (agendamento), que já é servida pela API.
 */
export default async function TeamMemberPublicPage({
  params,
}: {
  params: Promise<{ slug: string; username: string }>
}) {
  const { username } = await params
  redirect(`/${username}`)
}
