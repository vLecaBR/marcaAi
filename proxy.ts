import NextAuth from "next-auth"
import authConfig from "./auth.config"
import { NextResponse } from "next/server"

const { auth } = NextAuth(authConfig)

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"]
}

const PUBLIC_ROUTES = ["/", "/login"]

export default auth((req) => {
  const { nextUrl } = req
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
