import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.WEBMUX_SECRET || "dev-secret-change-in-production";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/register", "/api/auth/check"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Root → redirect based on auth
  if (pathname === "/") {
    const token = request.cookies.get("webmux_token")?.value;
    if (token) {
      try {
        jwt.verify(token, JWT_SECRET);
        return NextResponse.redirect(new URL("/projects", request.url));
      } catch { /* fall through to login redirect */ }
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Allow public paths and static assets
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/config") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check auth token
  const token = request.cookies.get("webmux_token")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    jwt.verify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
