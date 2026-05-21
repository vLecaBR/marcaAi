import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"

// In a real application, you'd want to verify the MercadoPago signature
// using x-signature or checking the IP, but for this prototype we'll
// just do a basic verification.

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const topic = url.searchParams.get("topic") ?? url.searchParams.get("type")
    
    // Mercado Pago webhook can come in query params or body
    // "payment" topic is what we care about
    
    let paymentId: string | null = url.searchParams.get("data.id")
    
    if (!paymentId) {
      const body = await req.json().catch(() => ({}))
      if (body.type === "payment" && body.data?.id) {
        paymentId = body.data.id.toString()
      } else if (body.action === "payment.created" || body.action === "payment.updated") {
        paymentId = body.data?.id?.toString()
      }
    }

    if (!paymentId) {
      return NextResponse.json({ status: "ignored", message: "Not a payment event or missing ID" })
    }

    // Usually you would query MercadoPago API to get the payment details
    // using `paymentId` to confirm it's actually PAID.
    // For this prototype, we'll assume it's paid or just fetch it if we have the token.
    const token = env.MERCADOPAGO_ACCESS_TOKEN
    if (!token) {
      return NextResponse.json({ status: "error", message: "Missing token" }, { status: 500 })
    }

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!mpResponse.ok) {
      return NextResponse.json({ status: "error", message: "Failed to fetch payment" }, { status: 500 })
    }

    const paymentData = await mpResponse.json()

    if (paymentData.status === "approved") {
      const externalReference = paymentData.external_reference // This is our booking UID
      
      if (externalReference) {
        const booking = await prisma.booking.findUnique({
          where: { uid: externalReference },
          include: { eventType: true }
        })

        if (booking && booking.paymentStatus !== "PAID") {
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              paymentStatus: "PAID",
              // If it doesn't require confirm, we could set status: CONFIRMED here
              status: booking.eventType.requiresConfirm ? "PENDING" : "CONFIRMED"
            }
          })

          // Here we would ideally trigger the same email/WhatsApp notifications
          // that are sent on confirmation, but to keep the prototype simple
          // we'll just update the status.
        }
      }
    }

    return NextResponse.json({ status: "success" })
  } catch (error) {
    console.error("[MercadoPago Webhook]", error)
    return NextResponse.json({ status: "error", message: "Internal server error" }, { status: 500 })
  }
}
