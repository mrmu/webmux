import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import * as tmux from "@/lib/tmux";

export async function GET(request: NextRequest) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Get live tmux sessions
  const liveSessions = await tmux.listSessions();
  const liveNames = new Set(liveSessions.map((s) => s.name));

  // Get all projects from DB
  const projects = await prisma.project.findMany();

  // Merge: show live sessions with DB metadata, plus DB-only projects as "stopped"
  const result = projects.map((p) => {
    const live = liveSessions.find((s) => s.name === p.name);
    return {
      name: p.name,
      display_name: p.displayName,
      description: p.description,
      color: p.color,
      cwd: p.cwd,
      command: p.command,
      created: live?.created || "",
      attached: live?.attached || false,
      width: live?.width || 0,
      height: live?.height || 0,
      activity: live?.activity || "",
      running: liveNames.has(p.name),
    };
  });

  // Also include tmux sessions that have no DB entry
  for (const s of liveSessions) {
    if (!projects.find((p) => p.name === s.name)) {
      result.push({
        name: s.name,
        display_name: s.name,
        description: "",
        color: "#6366f1",
        cwd: "",
        command: "",
        created: s.created,
        attached: s.attached,
        width: s.width,
        height: s.height,
        activity: s.activity,
        running: true,
      });
    }
  }

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const name = (body.name || "").trim();
  const cwd = body.cwd || `/home/dev/next/${name}`;
  const command = body.command || "claude --dangerously-skip-permissions";
  const displayName = body.display_name || name;
  const color = body.color || "#6366f1";

  if (!name) {
    return NextResponse.json(
      { error: "Session name is required" },
      { status: 400 }
    );
  }

  const session = await tmux.createSession(name, command, cwd);
  await prisma.project.upsert({
    where: { name },
    update: { displayName, color, cwd, command },
    create: { name, displayName, color, cwd, command },
  });

  return NextResponse.json({
    name: session.name,
    display_name: displayName,
    color,
  });
}
