import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import * as tmux from "@/lib/tmux";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  await tmux.killSession(name);
  return NextResponse.json({ ok: true });
}
