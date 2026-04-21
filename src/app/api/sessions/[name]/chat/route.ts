import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProjectCwd } from "@/lib/project-cwd";
import * as tmux from "@/lib/tmux";
import { listSessionJsonls, parseJsonlMessages } from "@/lib/jsonl-parser";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const cwd = await getProjectCwd(name);

  if (cwd) {
    // Always use the most recent JSONL (latest Claude session)
    const sessions = listSessionJsonls(cwd);
    if (sessions.length > 0) {
      const latest = sessions[0];

      // Update DB if session changed
      const project = await prisma.project
        .findUnique({ where: { name }, select: { jsonlSessionId: true } })
        .catch(() => null);
      if (project && project.jsonlSessionId !== latest.sessionId) {
        await prisma.project
          .update({ where: { name }, data: { jsonlSessionId: latest.sessionId } })
          .catch(() => {});
      }

      const messages = parseJsonlMessages(latest.path);
      if (messages.length) {
        return NextResponse.json({
          messages,
          source: "jsonl",
          sessionId: latest.sessionId,
        });
      }
    }
  }

  // Fallback: terminal parsing
  const content = await tmux.capturePane(name, 500);
  const messages = tmux.parseClaudeConversation(content);
  return NextResponse.json({ messages, source: "terminal" });
}
