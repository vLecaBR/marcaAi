import { formatInTimeZone } from "date-fns-tz"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export interface BookingEmailData {
  uid:             string
  guestName:       string
  guestEmail:      string
  ownerName:       string
  ownerEmail:      string
  eventTitle:      string
  startTime:       Date
  endTime:         Date
  guestTimeZone:   string
  ownerTimeZone:   string
  locationType:    string
  meetingUrl:      string | null
  requiresConfirm: boolean
  allBookings?:    { startTime: Date; endTime: Date }[]
}

export function formatBookingDate(date: Date, timeZone: string): string {
  return format(
    new Date(
      formatInTimeZone(date, timeZone, "yyyy-MM-dd") + "T12:00:00"
    ),
    "EEEE, d 'de' MMMM 'de' yyyy",
    { locale: ptBR }
  )
}

export function formatBookingTime(
  start: Date,
  end: Date,
  timeZone: string
): string {
  const s = formatInTimeZone(start, timeZone, "HH:mm")
  const e = formatInTimeZone(end,   timeZone, "HH:mm")
  return `${s} – ${e}`
}

export const LOCATION_LABELS: Record<string, string> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM:        "Zoom",
  TEAMS:       "Microsoft Teams",
  PHONE:       "Telefone",
  IN_PERSON:   "Presencial",
  CUSTOM:      "Online",
}