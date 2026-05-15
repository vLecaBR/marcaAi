import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/onboarding/:path*"
  ]
}

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth
  const isOnboarded = req.auth?.user?.onboarded

  const isDashboardRoute = nextUrl.pathname.startsWith("/dashboard") || nextUrl.pathname.startsWith("/settings")
  const isOnboardingRoute = nextUrl.pathname.startsWith("/onboarding")

  if (!isLoggedIn && (isDashboardRoute || isOnboardingRoute)) {
    return NextResponse.redirect(new URL("/login", nextUrl))
  }

  if (isLoggedIn && !isOnboarded && !isOnboardingRoute) {
    return NextResponse.redirect(new URL("/onboarding", nextUrl))
  }

  if (isLoggedIn && isOnboarded && isOnboardingRoute) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl))
  }

  return NextResponse.next()
})
