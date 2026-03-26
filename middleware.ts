import { auth } from "@/auth"
import { NextResponse } from "next/server"

const PUBLIC_ROUTES = ["/", "/login"]
const PUBLIC_PREFIXES = ["/book/", "/api/book/"]
const ONBOARDING_ROUTE = "/onboarding"
const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard"

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const pathname = nextUrl.pathname

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  const isPublicPrefix = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  const isOnboarding = pathname === ONBOARDING_ROUTE
  const isAuthenticated = !!session?.user

  // Rotas públicas — sempre libera
  if (isPublicRoute || isPublicPrefix) {
    return NextResponse.next()
  }

  // Não autenticado tentando acessar rota privada → login
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", nextUrl)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Autenticado mas sem onboarding → força onboarding
  if (isAuthenticated && !session.user.onboarded && !isOnboarding) {
    return NextResponse.redirect(new URL(ONBOARDING_ROUTE, nextUrl))
  }

  // Onboarding já feito tentando acessar /onboarding → dashboard
  if (isAuthenticated && session.user.onboarded && isOnboarding) {
    return NextResponse.redirect(new URL(DEFAULT_AUTHENTICATED_ROUTE, nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}