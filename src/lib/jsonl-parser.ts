import fs from "fs";
import path from "path";

const RE_ANSI = /\x1b\[[0-9;]*[a-zA-Z]/g;
const HOST_HOME = process.env.HOST_HOME || "/home/devops_bot";
const SESSION_MAP_PATH = path.join(HOST_HOME, ".ccbot", "session_map.json");
const CLAUDE_PROJECTS = path.join(HOST_HOME, ".claude", "projects");
const MAX_SUMMARY = 200;

const SKIP_TYPES = new Set([
  "summary",
  "file-history-snapshot",
  "progress",
  "system",
  "lock",
  "result",
]);

export interface ChatMessage {
  role: string;
  content_type: string;
  text: string;
  tool_name?: string;
  result?: string | null;
  detail?: string | null;
  is_error?: boolean;
}

export function findSessionJsonl(tmuxSessionName: string): string | null {
  if (!fs.existsSync(SESSION_MAP_PATH)) return null;

  let sessionMap: Record<string, { session_id?: string; cwd?: string }>;
  try {
    sessionMap = JSON.parse(fs.readFileSync(SESSION_MAP_PATH, "utf-8"));
  } catch {
    return null;
  }

  const candidates: { path: string; mtime: number }[] = [];

  for (const [key, info] of Object.entries(sessionMap)) {
    if (!key.startsWith(`${tmuxSessionName}:`)) continue;

    const sessionId = info.session_id;
    const cwd = info.cwd;
    if (!sessionId || !cwd) continue;

    const encodedCwd = cwd.replace(/[^a-zA-Z0-9-]/g, "-");
    const jsonlPath = path.join(CLAUDE_PROJECTS, encodedCwd, `${sessionId}.jsonl`);

    if (fs.existsSync(jsonlPath)) {
      candidates.push({ path: jsonlPath, mtime: fs.statSync(jsonlPath).mtimeMs });
    } else {
      // Glob fallback
      try {
        const dirs = fs.readdirSync(CLAUDE_PROJECTS);
        for (const dir of dirs) {
          const p = path.join(CLAUDE_PROJECTS, dir, `${sessionId}.jsonl`);
          if (fs.existsSync(p)) {
            candidates.push({ path: p, mtime: fs.statSync(p).mtimeMs });
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

function formatToolSummary(
  name: string,
  inputData: Record<string, unknown>
): string {
  if (typeof inputData !== "object" || !inputData) return name;

  let summary = "";
  const get = (key: string) => (inputData[key] as string) || "";

  switch (name) {
    case "Read":
    case "Glob":
      summary = get("file_path") || get("pattern");
      break;
    case "Write":
      summary = get("file_path");
      break;
    case "Edit":
    case "NotebookEdit":
      summary = get("file_path") || get("notebook_path");
      break;
    case "Bash":
      summary = get("command");
      break;
    case "Grep":
      summary = get("pattern");
      break;
    case "Task":
      summary = get("description");
      break;
    case "WebFetch":
      summary = get("url");
      break;
    case "WebSearch":
      summary = get("query");
      break;
    case "Skill":
      summary = get("skill");
      break;
    default:
      for (const v of Object.values(inputData)) {
        if (typeof v === "string" && v) {
          summary = v;
          break;
        }
      }
  }

  if (summary) {
    if (summary.length > MAX_SUMMARY) summary = summary.slice(0, MAX_SUMMARY) + "...";
    return `${name}(${summary})`;
  }
  return name;
}

function formatResultStats(text: string, toolName: string | null): string {
  if (!text) return "";
  const lineCount = text.split("\n").length;

  switch (toolName) {
    case "Read":
      return `Read ${lineCount} lines`;
    case "Write":
      return `Wrote ${lineCount} lines`;
    case "Bash":
      return `Output ${lineCount} lines`;
    case "Grep":
      return `Found ${text.split("\n").filter((l) => l.trim()).length} matches`;
    case "Glob":
      return `Found ${text.split("\n").filter((l) => l.trim()).length} files`;
    case "Task":
      return `Agent output ${lineCount} lines`;
    case "WebFetch":
      return `Fetched ${text.length} chars`;
    case "WebSearch":
      return `${(text.match(/\n\n/g) || []).length + 1} search results`;
    case "Edit":
      return "Edited successfully";
    default:
      return `${lineCount} lines`;
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && item.type === "text")
          return item.text || "";
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function parseJsonlMessages(filePath: string): ChatMessage[] {
  let data: string;
  try {
    data = fs.readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }

  const entries: Array<Record<string, unknown>> = [];
  for (const line of data.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  const messages: ChatMessage[] = [];
  const pendingTools: Map<
    string,
    { toolName: string; msgIndex: number }
  > = new Map();

  for (const entry of entries) {
    const msgType = entry.type as string;
    if (SKIP_TYPES.has(msgType) || !["user", "assistant"].includes(msgType))
      continue;

    const message = entry.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== "object") continue;

    let content = message.content as Array<Record<string, unknown>>;
    if (!Array.isArray(content)) {
      content = content
        ? [{ type: "text", text: String(content) }]
        : [];
    }

    if (msgType === "assistant") {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const btype = block.type as string;

        if (btype === "text") {
          let text = ((block.text as string) || "").trim();
          if (text && text !== "(no content)") {
            text = text.replace(RE_ANSI, "");
            messages.push({ role: "assistant", content_type: "text", text });
          }
        } else if (btype === "tool_use") {
          const toolId = block.id as string;
          const name = (block.name as string) || "unknown";
          const inp = (block.input as Record<string, unknown>) || {};
          const summary = formatToolSummary(name, inp);

          const msg: ChatMessage = {
            role: "assistant",
            content_type: "tool",
            text: summary,
            tool_name: name,
            result: null,
            detail: null,
            is_error: false,
          };
          messages.push(msg);

          if (toolId) {
            pendingTools.set(toolId, {
              toolName: name,
              msgIndex: messages.length - 1,
            });
          }
        } else if (btype === "thinking") {
          const thinkingText = block.thinking as string;
          if (thinkingText) {
            messages.push({
              role: "assistant",
              content_type: "thinking",
              text: thinkingText,
            });
          }
        }
      }
    } else if (msgType === "user") {
      const userTextParts: string[] = [];

      for (const block of content) {
        if (!block || typeof block !== "object") {
          if (typeof block === "string" && (block as string).trim()) {
            userTextParts.push((block as string).trim());
          }
          continue;
        }
        const btype = block.type as string;

        if (btype === "tool_result") {
          const toolUseId = block.tool_use_id as string;
          const resultContent = block.content;
          let resultText = extractText(resultContent).replace(RE_ANSI, "");
          const isError = block.is_error as boolean;

          const toolInfo = pendingTools.get(toolUseId);
          if (toolInfo) pendingTools.delete(toolUseId);
          const toolName = toolInfo?.toolName || null;

          let stats: string;
          if (isError) {
            const errorLine = resultText
              ? resultText.split("\n")[0].slice(0, 100)
              : "Error";
            stats = `Error: ${errorLine}`;
          } else {
            stats = formatResultStats(resultText, toolName);
          }

          if (toolInfo && toolInfo.msgIndex < messages.length) {
            const target = messages[toolInfo.msgIndex];
            target.result = stats;
            target.detail = resultText || null;
            target.is_error = isError;
          }
        } else if (btype === "text") {
          const t = ((block.text as string) || "").trim();
          if (
            t &&
            !/(<(bash-input|bash-stdout|bash-stderr|local-command|system-reminder|command-name))/.test(
              t
            )
          ) {
            userTextParts.push(t);
          }
        }
      }

      if (userTextParts.length) {
        const combined = userTextParts.join("\n");
        if (!/<(local-command-stdout|command-name)/.test(combined)) {
          messages.push({
            role: "user",
            content_type: "text",
            text: combined.replace(RE_ANSI, ""),
          });
        }
      }
    }
  }

  return messages;
}
