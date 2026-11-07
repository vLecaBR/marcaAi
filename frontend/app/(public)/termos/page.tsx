import type { Metadata } from "next"
import { LegalFooter } from "@/components/marketing/legal-footer"

export const metadata: Metadata = { title: "Termos de uso" }

export default function TermosPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 space-y-8 leading-relaxed">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
        <strong>Versão preliminar.</strong> Estes termos estão em revisão jurídica e podem mudar antes da versão final.
      </div>

      <header className="space-y-2">
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5 }}>Termos de uso</h1>
        <p className="text-muted-foreground">Regras para usar o MarcaAí como profissional de saúde, clínica ou paciente.</p>
      </header>

      <Section title="1. O serviço">
        <p>O MarcaAí oferece agenda online, página pública de agendamento, lembretes e cobrança de consultas. Não prestamos serviços de saúde, não somos parte da relação entre paciente e profissional e não substituímos prontuário ou sistema de gestão clínica.</p>
      </Section>

      <Section title="2. Papéis e dados dos pacientes">
        <p>O profissional ou a clínica é o <strong>controlador</strong> dos dados dos seus pacientes e responde pela licitude do atendimento e do uso desses dados; o MarcaAí atua como <strong>operador</strong>, seguindo as instruções do controlador conforme a Política de Privacidade. O profissional se compromete a coletar apenas o necessário e a atender os pedidos dos titulares.</p>
      </Section>

      <Section title="3. Conta e uso aceitável">
        <ul className="list-disc pl-6 space-y-1">
          <li>Informe dados verdadeiros (incluindo conselho e registro profissional) e mantenha seu acesso seguro.</li>
          <li>É proibido usar a plataforma para fraude, spam, conteúdo ilícito ou para tentar acessar dados de terceiros.</li>
          <li>Podemos suspender contas que violem estes termos ou a lei.</li>
        </ul>
      </Section>

      <Section title="4. Planos, cobrança e repasses">
        <p>Há um plano gratuito e planos pagos, com período de teste para novas contas. Em consultas pagas pelo MarcaAí, retemos uma taxa percentual conforme o plano e repassamos o restante à conta de recebimento do profissional ou da clínica, via Stripe e/ou Mercado Pago, que têm seus próprios termos. Taxas e condições vigentes ficam na página de planos.</p>
      </Section>

      <Section title="5. Cancelamento e reembolso de consultas">
        <p>Se o paciente cancelar com <strong>24 horas ou mais</strong> de antecedência, ou se o cancelamento for feito pelo profissional, o valor pago é reembolsado integralmente. Fora desse prazo, o reembolso depende do profissional.</p>
      </Section>

      <Section title="6. Disponibilidade e responsabilidade">
        <p>Buscamos manter o serviço disponível, mas ele pode sofrer interrupções. Na extensão permitida em lei, não respondemos por danos indiretos nem por decisões clínicas ou comerciais tomadas com base na plataforma.</p>
      </Section>

      <Section title="7. Encerramento">
        <p>Você pode encerrar sua conta em <em>Configurações → Privacidade</em>, após cancelar assinaturas ativas. Dados são tratados conforme a Política de Privacidade.</p>
      </Section>

      <Section title="8. Lei aplicável">
        <p>Estes termos seguem a legislação brasileira.</p>
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
