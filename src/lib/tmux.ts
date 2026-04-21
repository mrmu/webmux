import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface TmuxSession {
  name: string;
  created: string;
  attached: boolean;
  width: number;
  height: number;
  activity: string;
}

// If TMUX_SOCKET is set, use -S to connect to a specific socket file.
// This is how the container connects to the host's tmux server.
const TMUX_SOCKET = process.env.TMUX_SOCKET || "";

async function runTmux(...args: string[]): Promise<string> {
  const fullArgs = TMUX_SOCKET ? ["-S", TMUX_SOCKET, ...args] : args;
  try {
    const { stdout } = await execFileAsync("tmux", fullArgs);
    return stdout;
  } catch (err: unknown) {
    const error = err as { stderr?: string };
    const stderr = error.stderr || "";
    if (
      stderr.includes("no server running") ||
      stderr.includes("No such file or directory") ||
      stderr.includes("session not found") ||
      stderr.includes("can't find session")
    ) {
      return "";
    }
    throw err;
  }
}

export async function listSessions(): Promise<TmuxSession[]> {
  let out: string;
  try {
    out = await runTmux(
      "list-sessions",
      "-F",
      "#{session_name}|||#{session_created}|||#{session_attached}|||#{window_width}|||#{window_height}|||#{session_activity}"
    );
  } catch {
    return [];
  }

  return out
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [name, created, attached, width, height, activity] =
        line.split("|||");
      return {
        name,
        created,
        attached: attached !== "0",
        width: parseInt(width) || 200,
        height: parseInt(height) || 50,
        activity,
      };
    });
}

export async function createSession(
  name: string,
  command?: string,
  cwd?: string
): Promise<TmuxSession> {
  // Set PATH in tmux global env so new sessions can find host tools (claude, git, etc.)
  const currentPath = process.env.PATH || "";
  await runTmux("set-environment", "-g", "PATH", currentPath).catch(() => {});

  const args = ["new-session", "-d", "-s", name, "-x", "200", "-y", "50"];
  if (cwd) args.push("-c", cwd);
  if (command) args.push(command);
  await runTmux(...args);

  const sessions = await listSessions();
  const session = sessions.find((s) => s.name === name);
  if (!session) throw new Error(`Session '${name}' created but not found`);
  return session;
}

export async function killSession(name: string): Promise<void> {
  await runTmux("kill-session", "-t", `=${name}`);
}

export async function sendKeys(
  sessionName: string,
  keys: string
): Promise<void> {
  await runTmux("send-keys", "-t", `=${sessionName}`, "-l", keys);
  await runTmux("send-keys", "-t", `=${sessionName}`, "Enter");
}

export async function sendRawKeys(
  sessionName: string,
  keys: string
): Promise<void> {
  await runTmux("send-keys", "-t", `=${sessionName}`, "-l", keys);
}

export async function sendSpecialKey(
  sessionName: string,
  key: string
): Promise<void> {
  await runTmux("send-keys", "-t", `=${sessionName}`, key);
}

export async function capturePane(
  sessionName: string,
  scrollback = 500
): Promise<string> {
  return runTmux("capture-pane", "-t", `=${sessionName}`, "-p", "-S", `-${scrollback}`);
}

export async function getPaneCommand(sessionName: string): Promise<string> {
  try {
    const out = await runTmux(
      "display-message",
      "-t",
      `=${sessionName}`,
      "-p",
      "#{pane_current_command}"
    );
    return out.trim();
  } catch {
    return "";
  }
}

export async function resizePane(
  sessionName: string,
  width: number,
  height: number
): Promise<void> {
  await runTmux(
    "resize-window",
    "-t",
    `=${sessionName}`,
    "-x",
    String(width),
    "-y",
    String(height)
  );
}

// ─── Window management ─────────────────────────────────────────────

export interface TmuxWindow {
  index: number;
  name: string;
  active: boolean;
}

export async function listWindows(sessionName: string): Promise<TmuxWindow[]> {
  try {
    const out = await runTmux(
      "list-windows",
      "-t",
      `=${sessionName}`,
      "-F",
      "#{window_index}|||#{window_name}|||#{window_active}"
    );
    return out
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .map((line) => {
        const [index, name, active] = line.split("|||");
        return {
          index: parseInt(index),
          name,
          active: active === "1",
        };
      });
  } catch {
    return [];
  }
}

export async function createWindow(
  sessionName: string,
  name?: string,
  cwd?: string
): Promise<TmuxWindow> {
  const args = ["new-window", "-t", `=${sessionName}`];
  if (name) args.push("-n", name);
  if (cwd) args.push("-c", cwd);
  await runTmux(...args);

  const windows = await listWindows(sessionName);
  // New window is the last one
  return windows[windows.length - 1];
}

export async function killWindow(
  sessionName: string,
  windowIndex: number
): Promise<void> {
  await runTmux("kill-window", "-t", `=${sessionName}:${windowIndex}`);
}

/** Lines to filter from Claude Code terminal output. */
function isTerminalChrome(line: string): boolean {
  const s = line.trim();
  // Separator lines (─────)
  if (s.length >= 5 && /^[─━─-]{5,}$/.test(s)) return true;
  // Status bar / tmux chrome
  if (s.includes("bypass permissions") || s.includes("shift+tab to cycle")) return true;
  if (s.includes("tmux focus-events") || s.includes("focus tracking")) return true;
  if (s.includes("⏵") && s.includes("permissions")) return true;
  return false;
}

/** Parse Claude Code terminal output into conversation messages (fallback). */
export function parseClaudeConversation(
  rawText: string
): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];
  const lines = rawText.split("\n");
  const humanPromptRe = /^[❯>]\s*(.*)/;

  let currentRole: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();

    if (!stripped && !currentRole) continue;
    if (isTerminalChrome(line)) continue;

    const humanMatch = stripped.match(humanPromptRe);
    if (humanMatch) {
      if (currentRole && currentContent.length) {
        const content = currentContent.join("\n").trim();
        if (content) messages.push({ role: currentRole, content });
      }
      currentRole = "human";
      currentContent = [humanMatch[1]];
      continue;
    }

    if (currentRole === "human" && stripped && !humanMatch) {
      if (currentContent.length) {
        const content = currentContent.join("\n").trim();
        if (content) messages.push({ role: currentRole, content });
      }
      currentRole = "assistant";
      currentContent = [line];
      continue;
    }

    if (currentRole) currentContent.push(line);
  }

  if (currentRole && currentContent.length) {
    const content = currentContent.join("\n").trim();
    if (content) messages.push({ role: currentRole, content });
  }

  return messages;
}
