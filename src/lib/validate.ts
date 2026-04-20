import path from "path";

/** Validate session/project name — alphanumeric, dash, underscore only */
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function isValidSessionName(name: string): boolean {
  return name.length > 0 && name.length <= 100 && SAFE_NAME_RE.test(name);
}

/** Validate cwd is within PROJECTS_ROOT */
export function isValidCwd(cwd: string): boolean {
  const projectsRoot =
    process.env.PROJECTS_ROOT ||
    `${process.env.HOME || "/home/user"}/next`;
  const resolved = path.resolve(cwd);
  const root = path.resolve(projectsRoot);
  return resolved === root || resolved.startsWith(root + path.sep);
}

/** Validate command — no shell metacharacters, reasonable length */
const DANGEROUS_PATTERNS = [
  /[|;&`$(){}]/,     // shell operators
  /\.\.\//,          // path traversal
  /curl.*\|/i,       // pipe from curl
  /wget.*\|/i,
];

export function isValidCommand(command: string): boolean {
  if (!command || command.length > 200) return false;
  return !DANGEROUS_PATTERNS.some((p) => p.test(command));
}
