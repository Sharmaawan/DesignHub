import prisma from './prisma';

// Everyone uses one shared team. The maker/approver workflow only governs team
// members, so every user is placed into this single org team on login. A fixed set
// of admin emails are the approvers; everyone else is an editor (= maker).
const DEFAULT_TEAM_NAME = process.env.DEFAULT_TEAM_NAME || 'Cutm Organization';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'kalyankv@cutmap.ac.in,221801370004@cutmap.ac.in')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// The two admin emails approve; everyone else is a maker. 'admin' is in the social
// route's APPROVER_ROLES, 'editor' is not.
export function roleForEmail(email: string): 'admin' | 'editor' {
  return ADMIN_EMAILS.includes((email || '').toLowerCase()) ? 'admin' : 'editor';
}

// Ensures the user is a member of the one org team with the role their email dictates,
// and returns that role. Idempotent, and re-syncs the role on every login so promoting
// or demoting an admin is just an ADMIN_EMAILS change + re-login — no stale roles.
export async function ensureTeamMembership(userId: string, email: string): Promise<string> {
  const desiredRole = roleForEmail(email);

  let team = await prisma.team.findFirst({ where: { name: DEFAULT_TEAM_NAME } });
  if (!team) {
    team = await prisma.team.create({ data: { name: DEFAULT_TEAM_NAME, ownerId: userId } });
  }

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: team.id, userId } },
  }).catch(() => null);

  if (!membership) {
    await prisma.teamMember
      .create({ data: { teamId: team.id, userId, role: desiredRole } })
      .catch((e: any) => { if (e?.code !== 'P2002') throw e; });
  } else if (membership.role !== desiredRole) {
    await prisma.teamMember.update({ where: { id: membership.id }, data: { role: desiredRole } });
  }

  return desiredRole;
}

// The user's role in the org team, for endpoints (like /me) that report it without
// going through a login. Falls back to the email-derived role if membership hasn't
// been created yet (e.g. first /me before a post-deploy login).
export async function getTeamRole(userId: string, email: string): Promise<string> {
  const team = await prisma.team.findFirst({ where: { name: DEFAULT_TEAM_NAME }, select: { id: true } });
  if (team) {
    const m = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: team.id, userId } },
      select: { role: true },
    }).catch(() => null);
    if (m) return m.role;
  }
  return roleForEmail(email);
}
