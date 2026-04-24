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

// Claude Code animates the status spinner through several glyphs; include
// whichever ones we've observed plus generic fallbacks. The full format of a
// status line is roughly:
//     {spinner} {Verbing}… ({time} · {tokens} · {extra info})
// e.g. "✢ Deliberating… (2m 40s · ↓ 7.4k tokens · thought for 3s)"
const STATUS_SPINNERS = new Set(["·", "✻", "✽", "✶", "✳", "✢", "*", "●", "○"]);

export function parseStatusLine(paneText: string): string | null {
  if (!paneText) return null;
  const lines = paneText.split("\n");

  // Scan the tail of the pane (Claude's status sits a few lines above the
  // prompt chrome but can be separated from it by Tip continuations or blank
  // lines, so anchoring strictly to the chrome is fragile). Walk backwards
  // looking for a line that matches the spinner signature.
  const scanFrom = Math.max(0, lines.length - 25);
  for (let i = lines.length - 1; i >= scanFrom; i--) {
    const line = lines[i].trim();
    if (!line || line.length < 3) continue;
    if (!STATUS_SPINNERS.has(line[0])) continue;
    if (line[1] !== " ") continue;
    const rest = line.slice(2).trim();
    // Distinctive shape: contains an ellipsis (…) and usually a parenthetical
    // timer. Anything that matches this is almost certainly the status line.
    if (!/…/.test(rest)) continue;
    return rest;
  }
  return null;
}
