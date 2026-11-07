import type { Metadata } from "next"
import { LegalFooter } from "@/components/marketing/legal-footer"

export const metadata: Metadata = { title: "Política de Privacidade" }

/** Versão registrada no consentimento do paciente (`Privacy:PolicyVersion` no backend). */
const VERSAO = "rascunho-2026-11"

export default function PrivacidadePage() {
  const dpo = process.env.DPO_EMAIL?.trim()
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8 leading-relaxed">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <strong>Versão preliminar ({VERSAO}).</strong> Este texto está em revisão jurídica e pode mudar. Em caso de dúvida,
        fale com o encarregado pelo canal indicado ao final.
      </div>

      <header className="space-y-2">
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5 }}>Política de Privacidade</h1>
        <p className="text-muted-foreground">
          Como o MarcaAí trata dados pessoais, em linha com a Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>
      </header>

      <Section title="1. Quem é quem">
        <p>
          O MarcaAí é uma plataforma de agendamento e cobrança para profissionais e clínicas de saúde. Para os dados dos
          <strong> pacientes</strong> que agendam consultas, o <strong>profissional ou a clínica é o controlador</strong> (decide
          por que e como os dados são usados) e o <strong>MarcaAí atua como operador</strong>, tratando os dados em nome deles.
          Para os dados dos próprios profissionais (conta, assinatura, cobrança), o MarcaAí é o controlador.
        </p>
      </Section>

      <Section title="2. Quais dados tratamos">
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Paciente:</strong> nome, e-mail, telefone, observações e respostas ao formulário pré-consulta, data e horário da consulta. Podem revelar informações de <strong>saúde</strong> (dado pessoal sensível).</li>
          <li><strong>Profissional:</strong> nome, e-mail, perfil público, especialidade, conselho e nº de registro, clínica, agenda e dados de recebimento.</li>
          <li><strong>Pagamento:</strong> processado pelo Stripe e pelo Mercado Pago; o MarcaAí não armazena número de cartão.</li>
          <li><strong>Técnicos:</strong> registros de acesso e segurança, estritamente necessários à operação.</li>
        </ul>
      </Section>

      <Section title="3. Para que usamos (finalidades e bases legais)">
        <ul className="list-disc pl-6 space-y-1">
          <li>Agendar, confirmar, lembrar e cancelar a consulta, e cobrar quando houver preço — dados do paciente, com base no <strong>consentimento específico</strong> dado no agendamento (Art. 11, II, &quot;a&quot;) e, para o pagamento, na execução do contrato.</li>
          <li>Operar a conta do profissional, a assinatura e os repasses — execução de contrato (Art. 7º, V).</li>
          <li>Segurança, prevenção a fraude e cumprimento de obrigações legais e fiscais (Art. 7º, II e IX; Art. 11, II, &quot;a&quot; e &quot;g&quot;).</li>
        </ul>
        <p>Não vendemos dados pessoais nem os usamos para publicidade.</p>
      </Section>

      <Section title="4. Com quem compartilhamos">
        <p>Apenas com operadores necessários ao serviço: Stripe e Mercado Pago (pagamentos), Resend (envio de e-mails), Google (login e, se você conectar, Agenda) e a infraestrutura em que o sistema roda. Eles tratam os dados só para a finalidade contratada.</p>
      </Section>

      <Section title="5. Transferência internacional">
        <p>Alguns operadores (como o Stripe) podem tratar dados fora do Brasil, observadas as garantias exigidas pela LGPD (Arts. 33 a 36).</p>
      </Section>

      <Section title="6. Por quanto tempo guardamos">
        <p>Dados de consultas são mantidos pelo tempo necessário à finalidade e, depois de <strong>24 meses</strong> do fim da consulta, são <strong>anonimizados</strong> (nome, contato, observações e respostas são removidos); permanecem apenas os registros financeiros exigidos por lei. Este prazo é provisório e pode ser ajustado após a revisão jurídica.</p>
      </Section>

      <Section title="7. Seus direitos (Art. 18)">
        <p>Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, eliminação, informação sobre compartilhamento e revogação do consentimento. Se você é <strong>paciente</strong>, peça ao profissional que o atendeu (o controlador) — ele tem ferramentas no MarcaAí para exportar e anonimizar seus dados — ou escreva ao encarregado. Se você é <strong>profissional</strong>, exporte e exclua sua conta em <em>Configurações → Privacidade</em>.</p>
      </Section>

      <Section title="8. Segurança">
        <p>Usamos conexões cifradas, controle de acesso por papéis, tokens de integração cifrados em repouso, limitação de abuso e registros de segurança. Nenhum sistema é totalmente imune; em caso de incidente relevante, comunicaremos os afetados e a ANPD nos termos da lei.</p>
      </Section>

      <Section title="9. Encarregado (DPO) e contato">
        <p>{dpo ? <>Fale com o encarregado: <a className="underline" href={`mailto:${dpo}`}>{dpo}</a>.</> : <>O canal do encarregado está em definição e será publicado aqui.</>}</p>
      </Section>

      <Section title="10. Mudanças">
        <p>Podemos atualizar esta política. A versão aceita por cada paciente fica registrada junto ao agendamento.</p>
      </Section>

      <LegalFooter />
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-[15px] text-foreground/90">{children}</div>
    </section>
  )
}
