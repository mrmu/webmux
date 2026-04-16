import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSessionCwd } from "@/lib/file-manager";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const cwd = getSessionCwd(name);
  if (!cwd) {
    return NextResponse.json(
      { error: "CWD not found for session" },
      { status: 404 }
    );
  }
  return NextResponse.json({ cwd });
}
