import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    projectsRoot:
      process.env.PROJECTS_ROOT ||
      `${process.env.HOME || "/home/user"}/next`,
  });
}
