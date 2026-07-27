import prisma from './prisma';

// Everyone uses one shared team. The maker/approver workflow only governs team
// members, so every user is placed into this single org team on login.
//
// Three tiers:
//  - 'admin'  — a fixed, hardcoded email list (ADMIN_EMAILS). Full access, always.
//  - 'editor' — an approver. NOT auto-granted: only reachable by an admin sending a
//               Team-page invite with role=editor, which the invitee then accepts.
//  - 'maker'  — the default for everyone else the moment they first log in. Blocked
//               from publishing directly; needs an editor/admin to approve.
// 'editor' is deliberately excluded from roleForEmail's output — it's a role you're
// promoted into via an accepted invite, never one assigned automatically by email.
const DEFAULT_TEAM_NAME = process.env.DEFAULT_TEAM_NAME || 'Cutm Organization';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'kalyankv@cutmap.ac.in,221801370004@cutmap.ac.in')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function roleForEmail(email: string): 'admin' | 'maker' {
  return ADMIN_EMAILS.includes((email || '').toLowerCase()) ? 'admin' : 'maker';
}

// Ensures the user is a member of the one org team, and returns their role. Admin
// status re-syncs on every login (so an ADMIN_EMAILS change + re-login is enough to
// promote/demote an admin) — but an existing 'editor' role is left alone, since that
// was deliberately granted via an accepted invite, not derived from the email list.
// A brand new member (no row yet) gets 'maker'.
export async function ensureTeamMembership(userId: string, email: string): Promise<string> {
  const emailRole = roleForEmail(email);

  let team = await prisma.team.findFirst({ where: { name: DEFAULT_TEAM_NAME } });
  if (!team) {
    team = await prisma.team.create({ data: { name: DEFAULT_TEAM_NAME, ownerId: userId } });
  }

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: team.id, userId } },
  }).catch(() => null);

  if (!membership) {
    await prisma.teamMember
      .create({ data: { teamId: team.id, userId, role: emailRole } })
      .catch((e: any) => { if (e?.code !== 'P2002') throw e; });
    return emailRole;
  }

  // Admin-by-email always wins (promote/demote via ADMIN_EMAILS). Otherwise, only
  // correct a stale 'admin' row for someone removed from ADMIN_EMAILS back down to
  // 'maker' — an invite-granted 'editor' role is never touched here.
  if (emailRole === 'admin' && membership.role !== 'admin') {
    await prisma.teamMember.update({ where: { id: membership.id }, data: { role: 'admin' } });
    return 'admin';
  }
  if (emailRole !== 'admin' && membership.role === 'admin') {
    await prisma.teamMember.update({ where: { id: membership.id }, data: { role: 'maker' } });
    return 'maker';
  }
  return membership.role;
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
