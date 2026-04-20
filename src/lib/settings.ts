import { prisma } from "./db";

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } }).catch(() => null);
  return row?.value || null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getProjectsRoot(): Promise<string> {
  return (
    (await getSetting("projectsRoot")) ||
    process.env.PROJECTS_ROOT ||
    `${process.env.HOME || "/home/user"}/projects`
  );
}

export async function isSetupComplete(): Promise<boolean> {
  const userCount = await prisma.user.count().catch(() => 0);
  const root = await getSetting("projectsRoot");
  return userCount > 0 && root !== null;
}
