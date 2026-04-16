import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const body = await request.json();

  await prisma.project.upsert({
    where: { name },
    update: {
      ...(body.display_name && { displayName: body.display_name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.color && { color: body.color }),
    },
    create: {
      name,
      displayName: body.display_name || name,
      description: body.description || "",
      color: body.color || "#6366f1",
    },
  });

  return NextResponse.json({ ok: true });
}
