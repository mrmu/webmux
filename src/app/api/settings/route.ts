import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

export async function GET(request: NextRequest) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectsRoot = await getSetting("projectsRoot");
  return NextResponse.json({ projectsRoot });
}

export async function PUT(request: NextRequest) {
  if (!requireAuth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (body.projectsRoot !== undefined) {
    await setSetting("projectsRoot", body.projectsRoot);
  }
  return NextResponse.json({ ok: true });
}
