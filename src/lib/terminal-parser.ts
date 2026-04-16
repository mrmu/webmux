export interface InteractiveUIContent {
  content: string;
  name: string;
}

interface UIPattern {
  name: string;
  top: RegExp[];
  bottom: RegExp[];
  minGap: number;
}

const UI_PATTERNS: UIPattern[] = [
  {
    name: "ExitPlanMode",
    top: [
      /^\s*Would you like to proceed\?/,
      /^\s*Claude has written up a plan/,
    ],
    bottom: [/^\s*ctrl-g to edit in /, /^\s*Esc to (cancel|exit)/],
    minGap: 2,
  },
  {
    name: "AskUserQuestion",
    top: [/^\s*←\s+[☐✔☒]/],
    bottom: [], // Multi-tab: no bottom needed
    minGap: 1,
  },
  {
    name: "AskUserQuestion",
    top: [/^\s*[☐✔☒]/],
    bottom: [/^\s*Enter to select/],
    minGap: 1,
  },
  {
    name: "PermissionPrompt",
    top: [
      /^\s*Do you want to proceed\?/,
      /^\s*Do you want to make this edit/,
    ],
    bottom: [/^\s*Esc to cancel/],
    minGap: 2,
  },
  {
    name: "RestoreCheckpoint",
    top: [/^\s*Restore the code/],
    bottom: [/^\s*Enter to continue/],
    minGap: 2,
  },
  {
    name: "Settings",
    top: [/^\s*Settings:.*tab to cycle/, /^\s*Select model/],
    bottom: [
      /Esc to cancel/,
      /Esc to exit/,
      /Enter to confirm/,
      /^\s*Type to filter/,
    ],
    minGap: 2,
  },
];

const LONG_DASH_RE = /^─{5,}$/;

function shortenSeparators(text: string): string {
  return text
    .split("\n")
    .map((line) => (LONG_DASH_RE.test(line) ? "─────" : line))
    .join("\n");
}

function tryExtract(
  lines: string[],
  pattern: UIPattern
): InteractiveUIContent | null {
  let topIdx: number | null = null;
  let bottomIdx: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (topIdx === null) {
      if (pattern.top.some((p) => p.test(lines[i]))) topIdx = i;
    } else if (
      pattern.bottom.length &&
      pattern.bottom.some((p) => p.test(lines[i]))
    ) {
      bottomIdx = i;
      break;
    }
  }

  if (topIdx === null) return null;

  if (!pattern.bottom.length) {
    for (let i = lines.length - 1; i > topIdx; i--) {
      if (lines[i].trim()) {
        bottomIdx = i;
        break;
      }
    }
  }

  if (bottomIdx === null || bottomIdx - topIdx < pattern.minGap) return null;

  const content = lines
    .slice(topIdx, bottomIdx + 1)
    .join("\n")
    .trimEnd();
  return { content: shortenSeparators(content), name: pattern.name };
}

export function extractInteractiveContent(
  paneText: string
): InteractiveUIContent | null {
  if (!paneText) return null;
  const lines = paneText.trim().split("\n");
  for (const pattern of UI_PATTERNS) {
    const result = tryExtract(lines, pattern);
    if (result) return result;
  }
  return null;
}

const STATUS_SPINNERS = new Set(["·", "✻", "✽", "✶", "✳", "✢"]);

export function parseStatusLine(paneText: string): string | null {
  if (!paneText) return null;
  const lines = paneText.split("\n");

  let chromeIdx: number | null = null;
  const searchStart = Math.max(0, lines.length - 10);
  for (let i = searchStart; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (stripped.length >= 20 && [...stripped].every((c) => c === "─")) {
      chromeIdx = i;
      break;
    }
  }

  if (chromeIdx === null) return null;

  for (let i = chromeIdx - 1; i > Math.max(chromeIdx - 5, -1); i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (STATUS_SPINNERS.has(line[0])) return line.slice(1).trim();
    return null;
  }
  return null;
}
