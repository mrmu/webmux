import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as tmux from "@/lib/tmux";

export async function GET(request: NextRequest) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await tmux.listSessions();
  const result = await Promise.all(
    sessions.map(async (s) => {
      const project = await prisma.project
        .findUnique({ where: { name: s.name } })
        .catch(() => null);
      return {
        name: s.name,
        display_name: project?.displayName || s.name,
        description: project?.description || "",
        color: project?.color || "#6366f1",
        created: s.created,
        attached: s.attached,
        width: s.width,
        height: s.height,
        activity: s.activity,
      };
    })
  );

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = (body.name || "").trim();
  const command = body.command || undefined;
  const displayName = body.display_name || name;
  const color = body.color || "#6366f1";

  if (!name) {
    return NextResponse.json(
      { error: "Session name is required" },
      { status: 400 }
    );
  }

  const session = await tmux.createSession(name, command);
  await prisma.project.upsert({
    where: { name },
    update: { displayName, color },
    create: { name, displayName, color },
  });

  return NextResponse.json({
    name: session.name,
    display_name: displayName,
    color,
  });
}
