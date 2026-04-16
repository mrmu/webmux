import { NextRequest, NextResponse } from "next/server";
import { login } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const token = login(body.password || "");

  if (!token) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("webmux_token", token, {
    maxAge: 86400,
    httpOnly: true,
    sameSite: "strict",
  });
  return response;
}
