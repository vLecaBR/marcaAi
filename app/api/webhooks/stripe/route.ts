import { NextResponse } from "next/server"
import { stripe } from "@/lib/payments/stripe"
import { prisma } from "@/lib/prisma"
import { env } from "@/lib/env"
import type Stripe from "stripe"

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get("Stripe-Signature")

  if (!signature) {
    return new NextResponse("Webhook signature missing.", { status: 400 })
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not set")
    return new NextResponse("Internal Server Error", { status: 500 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error) {
    // 2. Nunca retornar error.message puro
    return new NextResponse("Webhook signature verification failed.", { status: 400 })
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any

      if (!session.subscription) {
        return new NextResponse("No subscription associated with checkout session", { status: 400 })
      }

      // 3. Substituir 'as any' pelos tipos do Stripe
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      )

      if (!session?.metadata?.teamId) {
        return new NextResponse("Team ID is required", { status: 400 })
      }

      const priceId = subscription.items.data[0]?.price.id
      if (!priceId) {
        throw new Error("No price ID found on subscription")
      }

      const customerId = typeof subscription.customer === 'string' 
        ? subscription.customer 
        : subscription.customer.id

      // 4. Envolver chamadas de db em try/catch, 500 pro stripe tentar dnv
      await prisma.subscription.upsert({
        where: { teamId: session.metadata.teamId },
        create: {
          teamId: session.metadata.teamId,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
          status: subscription.status,
        },
        update: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: customerId,
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
          status: subscription.status,
        },
      })
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as any

      if (!invoice.subscription) {
        return new NextResponse(null, { status: 200 })
      }

      const subscription = await stripe.subscriptions.retrieve(
        invoice.subscription as string
      )

      const priceId = subscription.items.data[0]?.price.id
      if (!priceId) {
        throw new Error("No price ID found on subscription")
      }

      await prisma.subscription.update({
        where: {
          stripeSubscriptionId: subscription.id,
        },
        data: {
          stripePriceId: priceId,
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
          status: subscription.status,
        },
      })
    }

    if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      // 3. O event.data.object para esses eventos já é Stripe.Subscription, sem necessidade do retrieve extra
      const subscription = event.data.object as any

      await prisma.subscription.update({
        where: {
          stripeSubscriptionId: subscription.id,
        },
        data: {
          status: subscription.status,
          stripeCurrentPeriodEnd: new Date(
            subscription.current_period_end * 1000
          ),
        },
      })
    }
  } catch (error) {
    console.error(`[STRIPE_WEBHOOK_ERROR] Failed to process event ${event.id}:`, error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
