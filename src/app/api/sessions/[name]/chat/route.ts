import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getProjectCwd } from "@/lib/project-cwd";
import * as tmux from "@/lib/tmux";
import { findSessionJsonlByCwd, parseJsonlMessages } from "@/lib/jsonl-parser";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const cwd = await getProjectCwd(name);

  // Try JSONL structured data first (reliable, no duplicates)
  if (cwd) {
    const jsonlPath = findSessionJsonlByCwd(cwd);
    if (jsonlPath) {
      const messages = parseJsonlMessages(jsonlPath);
      if (messages.length) {
        return NextResponse.json({ messages, source: "jsonl" });
      }
    }
  }

  // Fallback: terminal parsing (limited scrollback)
  const content = await tmux.capturePane(name, 500);
  const messages = tmux.parseClaudeConversation(content);
  return NextResponse.json({ messages, source: "terminal" });
}
