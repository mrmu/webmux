import path from "path";

/** Validate session/project name — alphanumeric, dash, underscore only */
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function isValidSessionName(name: string): boolean {
  return name.length > 0 && name.length <= 100 && SAFE_NAME_RE.test(name);
}

/** Validate cwd is within any of the given roots (variadic for the common
 *  case of `[projectsRoot, comuxSelfRoot]`). The self-root exception lets
 *  the comux project manage itself even when the source dir lives outside
 *  PROJECTS_ROOT — without it, you can't bootstrap comux on a new host. */
export function isValidCwd(cwd: string, ...roots: string[]): boolean {
  const resolved = path.resolve(cwd);
  return roots.some((root) => {
    const r = path.resolve(root);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
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
