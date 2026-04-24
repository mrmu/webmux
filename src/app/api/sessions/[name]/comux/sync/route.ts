import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { syncComuxDir } from "@/lib/sync-comux-dir";

/** Manual re-sync of `.comux/` — useful when a project existed before this
 *  feature shipped, or after someone manually deleted the directory. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  await syncComuxDir(name);
  return NextResponse.json({ ok: true });
}
