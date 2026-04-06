// emails/booking-owner-notify.tsx
import {
  Body, Container, Head, Heading, Hr,
  Html, Link, Preview, Section, Text, Row, Column,
} from "@react-email/components"
import type { BookingEmailData } from "@/lib/email/templates"
import { formatBookingDate, formatBookingTime, LOCATION_LABELS } from "@/lib/email/templates"

interface Props {
  data: BookingEmailData
  appUrl: string
}

export function BookingOwnerNotifyEmail({ data, appUrl }: Props) {
  const dateLabel    = formatBookingDate(data.startTime, data.ownerTimeZone)
  const timeLabel    = formatBookingTime(data.startTime, data.endTime, data.ownerTimeZone)
  const dashboardUrl = `${appUrl}/dashboard`

  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>
        Novo agendamento de {data.guestName} — {data.eventTitle}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ marginBottom: "32px" }}>
            <Heading style={styles.logo}>People OS</Heading>
          </Section>

          <Heading style={styles.heading}>
            Novo agendamento recebido
          </Heading>
          <Text style={styles.subtext}>
            <strong style={{ color: "#fafafa" }}>{data.guestName}</strong>{" "}
            ({data.guestEmail}) agendou um horário com você.
          </Text>

          <Section style={styles.card}>
            <Row style={{ padding: "12px 0" }}>
              <Column style={styles.detailLabel}>Evento</Column>
              <Column style={styles.detailValue}>{data.eventTitle}</Column>
            </Row>
            <Hr style={{ borderColor: "#27272a", margin: "0" }} />

            {data.allBookings && data.allBookings.length > 1 ? (
              <>
                <Row style={{ padding: "12px 0" }}>
                  <Column style={styles.detailLabel}>Sessões</Column>
                  <Column style={styles.detailValue}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {data.allBookings.map((b, i) => (
                        <span key={i}>
                          {formatBookingDate(b.startTime, data.ownerTimeZone)} • {formatBookingTime(b.startTime, b.endTime, data.ownerTimeZone)}
                        </span>
                      ))}
                    </div>
                  </Column>
                </Row>
              </>
            ) : (
              <>
                <Row style={{ padding: "12px 0" }}>
                  <Column style={styles.detailLabel}>Data</Column>
                  <Column style={styles.detailValue}>{dateLabel}</Column>
                </Row>
                <Hr style={{ borderColor: "#27272a", margin: "0" }} />
                <Row style={{ padding: "12px 0" }}>
                  <Column style={styles.detailLabel}>Horário</Column>
                  <Column style={styles.detailValue}>{timeLabel}</Column>
                </Row>
              </>
            )}

            <Hr style={{ borderColor: "#27272a", margin: "0" }} />
            <Row style={{ padding: "12px 0" }}>
              <Column style={styles.detailLabel}>Local</Column>
              <Column style={styles.detailValue}>
                {LOCATION_LABELS[data.locationType] ?? "Online"}
              </Column>
            </Row>
            <Hr style={{ borderColor: "#27272a", margin: "0" }} />
            <Row style={{ padding: "12px 0" }}>
              <Column style={styles.detailLabel}>Fuso do cliente</Column>
              <Column style={styles.detailValue}>{data.guestTimeZone}</Column>
            </Row>
            {data.requiresConfirm && (
              <>
                <Hr style={{ borderColor: "#27272a", margin: "0" }} />
                <Row style={{ padding: "12px 0" }}>
                  <Column style={styles.detailLabel}>Status</Column>
                  <Column style={{ ...styles.detailValue, color: "#fbbf24" }}>
                    Aguardando sua confirmação
                  </Column>
                </Row>
              </>
            )}
          </Section>

          <Section style={{ textAlign: "center", marginBottom: "32px" }}>
            <Link href={dashboardUrl} style={styles.cta}>
              Ver no dashboard
            </Link>
          </Section>

          <Hr style={{ borderColor: "#27272a", margin: "0 0 24px" }} />
          <Text style={styles.footer}>People OS · Agendamento inteligente</Text>
        </Container>
      </Body>
    </Html>
  )
}

const styles = {
  body:        { backgroundColor: "#09090b", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", margin: "0", padding: "0" },
  container:   { maxWidth: "520px", margin: "0 auto", padding: "40px 24px" },
  logo:        { color: "#a78bfa", fontSize: "20px", fontWeight: "600", margin: "0" },
  heading:     { color: "#fafafa", fontSize: "24px", fontWeight: "600", lineHeight: "1.3", margin: "0 0 12px" },
  subtext:     { color: "#a1a1aa", fontSize: "15px", lineHeight: "1.6", margin: "0 0 28px" },
  card:        { backgroundColor: "#18181b", borderRadius: "12px", border: "1px solid #27272a", padding: "4px 20px", marginBottom: "28px" },
  detailLabel: { color: "#71717a", fontSize: "13px", width: "140px", verticalAlign: "top" as const },
  detailValue: { color: "#e4e4e7", fontSize: "13px", fontWeight: "500", verticalAlign: "top" as const },
  cta:         { backgroundColor: "#7c3aed", color: "#fff", fontSize: "14px", fontWeight: "500", padding: "12px 32px", borderRadius: "10px", textDecoration: "none", display: "inline-block" },
  footer:      { color: "#3f3f46", fontSize: "12px", textAlign: "center" as const, margin: "0" },
}