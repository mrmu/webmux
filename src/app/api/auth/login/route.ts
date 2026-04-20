import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";

// Simple in-memory rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  record.count++;
  return record.count > MAX_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many login attempts" },
      { status: 429 }
    );
  }

  const body = await request.json();
  const token = login(body.password || "");

  if (!token) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true });
  response.cookies.set("webmux_token", token, {
    maxAge: 86400,
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
  });
  return response;
}
