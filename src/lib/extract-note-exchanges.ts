import fs from "fs";
import { prisma } from "./db";
import { listSessionJsonls } from "./jsonl-parser";

/** Matches `(tracking: note #42)` or `note #42, issue #7` — we only need the
 *  note id; the issue ref is redundant because Note.issueId already links. */
const TRACKING_RE = /\(tracking:[^)]*?note\s*#(\d+)/i;

const RE_ANSI = /\x1b\[[0-9;]*[a-zA-Z]/g;

interface JsonlEntry {
  type?: string;
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  message?: { content?: unknown };
}

function extractUserText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; text?: string };
    if (b.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      // Skip system-reminder / bash / command wrappers that Claude Code adds.
      if (/<(system-reminder|local-command|command-name|bash-input|bash-stdout)/.test(t))
        continue;
      if (t) parts.push(t);
    }
  }
  return parts.join("\n").replace(RE_ANSI, "");
}

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: string; text?: string };
    // Tool use and thinking are intentionally dropped — we want only the
    // text the model addressed to the user.
    if (b.type === "text" && typeof b.text === "string") {
      const t = b.text.trim();
      if (t && t !== "(no content)") parts.push(t);
    }
  }
  return parts.join("\n\n").replace(RE_ANSI, "");
}

function readJsonl(filePath: string): JsonlEntry[] {
  let data: string;
  try {
    data = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const out: JsonlEntry[] = [];
  for (const line of data.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return out;
}

/** Scan all JSONL sessions for a project and persist any previously-unseen
 *  note exchange. Idempotent via the unique promptUuid constraint. */
export async function extractNoteExchanges(projectCwd: string): Promise<number> {
  if (!projectCwd) return 0;

  const sessions = listSessionJsonls(projectCwd);
  if (sessions.length === 0) return 0;

  // Pull all known promptUuids up front so we skip already-stored ones in
  // O(1) without round-tripping the DB for each entry.
  const stored = await prisma.noteExchange.findMany({
    select: { promptUuid: true },
  });
  const seen = new Set(stored.map((s) => s.promptUuid));

  // Also cache which noteIds exist so we don't FK-fail on stale tracking tags.
  const noteRows = await prisma.note.findMany({ select: { id: true } });
  const knownNoteIds = new Set(noteRows.map((n) => n.id));

  let added = 0;

  for (const session of sessions) {
    const entries = readJsonl(session.path);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.type !== "user" || !e.uuid || seen.has(e.uuid)) continue;

      const userText = extractUserText(e.message?.content);
      const match = userText.match(TRACKING_RE);
      if (!match) continue;

      const noteId = parseInt(match[1]);
      if (!knownNoteIds.has(noteId)) continue;

      // Collect every assistant text block up to the next user message.
      const replyParts: string[] = [];
      for (let j = i + 1; j < entries.length; j++) {
        const next = entries[j];
        if (next.type === "user") break;
        if (next.type !== "assistant") continue;
        const asstText = extractAssistantText(next.message?.content);
        if (asstText) replyParts.push(asstText);
      }

      // If the reply is still empty, the run probably hasn't finished yet.
      // Skip for now — next extraction pass will pick it up once complete.
      if (replyParts.length === 0) continue;

      try {
        await prisma.noteExchange.create({
          data: {
            noteId,
            sessionId: session.sessionId,
            promptUuid: e.uuid,
            askedAt: e.timestamp ? new Date(e.timestamp) : new Date(),
            prompt: userText,
            reply: replyParts.join("\n\n"),
          },
        });
        seen.add(e.uuid);
        added++;
      } catch {
        // Unique violation = race with another pass, safe to ignore.
      }
    }
  }

  return added;
}
