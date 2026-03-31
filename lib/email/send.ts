import { resend, FROM_EMAIL, APP_URL } from "./resend"
import { render } from "@react-email/components"
import { BookingConfirmedEmail } from "@/emails/booking-confirmed"
import { BookingPendingEmail }   from "@/emails/booking-pending"
import { BookingCancelledEmail } from "@/emails/booking-cancelled"
import { BookingOwnerNotifyEmail } from "@/emails/booking-owner-notify"
import type { BookingEmailData } from "./templates"

type EmailResult =
  | { success: true;  id: string }
  | { success: false; error: string }

// ─── Confirmação para o convidado ─────────────────────────────────────────────

export async function sendBookingConfirmedEmail(
  data: BookingEmailData
): Promise<EmailResult> {
  try {
    const html = await render(
      BookingConfirmedEmail({ data, appUrl: APP_URL })
    )
    const { data: result, error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      data.guestEmail,
      subject: `✓ Confirmado: ${data.eventTitle} com ${data.ownerName}`,
      html,
    })
    if (error || !result?.id) {
      return { success: false, error: error?.message ?? "Erro desconhecido." }
    }
    return { success: true, id: result.id }
  } catch (err) {
    console.error("[sendBookingConfirmedEmail]", err)
    return { success: false, error: "Falha ao enviar e-mail de confirmação." }
  }
}

// ─── Solicitação pendente para o convidado ────────────────────────────────────

export async function sendBookingPendingEmail(
  data: BookingEmailData
): Promise<EmailResult> {
  try {
    const html = await render(
      BookingPendingEmail({ data, appUrl: APP_URL })
    )
    const { data: result, error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      data.guestEmail,
      subject: `⏳ Solicitação enviada: ${data.eventTitle} com ${data.ownerName}`,
      html,
    })
    if (error || !result?.id) {
      return { success: false, error: error?.message ?? "Erro desconhecido." }
    }
    return { success: true, id: result.id }
  } catch (err) {
    console.error("[sendBookingPendingEmail]", err)
    return { success: false, error: "Falha ao enviar e-mail de pendência." }
  }
}

// ─── Cancelamento para ambas as partes ───────────────────────────────────────

export async function sendBookingCancelledEmail(
  data: BookingEmailData,
  cancelReason: string | null,
  notifyOwner = false
): Promise<EmailResult> {
  try {
    const html = await render(
      BookingCancelledEmail({ data, cancelReason, appUrl: APP_URL })
    )

    // Envia para o convidado
    const { data: result, error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      data.guestEmail,
      subject: `Agendamento cancelado: ${data.eventTitle}`,
      html,
    })

    if (error || !result?.id) {
      return { success: false, error: error?.message ?? "Erro desconhecido." }
    }

    // Notifica o dono também se necessário
    if (notifyOwner) {
      const ownerHtml = await render(
        BookingCancelledEmail({
          data: { ...data, guestEmail: data.ownerEmail },
          cancelReason,
          appUrl: APP_URL,
        })
      )
      await resend.emails.send({
        from:    FROM_EMAIL,
        to:      data.ownerEmail,
        subject: `Agendamento cancelado por ${data.guestName}: ${data.eventTitle}`,
        html:    ownerHtml,
      })
    }

    return { success: true, id: result.id }
  } catch (err) {
    console.error("[sendBookingCancelledEmail]", err)
    return { success: false, error: "Falha ao enviar e-mail de cancelamento." }
  }
}

// ─── Notificação para o dono da agenda ───────────────────────────────────────

export async function sendOwnerNotifyEmail(
  data: BookingEmailData
): Promise<EmailResult> {
  try {
    const html = await render(
      BookingOwnerNotifyEmail({ data, appUrl: APP_URL })
    )
    const { data: result, error } = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      data.ownerEmail,
      subject: `Novo agendamento: ${data.guestName} — ${data.eventTitle}`,
      html,
    })
    if (error || !result?.id) {
      return { success: false, error: error?.message ?? "Erro desconhecido." }
    }
    return { success: true, id: result.id }
  } catch (err) {
    console.error("[sendOwnerNotifyEmail]", err)
    return { success: false, error: "Falha ao enviar notificação ao dono." }
  }
}