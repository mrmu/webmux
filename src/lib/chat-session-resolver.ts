import { prisma } from "./db";
import { listSessionJsonls, findSessionJsonlById } from "./jsonl-parser";
import { detectTmuxJsonl } from "./tmux-jsonl";

export interface ResolvedChatSession {
  sessionId: string;
  path: string;
  /** "pinned" when user manually picked; "tmux" when detected from the running
   *  claude in tmux; "latest" when falling back to most recent JSONL. */
  source: "pinned" | "tmux" | "latest";
}

/**
 * Decide which JSONL the chat panel should show for a given project.
 *
 * Priority:
 *   1. If project.jsonlSessionPinned and that JSONL still exists → use it.
 *   2. Else, if a claude process is running inside the project's tmux session
 *      and we can read its session state → use that session's JSONL.
 *   3. Else, fall back to the JSONL with the newest mtime in the project dir.
 *
 * Also updates `project.jsonlSessionId` in the DB so the picker UI shows the
 * correct "active" badge — but never clears `jsonlSessionPinned`.
 */
export async function resolveChatSession(
  projectName: string,
  projectCwd: string
): Promise<ResolvedChatSession | null> {
  const project = await prisma.project
    .findUnique({
      where: { name: projectName },
      select: { jsonlSessionId: true, jsonlSessionPinned: true },
    })
    .catch(() => null);

  if (project?.jsonlSessionPinned && project.jsonlSessionId) {
    const p = findSessionJsonlById(projectCwd, project.jsonlSessionId);
    if (p) return { sessionId: project.jsonlSessionId, path: p, source: "pinned" };
    // Pinned session's file is gone — fall through to auto-detect rather than
    // stay broken. The pin stays set; as soon as a new session for the same
    // ID appears (unlikely) or user picks another, it resolves.
  }

  const tmuxSessionId = await detectTmuxJsonl(projectName, projectCwd);
  if (tmuxSessionId) {
    const p = findSessionJsonlById(projectCwd, tmuxSessionId);
    if (p) {
      await syncActiveSessionId(projectName, tmuxSessionId);
      return { sessionId: tmuxSessionId, path: p, source: "tmux" };
    }
  }

  const latest = listSessionJsonls(projectCwd)[0];
  if (latest) {
    await syncActiveSessionId(projectName, latest.sessionId);
    return { sessionId: latest.sessionId, path: latest.path, source: "latest" };
  }

  return null;
}

async function syncActiveSessionId(projectName: string, sessionId: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { name: projectName },
      select: { jsonlSessionId: true },
    });
    if (project && project.jsonlSessionId !== sessionId) {
      await prisma.project.update({
        where: { name: projectName },
        data: { jsonlSessionId: sessionId },
      });
    }
  } catch {
    /* ignore */
  }
}
