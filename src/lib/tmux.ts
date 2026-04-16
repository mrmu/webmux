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

async function runTmux(...args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("tmux", args);
    return stdout;
  } catch (err: unknown) {
    const error = err as { stderr?: string };
    if (error.stderr && error.stderr.includes("no server running")) {
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
  await runTmux("kill-session", "-t", name);
}

export async function sendKeys(
  sessionName: string,
  keys: string
): Promise<void> {
  await runTmux("send-keys", "-t", sessionName, "-l", keys);
  await runTmux("send-keys", "-t", sessionName, "Enter");
}

export async function sendRawKeys(
  sessionName: string,
  keys: string
): Promise<void> {
  await runTmux("send-keys", "-t", sessionName, "-l", keys);
}

export async function sendSpecialKey(
  sessionName: string,
  key: string
): Promise<void> {
  await runTmux("send-keys", "-t", sessionName, key);
}

export async function capturePane(sessionName: string): Promise<string> {
  return runTmux("capture-pane", "-t", sessionName, "-p", "-S", "-32768");
}

export async function getPaneCommand(sessionName: string): Promise<string> {
  try {
    const out = await runTmux(
      "display-message",
      "-t",
      sessionName,
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
    sessionName,
    "-x",
    String(width),
    "-y",
    String(height)
  );
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
