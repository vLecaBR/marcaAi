import {
  Body, Container, Head, Heading, Hr, Html,
  Link, Preview, Section, Text, Row, Column,
} from "@react-email/components"
import type { BookingEmailData } from "@/lib/email/templates"
import {
  formatBookingDate,
  formatBookingTime,
  LOCATION_LABELS,
} from "@/lib/email/templates"

interface Props {
  data: BookingEmailData
  appUrl: string
}

export function BookingConfirmedEmail({ data, appUrl }: Props) {
  const dateLabel = formatBookingDate(data.startTime, data.guestTimeZone)
  const timeLabel = formatBookingTime(data.startTime, data.endTime, data.guestTimeZone)
  const confirmUrl = `${appUrl}/booking/${data.uid}`
  const cancelUrl  = `${appUrl}/booking/${data.uid}/cancel`

  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>
        Agendamento confirmado — {data.eventTitle} com {data.ownerName}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>

          {/* Header */}
          <Section style={styles.header}>
            <Heading style={styles.logo}>People OS</Heading>
          </Section>

          {/* Status badge */}
          <Section style={styles.badgeSection}>
            <Text style={styles.badge}>✓ Confirmado</Text>
          </Section>

          {/* Title */}
          <Heading style={styles.heading}>
            Seu agendamento está confirmado
          </Heading>
          <Text style={styles.subtext}>
            Olá, {data.guestName}. Seu horário com{" "}
            <strong>{data.ownerName}</strong> foi confirmado.
          </Text>

          {/* Detalhes */}
          <Section style={styles.card}>
            <DetailRow label="Evento"   value={data.eventTitle} />
            <Hr style={styles.cardDivider} />
            
            {data.allBookings && data.allBookings.length > 1 ? (
              <DetailRow
                label="Sessões"
                value={
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {data.allBookings.map((b, i) => (
                      <span key={i}>
                        {formatBookingDate(b.startTime, data.guestTimeZone)} • {formatBookingTime(b.startTime, b.endTime, data.guestTimeZone)}
                      </span>
                    ))}
                  </div>
                }
              />
            ) : (
              <>
                <DetailRow label="Data"     value={dateLabel} />
                <Hr style={styles.cardDivider} />
                <DetailRow label="Horário"  value={timeLabel} />
              </>
            )}

            <Hr style={styles.cardDivider} />
            <DetailRow
              label="Local"
              value={LOCATION_LABELS[data.locationType] ?? "Online"}
            />
            {data.meetingUrl && (
              <>
                <Hr style={styles.cardDivider} />
                <DetailRow
                  label="Link"
                  value={data.meetingUrl}
                  isLink
                />
              </>
            )}
            <Hr style={styles.cardDivider} />
            <DetailRow label="Fuso horário" value={data.guestTimeZone} />
          </Section>

          {/* CTAs */}
          <Section style={styles.ctaSection}>
            <Link href={confirmUrl} style={styles.ctaPrimary}>
              Ver detalhes
            </Link>
          </Section>

          <Text style={styles.cancelText}>
            Precisou cancelar?{" "}
            <Link href={cancelUrl} style={styles.cancelLink}>
              Clique aqui para cancelar
            </Link>
          </Text>

          <Hr style={styles.divider} />
          <Text style={styles.footer}>
            People OS · Agendamento inteligente
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function DetailRow({
  label,
  value,
  isLink,
}: {
  label: string
  value: React.ReactNode
  isLink?: boolean
}) {
  return (
    <Row style={styles.detailRow}>
      <Column style={styles.detailLabel}>{label}</Column>
      <Column style={styles.detailValue}>
        {isLink && typeof value === "string" ? (
          <Link href={value} style={styles.detailLink}>
            Entrar na reunião
          </Link>
        ) : (
          value
        )}
      </Column>
    </Row>
  )
}

const styles = {
  body: {
    backgroundColor: "#09090b",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    margin: "0",
    padding: "0",
  },
  container: {
    maxWidth: "520px",
    margin: "0 auto",
    padding: "40px 24px",
  },
  header: {
    marginBottom: "32px",
  },
  logo: {
    color: "#a78bfa",
    fontSize: "20px",
    fontWeight: "600",
    margin: "0",
  },
  badgeSection: {
    marginBottom: "16px",
  },
  badge: {
    display: "inline-block",
    backgroundColor: "#052e16",
    color: "#34d399",
    fontSize: "13px",
    fontWeight: "500",
    padding: "4px 12px",
    borderRadius: "99px",
    margin: "0",
  },
  heading: {
    color: "#fafafa",
    fontSize: "24px",
    fontWeight: "600",
    lineHeight: "1.3",
    margin: "0 0 12px",
  },
  subtext: {
    color: "#a1a1aa",
    fontSize: "15px",
    lineHeight: "1.6",
    margin: "0 0 28px",
  },
  card: {
    backgroundColor: "#18181b",
    borderRadius: "12px",
    border: "1px solid #27272a",
    padding: "4px 20px",
    marginBottom: "28px",
  },
  cardDivider: {
    borderColor: "#27272a",
    margin: "0",
  },
  detailRow: {
    padding: "12px 0",
  },
  detailLabel: {
    color: "#71717a",
    fontSize: "13px",
    width: "120px",
    verticalAlign: "top" as const,
  },
  detailValue: {
    color: "#e4e4e7",
    fontSize: "13px",
    fontWeight: "500",
    verticalAlign: "top" as const,
  },
  detailLink: {
    color: "#a78bfa",
    textDecoration: "none",
  },
  ctaSection: {
    textAlign: "center" as const,
    marginBottom: "16px",
  },
  ctaPrimary: {
    backgroundColor: "#7c3aed",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "500",
    padding: "12px 32px",
    borderRadius: "10px",
    textDecoration: "none",
    display: "inline-block",
  },
  cancelText: {
    color: "#71717a",
    fontSize: "13px",
    textAlign: "center" as const,
    margin: "0 0 32px",
  },
  cancelLink: {
    color: "#71717a",
    textDecoration: "underline",
  },
  divider: {
    borderColor: "#27272a",
    margin: "0 0 24px",
  },
  footer: {
    color: "#3f3f46",
    fontSize: "12px",
    textAlign: "center" as const,
    margin: "0",
  },
}