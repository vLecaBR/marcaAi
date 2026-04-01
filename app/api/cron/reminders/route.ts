import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendWhatsAppReminder } from "@/lib/whatsapp/send"
import { APP_URL } from "@/lib/email/resend"

// Você pode rodar isso com Vercel Cron a cada hora, por exemplo.
// Opcional: Proteger a rota usando um header de Authorization.
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    // Em produção, configure a variável de ambiente CRON_SECRET
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new NextResponse("Unauthorized", { status: 401 })
    }

    const now = new Date()
    
    // Queremos lembretes para agendamentos que acontecem entre agora e as próximas 2 horas
    const next2h = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    const upcomingBookings = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        reminderSent: false,
        startTime: {
          gte: now,
          lte: next2h,
        },
      },
      include: {
        eventType: {
          select: {
            title: true,
            user: { select: { name: true } },
          },
        },
      },
      take: 50, // Processa em lotes para não estourar tempo de execução
    })

    if (upcomingBookings.length === 0) {
      return NextResponse.json({ success: true, message: "Nenhum lembrete pendente." })
    }

    let sentCount = 0

    for (const booking of upcomingBookings) {
      // Prioridade: WhatsApp. Se quiser também enviar email, só adicionar a função aqui.
      if (booking.guestPhone) {
        await sendWhatsAppReminder({
          phone: booking.guestPhone,
          guestName: booking.guestName,
          eventTitle: booking.eventType.title,
          ownerName: booking.eventType.user.name ?? "Organizador",
          startTime: booking.startTime,
          appUrl: APP_URL,
          uid: booking.uid,
        })
      }

      // Marcar como enviado
      await prisma.booking.update({
        where: { id: booking.id },
        data: { reminderSent: true },
      })
      
      sentCount++
    }

    return NextResponse.json({ success: true, sent: sentCount })
  } catch (error) {
    console.error("[Cron Reminders]", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
