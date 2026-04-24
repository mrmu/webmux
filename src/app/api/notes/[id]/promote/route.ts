import { NextRequest, NextResponse } from "next/server";
import { requireAuth, getCurrentUserEmail } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Promote a Note into a tracked Issue. The note keeps its row (still a
 *  prompt-candidate) but now has `issueId` so multi-turn conversations can
 *  reference a stable `#N`. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const noteId = parseInt(id);
  const actor = getCurrentUserEmail(request);

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  if (note.issueId) {
    return NextResponse.json(
      { error: "Note is already linked to issue #" + note.issueId },
      { status: 409 }
    );
  }

  // First non-empty line → title (trimmed at 80 chars so it fits an issue
  // list without wrapping). Body keeps the FULL note content so nothing is
  // lost when the note was a single long paragraph (title would otherwise
  // eat the first 80 chars and the remainder would be discarded).
  const lines = note.content.split("\n");
  const firstLine = lines.find((l) => l.trim()) || "(no title)";
  const title = firstLine.trim().slice(0, 80);
  const body = note.content;

  const issue = await prisma.issue.create({
    data: {
      projectName: note.sessionName,
      title,
      body,
      severity: "MEDIUM",
      source: "MANUAL",
      createdBy: actor,
      events: {
        create: { actor, action: "created", toValue: "OPEN" },
      },
    },
  });

  await prisma.note.update({
    where: { id: noteId },
    data: { issueId: issue.id },
  });

  return NextResponse.json({ note_id: noteId, issue_id: issue.id });
}
