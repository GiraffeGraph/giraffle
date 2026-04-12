import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { REQUEST_ID_HEADER } from "@/lib/runtime-constants";

const PUBLIC_PATHS = new Set(["/login", "/register", "/forgot-password"]);
const PUBLIC_PREFIXES = [
  "/published/",
  "/p/",
  "/reset-password/",
  "/api/auth/",
  "/api/health",
];
const AUTH_REDIRECT_PATHS = new Set(["/login", "/register"]);

function withRequestId(request: NextRequest, response: NextResponse) {
  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() || crypto.randomUUID();
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

function nextWithRequestHeaders(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestId = requestHeaders.get(REQUEST_ID_HEADER)?.trim() || crypto.randomUUID();

  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const proxy = auth((request) => {
  const { pathname } = request.nextUrl;
  const isAuthenticated = Boolean(request.auth);
  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isPublic) {
    if (AUTH_REDIRECT_PATHS.has(pathname) && isAuthenticated) {
      return withRequestId(
        request,
        NextResponse.redirect(new URL("/dashboard", request.url))
      );
    }

    return nextWithRequestHeaders(request);
  }

  if (!isAuthenticated) {
    return withRequestId(
      request,
      NextResponse.redirect(new URL("/login", request.url))
    );
  }

  return nextWithRequestHeaders(request);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
