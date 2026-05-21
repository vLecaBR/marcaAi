import NextAuth from "next-auth"
import authConfig from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
}

const PUBLIC_ROUTES = ["/", "/login"]

// Controle de Rate Limit em memória para /api/book
const rateLimit = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 5;

export default auth((req) => {
  const { nextUrl } = req

  // Aplicar Rate Limiting apenas na rota de agendamento (book)
  if (nextUrl.pathname.startsWith('/api/book')) {
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown-ip';
    
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    
    const record = rateLimit.get(ip);
    
    if (!record || record.lastReset < windowStart) {
      rateLimit.set(ip, { count: 1, lastReset: now });
    } else {
      if (record.count >= MAX_REQUESTS_PER_WINDOW) {
        return new NextResponse(
          JSON.stringify({ error: 'Muitas requisições. Tente novamente mais tarde.' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
      record.count += 1;
      rateLimit.set(ip, record);
    }
  }

  const isLoggedIn = !!req.auth
  const isOnboarded = req.auth?.user?.onboarded

  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard") || nextUrl.pathname.startsWith("/settings")
  const isOnboardingRoute = nextUrl.pathname.startsWith("/onboarding")
  const isPublicRoute = PUBLIC_ROUTES.includes(nextUrl.pathname)

  // Redirect unauthenticated users to login if trying to access restricted routes
  if (!isLoggedIn && (isDashboardRoute || isOnboardingRoute)) {
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  // Redirect authenticated users trying to access login page to dashboard or onboarding
  if (isLoggedIn && isPublicRoute) {
    if (!isOnboarded) {
      return NextResponse.redirect(new URL("/onboarding", nextUrl))
    }
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  // Enforce onboarding for authenticated users
  if (isLoggedIn && !isOnboarded && !isOnboardingRoute && !isPublicRoute) {
    return NextResponse.redirect(new URL("/onboarding", nextUrl))
  }

  // Prevent onboarded users from accessing the onboarding page
  if (isLoggedIn && isOnboarded && isOnboardingRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  return NextResponse.next()
})
