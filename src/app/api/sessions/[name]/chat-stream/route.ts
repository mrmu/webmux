import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProjectCwd } from "@/lib/project-cwd";
import {
  findSessionJsonlById,
  listSessionJsonls,
  parseJsonlMessages,
} from "@/lib/jsonl-parser";
import fs from "fs";

/**
 * SSE endpoint: streams chat messages when the JSONL file changes.
 * Sends full message list on connect, then incremental updates on file change.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return new Response("Unauthorized", { status: 401 });

  const { name } = await params;
  const cwd = await getProjectCwd(name);
  if (!cwd) {
    return new Response("Project not found", { status: 404 });
  }

  // Find the JSONL file
  let jsonlPath: string | null = null;
  const project = await prisma.project
    .findUnique({ where: { name }, select: { jsonlSessionId: true } })
    .catch(() => null);

  if (project?.jsonlSessionId) {
    jsonlPath = findSessionJsonlById(cwd, project.jsonlSessionId);
  }
  if (!jsonlPath) {
    const sessions = listSessionJsonls(cwd);
    if (sessions.length > 0) {
      jsonlPath = sessions[0].path;
      await prisma.project
        .update({ where: { name }, data: { jsonlSessionId: sessions[0].sessionId } })
        .catch(() => {});
    }
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      function sendEvent(data: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      }

      function sendMessages() {
        if (!jsonlPath || closed) return;
        try {
          const messages = parseJsonlMessages(jsonlPath);
          sendEvent(JSON.stringify({ messages, source: "jsonl" }));
        } catch {
          /* ignore parse errors */
        }
      }

      // Send initial messages
      sendMessages();

      // Watch the JSONL file for changes
      let watcher: fs.FSWatcher | null = null;
      if (jsonlPath && fs.existsSync(jsonlPath)) {
        let debounce: ReturnType<typeof setTimeout> | null = null;
        watcher = fs.watch(jsonlPath, () => {
          // Debounce: Claude Code writes multiple lines quickly
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => {
            sendMessages();
          }, 300);
        });

        watcher.on("error", () => {
          closed = true;
          controller.close();
        });
      }

      // Also check for new JSONL files periodically (if claude restarts)
      const checkInterval = setInterval(() => {
        if (closed) { clearInterval(checkInterval); return; }
        if (!cwd) return;
        const sessions = listSessionJsonls(cwd);
        if (sessions.length > 0 && sessions[0].path !== jsonlPath) {
          // New session file appeared
          jsonlPath = sessions[0].path;
          if (watcher) watcher.close();
          sendMessages();
          let debounce: ReturnType<typeof setTimeout> | null = null;
          watcher = fs.watch(jsonlPath, () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => sendMessages(), 300);
          });
        }
      }, 10000);

      // Keepalive ping every 30s
      const keepalive = setInterval(() => {
        if (closed) { clearInterval(keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 30000);

      // Cleanup on abort
      request.signal.addEventListener("abort", () => {
        closed = true;
        if (watcher) watcher.close();
        clearInterval(checkInterval);
        clearInterval(keepalive);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
