import { prisma } from "@/lib/prisma"

const GOOGLE_OAUTH_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3"

/**
 * Gets a valid access token for the given user.
 * If the current token is expired, it uses the refresh token to get a new one
 * and updates the database.
 */
async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  })

  if (!account) return null

  // If token is valid for at least 5 more minutes
  if (account.expires_at && account.expires_at * 1000 > Date.now() + 5 * 60 * 1000) {
    return account.access_token
  }

  // Token is expired, need to refresh
  if (!account.refresh_token) {
    console.warn(`[Google Auth] No refresh token found for user ${userId}`)
    return null
  }

  try {
    const response = await fetch(GOOGLE_OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    })

    const tokens = await response.json()

    if (!response.ok) {
      console.error("[Google Auth] Failed to refresh token", tokens)
      return null
    }

    // Update database with new tokens
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token,
        expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
        // Google sometimes sends a new refresh token, if not, keep the old one
        refresh_token: tokens.refresh_token ?? account.refresh_token,
      },
    })

    return tokens.access_token
  } catch (err) {
    console.error("[Google Auth] Error refreshing token", err)
    return null
  }
}

/**
 * Fetches busy slots from the user's primary Google Calendar.
 * Uses the FreeBusy API which is very fast and efficient.
 */
export async function getGoogleCalendarBusySlots(
  userId: string,
  timeMin: Date,
  timeMax: Date
): Promise<{ start: Date; end: Date }[]> {
  const accessToken = await getValidAccessToken(userId)

  if (!accessToken) {
    // If no access token (e.g., user not connected with Google), we return empty busy array
    return []
  }

  try {
    const response = await fetch(`${GOOGLE_CALENDAR_API_URL}/freeBusy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: "primary" }],
      }),
    })

    if (!response.ok) {
      console.error("[Google Calendar] FreeBusy API error", await response.text())
      return []
    }

    const data = await response.json()
    const busy = data.calendars.primary.busy as { start: string; end: string }[]

    if (!busy) return []

    return busy.map((slot) => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }))
  } catch (err) {
    console.error("[Google Calendar] Error fetching busy slots", err)
    return []
  }
}
