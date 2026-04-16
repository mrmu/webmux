import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const AUTH_PASSWORD = process.env.WEBMUX_PASSWORD || "";
const AUTH_SECRET =
  process.env.WEBMUX_SECRET || crypto.randomBytes(32).toString("hex");

function generateToken(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(String(day))
    .digest("hex");
}

function verifyToken(token: string): boolean {
  const day = Math.floor(Date.now() / 86_400_000);
  for (const offset of [0, 1]) {
    const expected = crypto
      .createHmac("sha256", AUTH_SECRET)
      .update(String(day - offset))
      .digest("hex");
    if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

function getTokenFromRequest(request: NextRequest): string | null {
  const cookie = request.cookies.get("webmux_token");
  if (cookie) return cookie.value;
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export function requireAuth(request: NextRequest): boolean {
  if (!AUTH_PASSWORD) return true;
  const token = getTokenFromRequest(request);
  if (!token) return false;
  try {
    return verifyToken(token);
  } catch {
    return false;
  }
}

export function login(password: string): string | null {
  if (!AUTH_PASSWORD) return generateToken();
  if (
    password.length === AUTH_PASSWORD.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(AUTH_PASSWORD))
  ) {
    return generateToken();
  }
  return null;
}

export async function checkAuth(): Promise<{
  authenticated: boolean;
  passwordRequired: boolean;
}> {
  if (!AUTH_PASSWORD) return { authenticated: true, passwordRequired: false };
  const cookieStore = await cookies();
  const token = cookieStore.get("webmux_token")?.value;
  if (token) {
    try {
      if (verifyToken(token))
        return { authenticated: true, passwordRequired: true };
    } catch {
      /* invalid token length */
    }
  }
  return { authenticated: false, passwordRequired: true };
}

export { generateToken, verifyToken, AUTH_PASSWORD };
