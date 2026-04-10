import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Routes accessible without authentication
const PUBLIC_PATHS = new Set(["/login", "/register", "/forgot-password"]);
const PUBLIC_PREFIXES = ["/published/", "/p/", "/reset-password/", "/api/auth/", "/api/health"];

// Auth pages that redirect authenticated users away
const AUTH_REDIRECT_PATHS = new Set(["/login", "/register"]);

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isAuthenticated = Boolean(request.auth);

  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isPublic) {
    if (AUTH_REDIRECT_PATHS.has(pathname) && isAuthenticated) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
