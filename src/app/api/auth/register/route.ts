import { NextRequest, NextResponse } from "next/server";
import { register, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  // Only allow registration if no users exist (first user setup)
  // or if already authenticated (admin creating accounts)
  const userCount = await prisma.user.count().catch(() => 0);
  if (userCount > 0) {
    // For now, only first user can self-register
    return NextResponse.json(
      { error: "Registration disabled. Contact admin." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const result = await register(
    body.email || "",
    body.password || "",
    body.name || ""
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, result.token, {
    maxAge: 7 * 86400,
    httpOnly: true,
    sameSite: "strict",
    secure: isProduction,
  });
  return response;
}
