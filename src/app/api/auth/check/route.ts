import { NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";
import { isSetupComplete } from "@/lib/settings";

export async function GET() {
  const result = await checkAuth();
  const setupComplete = await isSetupComplete();
  return NextResponse.json({ ...result, setupComplete });
}
