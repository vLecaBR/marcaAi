/**
 * Mapa central de rotas da API .NET (relativas a `/api/v1`).
 * Único lugar onde os paths do inventário (spec §3.2) são escritos — evita strings soltas.
 */

export const endpoints = {
  auth: {
    magicLinkRequest: "/auth/magic-link/request",
    magicLinkVerify: "/auth/magic-link/verify",
    refresh: "/auth/refresh",
    me: "/auth/me",
    logout: "/auth/logout",
    googleStart: "/auth/google/start",
    googleComplete: "/auth/google/complete",
    googleExchange: "/auth/google/exchange",
  },
  me: {
    root: "/me",
    profile: "/me/profile",
    onboardingComplete: "/me/onboarding/complete",
  },
  teams: {
    root: "/teams",
    byId: (id: string) => `/teams/${id}`,
    members: (id: string) => `/teams/${id}/members`,
    member: (id: string, userId: string) => `/teams/${id}/members/${userId}`,
    billing: (teamId: string) => `/teams/${teamId}/billing`,
    billingCheckout: (teamId: string) => `/teams/${teamId}/billing/checkout`,
  },
  // Billing individual (Solo/Solo Pro) — estrutura separada da clínica (Q7).
  userBilling: {
    root: "/user/billing",
    checkout: "/user/billing/checkout",
  },
  eventTypes: {
    root: "/event-types",
    byId: (id: string) => `/event-types/${id}`,
    status: (id: string) => `/event-types/${id}/status`,
  },
  schedules: {
    root: "/schedules",
    availability: (id: string) => `/schedules/${id}/availability`,
    exceptions: (id: string) => `/schedules/${id}/exceptions`,
    exception: (id: string) => `/exceptions/${id}`,
  },
  slots: "/slots",
  slotsMonth: "/slots/month",
  patients: "/patients",
  patientDetail: "/patients/detail",
  public: (username: string) => `/public/${username}`,
  publicTeam: (slug: string) => `/public/team/${slug}`,
  // LGPD — direitos do titular (Art. 18)
  integrations: {
    googleCalendar: "/integrations/google-calendar",
    googleCalendarLink: "/integrations/google-calendar/link",
  },
  privacy: {
    exportPatient: "/privacy/patients/export",
    anonymizePatient: "/privacy/patients/anonymize",
    exportAccount: "/privacy/account/export",
    deleteAccount: "/privacy/account",
  },
  bookings: {
    root: "/bookings",
    byUid: (uid: string) => `/bookings/${uid}`,
    cancel: (uid: string) => `/bookings/${uid}/cancel`,
    reschedule: (uid: string) => `/bookings/${uid}/reschedule`,
    confirm: (uid: string) => `/bookings/${uid}/confirm`,
    pay: (uid: string) => `/bookings/${uid}/pay`,
  },
  payouts: {
    onboarding: "/payouts/onboarding",
    root: "/payouts",
    providerStatus: (provider: string) => `/payouts/${provider}/status`,
    byTeam: (teamId: string) => `/payouts/teams/${teamId}`,
    byId: (id: string) => `/payouts/${id}`,
  },
  // Fase 5 — pendente no backend (docs/backend-backlog.md · ADR-0003).
  finance: {
    summary: "/finance/summary",
    statement: "/finance/statement",
    teamSummary: (teamId: string) => `/finance/teams/${teamId}/summary`,
  },
} as const
