// emails/booking-cancelled.tsx
import {
  Body, Container, Head, Heading, Hr,
  Html, Link, Preview, Section, Text,
} from "@react-email/components"
import type { BookingEmailData } from "@/lib/email/templates"
import { formatBookingDate, formatBookingTime } from "@/lib/email/templates"

interface Props {
  data: BookingEmailData
  cancelReason: string | null
  appUrl: string
}

export function BookingCancelledEmail({ data, cancelReason, appUrl }: Props) {
  const dateLabel = formatBookingDate(data.startTime, data.guestTimeZone)
  const timeLabel = formatBookingTime(data.startTime, data.endTime, data.guestTimeZone)
  const bookUrl   = `${appUrl}/${data.ownerName}`

  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Agendamento cancelado — {data.eventTitle}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ marginBottom: "32px" }}>
            <Heading style={styles.logo}>People OS</Heading>
          </Section>

          <Section style={{ marginBottom: "16px" }}>
            <Text style={styles.badge}>✕ Cancelado</Text>
          </Section>

          <Heading style={styles.heading}>Agendamento cancelado</Heading>
          <Text style={styles.subtext}>
            Olá, {data.guestName}. O agendamento abaixo foi cancelado.
          </Text>

          <Section style={styles.card}>
            <Text style={styles.cardRow}>
              <span style={styles.cardLabel}>Evento</span>
              <span style={styles.cardValue}>{data.eventTitle}</span>
            </Text>
            <Hr style={styles.hr} />
            <Text style={styles.cardRow}>
              <span style={styles.cardLabel}>Data</span>
              <span style={styles.cardValue}>{dateLabel}</span>
            </Text>
            <Hr style={styles.hr} />
            <Text style={styles.cardRow}>
              <span style={styles.cardLabel}>Horário</span>
              <span style={styles.cardValue}>{timeLabel}</span>
            </Text>
            {cancelReason && (
              <>
                <Hr style={styles.hr} />
                <Text style={styles.cardRow}>
                  <span style={styles.cardLabel}>Motivo</span>
                  <span style={styles.cardValue}>{cancelReason}</span>
                </Text>
              </>
            )}
          </Section>

          <Section style={{ textAlign: "center", marginBottom: "32px" }}>
            <Link href={bookUrl} style={styles.cta}>
              Reagendar
            </Link>
          </Section>

          <Hr style={styles.hr} />
          <Text style={styles.footer}>People OS · Agendamento inteligente</Text>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body:       { backgroundColor: "#09090b", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", margin: "0", padding: "0" },
  container:  { maxWidth: "520px", margin: "0 auto", padding: "40px 24px" },
  logo:       { color: "#a78bfa", fontSize: "20px", fontWeight: "600", margin: "0" },
  badge:      { display: "inline-block", backgroundColor: "#1a0505", color: "#f87171", fontSize: "13px", fontWeight: "500", padding: "4px 12px", borderRadius: "99px", margin: "0" },
  heading:    { color: "#fafafa", fontSize: "24px", fontWeight: "600", lineHeight: "1.3", margin: "0 0 12px" },
  subtext:    { color: "#a1a1aa", fontSize: "15px", lineHeight: "1.6", margin: "0 0 28px" },
  card:       { backgroundColor: "#18181b", borderRadius: "12px", border: "1px solid #27272a", padding: "4px 20px", marginBottom: "28px" },
  cardRow:    { display: "flex", justifyContent: "space-between", margin: "12px 0", fontSize: "13px" },
  cardLabel:  { color: "#71717a" },
  cardValue:  { color: "#e4e4e7", fontWeight: "500" },
  hr:         { borderColor: "#27272a", margin: "0" },
  cta:        { backgroundColor: "#7c3aed", color: "#fff", fontSize: "14px", fontWeight: "500", padding: "12px 32px", borderRadius: "10px", textDecoration: "none", display: "inline-block" },
  footer:     { color: "#3f3f46", fontSize: "12px", textAlign: "center" as const, margin: "0" },
}