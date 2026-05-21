import { prisma } from "./lib/prisma"
import { createBooking } from "./lib/actions/booking"

async function main() {
  const eventType = await prisma.eventType.findFirst({
    include: {
      user: {
        include: {
          schedules: {
            include: {
              availabilities: true
            }
          }
        }
      }
    }
  })

  if (!eventType) {
    console.log("No EventType found in database. Please seed the db.")
    process.exit(1)
  }

  const user = eventType.user;
  const schedule = user.schedules[0];

  if (!schedule || schedule.availabilities.length === 0) {
    console.log("No availabilities found.")
    process.exit(1)
  }

  const availability = schedule.availabilities[0]
  // Find next occurrence of availability.dayOfWeek
  const now = new Date()
  let targetDate = new Date(now)
  targetDate.setDate(now.getDate() + 1) // start from tomorrow
  while (targetDate.getDay() !== availability.dayOfWeek) {
    targetDate.setDate(targetDate.getDate() + 1)
  }

  const [startHour, startMin] = availability.startTime.split(':').map(Number)
  targetDate.setHours(startHour, startMin, 0, 0)

  const startTimeUtc = targetDate.toISOString()
  const endTimeDate = new Date(targetDate)
  endTimeDate.setMinutes(endTimeDate.getMinutes() + eventType.duration)
  const endTimeUtc = endTimeDate.toISOString()

  console.log(`Trying to book slot: ${startTimeUtc} to ${endTimeUtc}`)

  const input1 = {
    ownerId: user.id,
    eventTypeId: eventType.id,
    guestName: "Guest One",
    guestEmail: "guest1@example.com",
    startTimeUtc,
    endTimeUtc,
    guestTimeZone: "America/Sao_Paulo",
  }

  const input2 = {
    ownerId: user.id,
    eventTypeId: eventType.id,
    guestName: "Guest Two",
    guestEmail: "guest2@example.com",
    startTimeUtc,
    endTimeUtc,
    guestTimeZone: "America/Sao_Paulo",
  }

  console.log("Firing concurrent requests...")

  const results = await Promise.all([
    createBooking(input1 as any),
    createBooking(input2 as any)
  ])

  console.log(JSON.stringify(results, null, 2))

  // clean up
  const successfulBookings = results.filter(r => r.status === "success")
  for (const b of successfulBookings) {
    if (b.status === "success") {
      await prisma.booking.delete({ where: { uid: b.data.uid } })
      console.log(`Deleted test booking ${b.data.uid}`)
    }
  }

  if (successfulBookings.length === 1 && results.some(r => r.status === "conflict")) {
    console.log("SUCCESS: Double-booking prevented!")
  } else {
    console.error("FAILED: Concurrency issue or other error")
  }

  process.exit(0)
}

main().catch(console.error)
