import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isValidCwd, isValidCommand } from "@/lib/validate";
import { getAllowedCwdRoots } from "@/lib/settings";
import { syncComuxDir } from "@/lib/sync-comux-dir";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const project = await prisma.project.findUnique({
    where: { name },
    select: { name: true, displayName: true, color: true, cwd: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({
    name: project.name,
    display_name: project.displayName,
    color: project.color,
    cwd: project.cwd,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const body = await request.json();

  // Validate cwd if provided
  const allowedRoots = await getAllowedCwdRoots();
  if (body.cwd !== undefined && body.cwd !== "" && !isValidCwd(body.cwd, ...allowedRoots)) {
    return NextResponse.json(
      { error: "Working directory must be within PROJECTS_ROOT (or comux's own source dir for self-managed setup)" },
      { status: 400 }
    );
  }

  // Validate command if provided
  if (body.command !== undefined && body.command !== "" && !isValidCommand(body.command)) {
    return NextResponse.json(
      { error: "Invalid command" },
      { status: 400 }
    );
  }

  await prisma.project.upsert({
    where: { name },
    update: {
      ...(body.display_name && { displayName: body.display_name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.color && { color: body.color }),
      ...(body.cwd !== undefined && { cwd: body.cwd }),
      ...(body.command !== undefined && { command: body.command }),
      ...(body.repo_url !== undefined && { repoUrl: body.repo_url }),
      ...(body.repo_token !== undefined && { repoToken: body.repo_token }),
      ...(body.deploy_doc !== undefined && { deployDoc: body.deploy_doc }),
      ...(body.test_doc !== undefined && { testDoc: body.test_doc }),
    },
    create: {
      name,
      displayName: body.display_name || name,
      description: body.description || "",
      color: body.color || "#6366f1",
      cwd: body.cwd || "",
      command: body.command || "",
      repoUrl: body.repo_url || "",
      repoToken: body.repo_token || "",
      deployDoc: body.deploy_doc || "",
      testDoc: body.test_doc || "",
    },
  });

  // Regenerate `.comux/` whenever project metadata changes (esp. first-time
  // cwd set creates the dir and seeds user files).
  await syncComuxDir(name);

  return NextResponse.json({ ok: true });
}
