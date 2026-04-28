export type RepoUrlKind = "ssh" | "https" | "unknown" | "empty";

/** Pure URL parsing — safe to import from client bundles. The server-side
 *  `git.ts` re-exports this so existing imports keep working. */
export function classifyRepoUrl(url: string): RepoUrlKind {
  const u = url.trim();
  if (!u) return "empty";
  if (/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:[^/].+/.test(u)) return "ssh";
  if (u.startsWith("ssh://")) return "ssh";
  if (u.startsWith("https://") || u.startsWith("http://")) return "https";
  return "unknown";
}
