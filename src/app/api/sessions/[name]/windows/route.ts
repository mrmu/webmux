import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import * as tmux from "@/lib/tmux";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const windows = await tmux.listWindows(name);
  return NextResponse.json(windows);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const body = await request.json();
  const window = await tmux.createWindow(
    name,
    body.name || "shell",
    body.cwd || undefined
  );
  return NextResponse.json(window);
}
