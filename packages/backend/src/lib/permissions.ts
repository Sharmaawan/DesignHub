import prisma from './prisma';

export type ProjectPermission = 'owner' | 'editor' | 'commenter' | 'viewer' | null;

// Single source of truth for "what can this user do with this project", shared by
// the GET (surfaces it to the frontend as `myPermission`) and PUT (enforces it)
// handlers in routes/projects.ts, so the two can never drift out of sync.
export async function getProjectPermission(
  projectId: string,
  userId: string | undefined
): Promise<ProjectPermission> {
  if (!userId) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) return null;
  if (project.ownerId === userId) return 'owner';
  const collaborator = await prisma.collaborator.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return (collaborator?.permission as ProjectPermission) || null;
}
