"use server"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { cancelBooking } from "@/lib/actions/booking"
import { createGoogleCalendarEvent } from "@/lib/google/calendar"
import { sendBookingConfirmedEmail } from "@/lib/email/send"
import { sendWhatsAppConfirmation } from "@/lib/whatsapp/send"
import { APP_URL } from "@/lib/email/resend"

export async function approveBookingAction(uid: string) {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado" }

  const booking = await prisma.booking.findUnique({
    where: { uid },
    include: {
      eventType: {
        select: {
          title: true,
          locationType: true,
          locationValue: true,
          user: { select: { name: true, email: true, timeZone: true } },
        },
      },
    },
  })

  if (!booking || booking.userId !== session.user.id) {
    return { success: false, error: "Agendamento não encontrado ou sem permissão" }
  }

  let finalMeetingUrl = booking.eventType.locationValue ?? null
  let finalMeetingId = null

  // Generate Google Calendar event & Meet link since it's now confirmed
  const eventResponse = await createGoogleCalendarEvent({
    userId: session.user.id,
    title: `${booking.eventType.title} com ${booking.guestName}`,
    description: `Agendamento via MarcaAí\n\nConvidado: ${booking.guestName} (${booking.guestEmail})\nNotas: ${booking.guestNotes ?? "Nenhuma"}`,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    createMeetLink: booking.eventType.locationType === "GOOGLE_MEET",
    recurringCount: undefined, // Só passa se quisermos forçar o gcal a repetir, mas a modelagem do MarcaAi gera Bookings separados.
  })

  if (eventResponse) {
    finalMeetingId = eventResponse.eventId
    if (eventResponse.meetLink) {
      finalMeetingUrl = eventResponse.meetLink
    }
  }

  await prisma.booking.update({
    where: { uid, userId: session.user.id },
    data: { 
      status: "CONFIRMED",
      meetingId: finalMeetingId,
      meetingUrl: finalMeetingUrl,
    },
  })

  // Emails and WhatsApp
  const emailData = {
    uid: booking.uid,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    ownerName: booking.eventType.user.name ?? "Organizador",
    ownerEmail: booking.eventType.user.email,
    eventTitle: booking.eventType.title,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guestTimeZone: booking.guestTimeZone,
    ownerTimeZone: booking.eventType.user.timeZone,
    locationType: booking.eventType.locationType,
    meetingUrl: finalMeetingUrl,
    requiresConfirm: false,
  }

  void sendBookingConfirmedEmail(emailData).catch(err => console.error("[email approve dispatch]", err))

  if (booking.guestPhone) {
    void sendWhatsAppConfirmation({
      phone: booking.guestPhone,
      guestName: booking.guestName,
      eventTitle: booking.eventType.title,
      ownerName: booking.eventType.user.name ?? "Organizador",
      startTime: booking.startTime,
      appUrl: APP_URL,
      uid: booking.uid,
    }).catch(err => console.error("[whatsapp approve dispatch]", err))
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/bookings")

  return { success: true }
}

export async function rejectBookingAction(uid: string, reason: string) {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "Não autorizado" }

  const booking = await prisma.booking.findUnique({
    where: { uid },
    select: { userId: true },
  })

  if (!booking || booking.userId !== session.user.id) {
    return { success: false, error: "Agendamento não encontrado ou sem permissão" }
  }

  const result = await cancelBooking(uid, reason, "OWNER")

  if (result.status === "success") {
    revalidatePath("/dashboard")
    revalidatePath("/dashboard/bookings")
    return { success: true }
  }

  return { success: false, error: result.message ?? "Erro ao rejeitar" }
}
