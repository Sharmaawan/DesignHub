import prisma from './prisma';

// The maker/approver workflow only governs team members, and the product requires
// every user to be governed by it — so no one is allowed to use the app without a
// team. Rather than hard-blocking teamless logins (which would lock out anyone who
// predates this rule, and risks locking out everyone if no team exists yet), we
// guarantee membership: any user without a team is placed into a single shared org
// team as an 'editor' (= maker). Admins invite people into other teams and hand out
// the 'approver' role on top of this baseline.
const DEFAULT_TEAM_NAME = process.env.DEFAULT_TEAM_NAME || 'Organization';

// Idempotent: returns immediately if the user already belongs to any team. Safe to
// call on every login/registration.
export async function ensureTeamMembership(userId: string): Promise<void> {
  const existing = await prisma.teamMember.findFirst({ where: { userId }, select: { id: true } });
  if (existing) return;

  const team = await prisma.team.findFirst({ where: { name: DEFAULT_TEAM_NAME } });
  if (!team) {
    // First user to ever need a team creates it and owns it — the org's initial
    // approver. An admin can reassign roles afterwards. Done in one nested write so
    // a team can't be created without its owning membership.
    await prisma.team.create({
      data: { name: DEFAULT_TEAM_NAME, ownerId: userId, members: { create: { userId, role: 'owner' } } },
    });
    return;
  }
  // Guard the unique(teamId, userId) constraint against a race between two concurrent
  // logins of the same brand-new user — treat "already a member" as success.
  await prisma.teamMember
    .create({ data: { teamId: team.id, userId, role: 'editor' } })
    .catch((e: any) => { if (e?.code !== 'P2002') throw e; });
}
