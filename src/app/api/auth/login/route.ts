import { NextRequest, NextResponse } from "next/server";
import { login, COOKIE_NAME } from "@/lib/auth";

// Rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  record.count++;
  return record.count > 5;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const token = await login(body.email || "", body.password || "");

  if (!token) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    maxAge: 7 * 86400,
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
  });
  return response;
}
