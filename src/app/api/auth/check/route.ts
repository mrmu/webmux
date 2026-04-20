import { NextResponse } from "next/server";
import { checkAuth } from "@/lib/auth";

export async function GET() {
  const result = await checkAuth();
  return NextResponse.json(result);
}
