import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProjectCwd } from "@/lib/project-cwd";
import * as tmux from "@/lib/tmux";
import {
  findSessionJsonlById,
  listSessionJsonls,
  parseJsonlMessages,
} from "@/lib/jsonl-parser";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const cwd = await getProjectCwd(name);

  if (cwd) {
    // 1. Try stored session ID first
    const project = await prisma.project
      .findUnique({ where: { name }, select: { jsonlSessionId: true } })
      .catch(() => null);

    if (project?.jsonlSessionId) {
      const jsonlPath = findSessionJsonlById(cwd, project.jsonlSessionId);
      if (jsonlPath) {
        const messages = parseJsonlMessages(jsonlPath);
        if (messages.length) {
          return NextResponse.json({
            messages,
            source: "jsonl",
            sessionId: project.jsonlSessionId,
          });
        }
      }
    }

    // 2. Auto-detect: find JSONL created after tmux session started
    const sessions = listSessionJsonls(cwd);
    if (sessions.length > 0) {
      // Use the most recently modified one as fallback
      const best = sessions[0];
      // Auto-save for next time
      await prisma.project
        .update({
          where: { name },
          data: { jsonlSessionId: best.sessionId },
        })
        .catch(() => {});

      const messages = parseJsonlMessages(best.path);
      if (messages.length) {
        return NextResponse.json({
          messages,
          source: "jsonl",
          sessionId: best.sessionId,
        });
      }
    }
  }

  // 3. Fallback: terminal parsing
  const content = await tmux.capturePane(name, 500);
  const messages = tmux.parseClaudeConversation(content);
  return NextResponse.json({ messages, source: "terminal" });
}
