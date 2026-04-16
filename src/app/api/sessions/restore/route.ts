import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as tmux from "@/lib/tmux";

/** Restore all DB-saved sessions that aren't currently running in tmux. */
export async function POST(request: NextRequest) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const liveSessions = await tmux.listSessions();
  const liveNames = new Set(liveSessions.map((s) => s.name));

  const projects = await prisma.project.findMany();
  const restored: string[] = [];
  const failed: string[] = [];

  for (const p of projects) {
    if (liveNames.has(p.name)) continue; // already running
    if (!p.cwd && !p.command) continue; // no info to restore

    try {
      await tmux.createSession(
        p.name,
        p.command || undefined,
        p.cwd || undefined
      );
      restored.push(p.name);
    } catch {
      failed.push(p.name);
    }
  }

  return NextResponse.json({ restored, failed });
}
