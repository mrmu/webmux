import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProjectCwd } from "@/lib/project-cwd";
import { listSessionJsonls } from "@/lib/jsonl-parser";

/** List available Claude Code sessions for this project */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const cwd = await getProjectCwd(name);
  if (!cwd) return NextResponse.json([]);

  const project = await prisma.project
    .findUnique({ where: { name }, select: { jsonlSessionId: true } })
    .catch(() => null);

  const sessions = listSessionJsonls(cwd).map((s) => ({
    sessionId: s.sessionId,
    mtime: s.mtime,
    active: s.sessionId === project?.jsonlSessionId,
  }));

  return NextResponse.json(sessions);
}

/** Set which session the chat view should show */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const body = await request.json();
  const sessionId = body.sessionId || "";

  await prisma.project.update({
    where: { name },
    data: { jsonlSessionId: sessionId },
  });

  return NextResponse.json({ ok: true, sessionId });
}
