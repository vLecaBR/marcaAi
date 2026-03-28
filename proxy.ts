import { auth } from "@/auth"
import { NextResponse } from "next/server"

const PUBLIC_ROUTES = ["/", "/login"]
const PUBLIC_PREFIXES = ["/book/", "/api/book/"]
const AUTH_API_PREFIX = "/api/auth"
const ONBOARDING_ROUTE = "/onboarding"
const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard"

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const pathname = nextUrl.pathname

  // Ignora rotas do auth
  if (pathname.startsWith(AUTH_API_PREFIX)) {
    return NextResponse.next()
  }

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)
  const isPublicPrefix = PUBLIC_PREFIXES.some((p) =>
    pathname.startsWith(p)
  )
  const isOnboarding = pathname === ONBOARDING_ROUTE
  const isAuthenticated = !!session?.user

  // Usuário logado tentando acessar rota pública
  if (isPublicRoute && isAuthenticated) {
    if (!session.user.onboarded) {
      return NextResponse.redirect(new URL(ONBOARDING_ROUTE, nextUrl))
    }
    return NextResponse.redirect(
      new URL(DEFAULT_AUTHENTICATED_ROUTE, nextUrl)
    )
  }

  // Rotas públicas liberadas
  if (isPublicRoute || isPublicPrefix) {
    return NextResponse.next()
  }

  // Não autenticado → login
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", nextUrl)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Usuário autenticado mas não onboarded
  if (!session.user.onboarded && !isOnboarding) {
    return NextResponse.redirect(new URL(ONBOARDING_ROUTE, nextUrl))
  }

  // Usuário onboarded tentando acessar onboarding
  if (session.user.onboarded && isOnboarding) {
    return NextResponse.redirect(
      new URL(DEFAULT_AUTHENTICATED_ROUTE, nextUrl)
    )
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}