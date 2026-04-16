import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import * as tmux from "@/lib/tmux";
import { findSessionJsonl, parseJsonlMessages } from "@/lib/jsonl-parser";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;

  // Try JSONL structured data first
  const jsonlPath = findSessionJsonl(name);
  if (jsonlPath) {
    const messages = parseJsonlMessages(jsonlPath);
    if (messages.length) {
      return NextResponse.json({ messages, source: "jsonl" });
    }
  }

  // Fallback: terminal parsing
  const content = await tmux.capturePane(name);
  const messages = tmux.parseClaudeConversation(content);
  return NextResponse.json({ messages, source: "terminal" });
}
