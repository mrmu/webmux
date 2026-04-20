import { NextRequest, NextResponse } from "next/server";
import { getProjectsRoot, isSetupComplete } from "@/lib/settings";

export async function GET() {
  const projectsRoot = await getProjectsRoot();
  const setupComplete = await isSetupComplete();
  return NextResponse.json({ projectsRoot, setupComplete });
}
