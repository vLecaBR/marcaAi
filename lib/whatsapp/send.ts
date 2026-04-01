/**
 * Simulação de um serviço de envio de WhatsApp.
 * Na vida real, você ligaria isso à Evolution API, Z-API, Twilio, etc.
 */

export interface WhatsAppMessageData {
  phone: string
  guestName: string
  eventTitle: string
  ownerName: string
  startTime: Date
  appUrl: string
  uid: string
}

function formatPhone(phone: string): string | null {
  // Limpa todos os não números
  const cleaned = phone.replace(/\D/g, "")
  if (cleaned.length < 10) return null
  
  // Adiciona o código do Brasil se não tiver
  if (cleaned.length <= 11) {
    return `55${cleaned}`
  }
  return cleaned
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo"
  }).format(date)
}

// A base do envio que conectaria com a API terceira
async function dispatchWhatsAppMessage(phone: string, text: string) {
  const formattedPhone = formatPhone(phone)
  if (!formattedPhone) {
    console.log(`[WhatsApp] Telefone inválido: ${phone}`)
    return false
  }

  const apiUrl = process.env.WHATSAPP_API_URL
  const apiKey = process.env.WHATSAPP_API_KEY
  
  if (apiUrl && apiKey) {
    try {
      // Exemplo de integração padrão (Evolution API)
      const response = await fetch(`${apiUrl}/message/sendText/InstanceName`, {
        method: "POST",
        headers: { 
          "apikey": apiKey, 
          "Content-Type": "application/json" 
        },
        body: JSON.stringify({ 
          number: formattedPhone, 
          options: { delay: 1200, presence: "composing" }, 
          textMessage: { text } 
        })
      })

      if (!response.ok) {
        console.error("[WhatsApp] Erro na API", await response.text())
        return false
      }

      console.log(`[WhatsApp] Mensagem enviada para ${formattedPhone}`)
      return true
    } catch (err) {
      console.error("[WhatsApp] Erro ao enviar mensagem HTTP", err)
      return false
    }
  }

  // Fallback visual no console (modo de desenvolvimento/simulação)
  console.log(`\n\n=== 🟢 WHATSAPP (SIMULADO) ENVIADO PARA ${formattedPhone} ===\n${text}\n=========================================\n`)
  return true
}

export async function sendWhatsAppConfirmation(data: WhatsAppMessageData) {
  const text = `Olá, *${data.guestName}*! 👋\n\nSeu agendamento para *${data.eventTitle}* com ${data.ownerName} está *CONFIRMADO*.\n\n📅 Quando: ${formatDate(data.startTime)}\n\nPara gerenciar ou cancelar, acesse:\n${data.appUrl}/booking/${data.uid}`
  return dispatchWhatsAppMessage(data.phone, text)
}

export async function sendWhatsAppPending(data: WhatsAppMessageData) {
  const text = `Olá, *${data.guestName}*! ⏳\n\nSua solicitação de agendamento para *${data.eventTitle}* foi enviada para ${data.ownerName} e está aguardando aprovação.\n\n📅 Data sugerida: ${formatDate(data.startTime)}\n\nTe avisaremos assim que for confirmado!`
  return dispatchWhatsAppMessage(data.phone, text)
}

export async function sendWhatsAppReminder(data: WhatsAppMessageData) {
  const text = `Lembrete! ⏰\n\nOlá, *${data.guestName}*, você tem um agendamento hoje:\n\n*${data.eventTitle}* com ${data.ownerName}\n📅 Horário: ${formatDate(data.startTime)}\n\nPara cancelar ou ver detalhes:\n${data.appUrl}/booking/${data.uid}`
  return dispatchWhatsAppMessage(data.phone, text)
}

export async function sendWhatsAppCancellation(data: WhatsAppMessageData, reason: string | null) {
  const text = `Olá, *${data.guestName}*. ❌\n\nO agendamento para *${data.eventTitle}* em ${formatDate(data.startTime)} foi *CANCELADO*.\n\n${reason ? `Motivo: ${reason}` : ""}`
  return dispatchWhatsAppMessage(data.phone, text)
}
