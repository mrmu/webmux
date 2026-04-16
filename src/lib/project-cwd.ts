import { prisma } from "./db";

/** Get the working directory for a project from the database. */
export async function getProjectCwd(projectName: string): Promise<string | null> {
  try {
    const project = await prisma.project.findUnique({
      where: { name: projectName },
      select: { cwd: true },
    });
    return project?.cwd || null;
  } catch {
    return null;
  }
}
