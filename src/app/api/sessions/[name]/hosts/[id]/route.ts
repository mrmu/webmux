import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const host = await prisma.host.update({
    where: { id: parseInt(id) },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.ssh_target && { sshTarget: body.ssh_target }),
      ...(body.env && { env: body.env }),
      ...(body.description !== undefined && { description: body.description }),
    },
  });

  return NextResponse.json(host);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; id: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.host.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
