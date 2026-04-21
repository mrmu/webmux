import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getProjectCwd } from "@/lib/project-cwd";
import { listSessionJsonls, parseJsonlMessages } from "@/lib/jsonl-parser";
import fs from "fs";

/**
 * SSE endpoint: streams chat messages from the latest JSONL file.
 * Always tracks the most recent Claude Code session (by mtime).
 * When Claude restarts (new JSONL), automatically switches to it.
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

  const encoder = new TextEncoder();
  let closed = false;
  let jsonlPath: string | null = null;
  let watcher: fs.FSWatcher | null = null;

  function findLatestJsonl(): { path: string; sessionId: string } | null {
    const sessions = listSessionJsonls(cwd!);
    return sessions.length > 0 ? sessions[0] : null;
  }

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
          /* ignore */
        }
      }

      function watchFile(path: string) {
        if (watcher) watcher.close();
        let debounce: ReturnType<typeof setTimeout> | null = null;
        watcher = fs.watch(path, () => {
          if (debounce) clearTimeout(debounce);
          debounce = setTimeout(() => sendMessages(), 300);
        });
        watcher.on("error", () => {});
      }

      // Initial: find latest JSONL
      const latest = findLatestJsonl();
      if (latest) {
        jsonlPath = latest.path;
        // Update DB
        prisma.project
          .update({ where: { name }, data: { jsonlSessionId: latest.sessionId } })
          .catch(() => {});
        sendMessages();
        watchFile(jsonlPath);
      }

      // Check for new JSONL files every 3 seconds (claude restart)
      const checkInterval = setInterval(() => {
        if (closed) { clearInterval(checkInterval); return; }
        const latest = findLatestJsonl();
        if (latest && latest.path !== jsonlPath) {
          // New session detected — switch to it
          jsonlPath = latest.path;
          prisma.project
            .update({ where: { name }, data: { jsonlSessionId: latest.sessionId } })
            .catch(() => {});
          sendMessages();
          watchFile(jsonlPath);
        }
      }, 3000);

      // Keepalive
      const keepalive = setInterval(() => {
        if (closed) { clearInterval(keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 30000);

      // Cleanup
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
