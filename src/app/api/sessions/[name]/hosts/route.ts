import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncComuxDir } from "@/lib/sync-comux-dir";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const hosts = await prisma.host.findMany({
    where: { projectName: name },
    orderBy: { env: "asc" },
  });
  return NextResponse.json(hosts);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const body = await request.json();

  if (!body.name || !body.ssh_target) {
    return NextResponse.json(
      { error: "name and ssh_target are required" },
      { status: 400 }
    );
  }

  await prisma.project.upsert({
    where: { name },
    update: {},
    create: { name, displayName: name },
  });

  const host = await prisma.host.create({
    data: {
      projectName: name,
      name: body.name,
      sshTarget: body.ssh_target,
      env: body.env || "production",
      description: body.description || "",
    },
  });

  await syncComuxDir(name);

  return NextResponse.json(host);
}
