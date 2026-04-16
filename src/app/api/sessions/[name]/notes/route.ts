import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
// Note type inferred from Prisma query

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const notes = await prisma.note.findMany({
    where: { sessionName: name },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(
    notes.map((n: { id: number; content: string; createdAt: Date; updatedAt: Date }) => ({
      id: n.id,
      content: n.content,
      created_at: Math.floor(n.createdAt.getTime() / 1000),
      updated_at: Math.floor(n.updatedAt.getTime() / 1000),
    }))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const body = await request.json();
  const content = (body.content || "").trim();

  if (!content) {
    return NextResponse.json(
      { error: "Note content is required" },
      { status: 400 }
    );
  }

  // Ensure project exists
  await prisma.project.upsert({
    where: { name },
    update: {},
    create: { name, displayName: name },
  });

  const note = await prisma.note.create({
    data: { sessionName: name, content },
  });

  return NextResponse.json({
    id: note.id,
    content: note.content,
    created_at: Math.floor(note.createdAt.getTime() / 1000),
    updated_at: Math.floor(note.updatedAt.getTime() / 1000),
  });
}
