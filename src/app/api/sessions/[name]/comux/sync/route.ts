import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncComuxDir, importComuxDocsFromFile } from "@/lib/sync-comux-dir";

/** Manual re-sync of `.comux/`. Order matters:
 *   1. Pull deploy.md / test.md edits back into the DB (file may hold
 *      changes a sub-agent or external editor made).
 *   2. Regenerate auto files + write DB-canonical deploy.md / test.md.
 *  This way a user clicking "同步 .comux/" after editing the file sees
 *  their edits land in the DB, not get overwritten by stale DB content. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const imported = await importComuxDocsFromFile(name);
  await syncComuxDir(name);
  return NextResponse.json({ ok: true, imported });
}
