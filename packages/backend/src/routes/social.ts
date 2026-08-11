import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import { remapUpstreamStatus } from '../lib/http';
import { getAdapter, listAdapters, PLATFORM_SPECS, ExchangedAccount } from '../lib/socialPlatforms';
import { DEFAULT_TEAM_NAME } from '../lib/defaultTeam';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'designhub-secret-key-2024';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// OAuth callbacks are plain browser redirects — they can't carry an Authorization
// header, so the calling user's identity travels in a signed `state` param instead
// (same JWT_SECRET already used for session tokens, short-lived, single purpose).
interface OAuthState { userId: string; platform: string }

function signState(userId: string, platform: string): string {
  return jwt.sign({ userId, platform } as OAuthState, JWT_SECRET, { expiresIn: '10m' });
}

function verifyState(state: string): OAuthState {
  return jwt.verify(state, JWT_SECRET) as OAuthState;
}

// Holds multi-account OAuth results (e.g. several Facebook Pages) between the
// callback and the user picking one — never holds anything longer than 10 minutes,
// and access tokens inside it never reach the browser directly (only sanitized
// id/username pairs do, via GET /pending/:id).
interface PendingSelection { userId: string; platform: string; accessToken: string; expiresAt?: Date; accounts: ExchangedAccount[]; createdAt: number }
const pendingSelections = new Map<string, PendingSelection>();
const PENDING_TTL_MS = 10 * 60 * 1000;

function sweepExpiredPending() {
  const now = Date.now();
  for (const [id, entry] of pendingSelections) {
    if (now - entry.createdAt > PENDING_TTL_MS) pendingSelections.delete(id);
  }
}

async function saveAccount(userId: string, platform: string, accessToken: string, expiresAt: Date | undefined, account: ExchangedAccount) {
  const tokenToEncrypt = account.pageAccessToken || accessToken;
  return prisma.socialAccount.upsert({
    where: { userId_platform_platformUserId: { userId, platform, platformUserId: account.platformUserId } },
    update: {
      platformUserId: account.platformUserId,
      platformUsername: account.platformUsername,
      accessToken: encryptSecret(tokenToEncrypt),
      tokenExpiresAt: expiresAt,
      isActive: true,
    },
    create: {
      userId,
      platform,
      platformUserId: account.platformUserId,
      platformUsername: account.platformUsername,
      accessToken: encryptSecret(tokenToEncrypt),
      tokenExpiresAt: expiresAt,
    },
  });
}

function maskAccount(a: { id: string; platform: string; platformUsername: string | null; isActive: boolean; createdAt: Date; tokenExpiresAt: Date | null }) {
  return {
    id: a.id,
    platform: a.platform,
    platformUsername: a.platformUsername,
    isActive: a.isActive,
    connectedAt: a.createdAt,
    tokenExpiresAt: a.tokenExpiresAt,
  };
}

// Adapters operate on the real token — the DB only ever holds the encrypted form.
function withDecryptedToken<T extends { accessToken: string }>(account: T): T {
  return { ...account, accessToken: decryptSecret(account.accessToken) };
}

// ===== MAKER / APPROVER =====
// Roles that may approve or reject a team's pending posts. 'maker' is the default
// role every team member gets on first login; 'editor' is granted only via an
// accepted Team-page invite (see lib/defaultTeam.ts) — that's the actual approver
// tier day to day, alongside the fixed 'admin' emails.
const APPROVER_ROLES = ['editor', 'approver', 'admin', 'owner'];

// A user's team membership drives the workflow: makers submit for approval, approvers
// act on the queue. The app has one shared org team (see defaultTeam.ts) that every
// user is auto-joined to — but a user can ALSO independently own/belong to other,
// unrelated teams (e.g. one they created before the shared-team model, or via some
// other flow). Resolving membership must specifically target the shared org team by
// name, not just take whichever row `findFirst` happens to return first — an
// unrelated team where the user is 'owner' would otherwise masquerade as their
// approver-tier role in the shared team's workflow.
async function getMembership(userId: string): Promise<{ teamId: string; role: string } | null> {
  const team = await prisma.team.findFirst({ where: { name: DEFAULT_TEAM_NAME }, select: { id: true } });
  if (!team) return null;
  const m = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: team.id, userId } },
    select: { teamId: true, role: true },
  });
  return m ? { teamId: m.teamId, role: m.role } : null;
}

// SocialAccount rows are still owned by whichever individual connected them (no
// teamId column — see the plan doc, avoiding a migration), but on a team they're
// effectively a shared resource: every APPROVER_ROLES member of a team sees and can
// use every other approver-tier teammate's connected accounts, and a maker sees that
// same pool (read-only) instead of needing — or being allowed — a personal
// connection of their own. A user with no team membership at all keeps exactly
// today's solo, per-user-only behavior.
async function accountOwnerScope(userId: string): Promise<string | { in: string[] }> {
  const membership = await getMembership(userId);
  if (!membership) return userId;
  const approverTeammates = await prisma.teamMember.findMany({
    where: { teamId: membership.teamId, role: { in: APPROVER_ROLES } },
    select: { userId: true },
  });
  const ids = approverTeammates.map((m) => m.userId);
  // The caller's own team has no approver-tier member yet (shouldn't normally
  // happen — someone has to have created the team) — fall back to their own
  // accounts rather than an empty/impossible `in: []` filter.
  return ids.length > 0 ? { in: ids } : userId;
}

// Authoritative check for whether `userId` may submit/act using an account owned by
// someone else — mirrors accountOwnerScope's sharing model exactly (same team, and
// the account's owner is approver-tier) so a request can never reach further with an
// account GET /accounts wouldn't have offered it in the first place.
async function canUseAccount(userId: string, account: { userId: string }): Promise<boolean> {
  if (userId === account.userId) return true;
  const [callerMembership, ownerMembership] = await Promise.all([getMembership(userId), getMembership(account.userId)]);
  return !!callerMembership && !!ownerMembership
    && callerMembership.teamId === ownerMembership.teamId
    && APPROVER_ROLES.includes(ownerMembership.role);
}

// Actually run the platform publish for an already-persisted post and move it to
// published/failed. Shared by the direct-publish path and the approve endpoint so the
// two can never drift. Returns the updated post row.
async function executePublish(postId: string) {
  const post = await prisma.socialPost.findUnique({ where: { id: postId }, include: { socialAccount: true } });
  if (!post) throw Object.assign(new Error('Post not found'), { status: 404 });

  // By the time anything calls this, a platform/account must already be attached —
  // POST /posts sets both together for a direct publish, and POST /:id/send resolves
  // them (for a maker-originated post that had neither at submission time) before
  // ever calling this. This is just the type-narrowing guard for that invariant.
  if (!post.socialAccountId || !post.platform || !post.socialAccount) {
    return prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'failed', errorMessage: 'No social account is attached to this post yet.' },
    });
  }

  // Meta/Pinterest publish by handing the media URL to the *platform*, whose servers
  // then fetch it — a localhost URL can never work there. This has to be checked HERE
  // (right before actually contacting the platform), not back in POST /posts at
  // submission time: a maker's post held for approval, or a draft, never reaches this
  // function at all, so it shouldn't be blocked by a check that only matters once
  // something is genuinely about to go out. Checking it at submission time made local
  // dev (no public HTTPS origin) unable to even create a pending-approval post.
  const mediaUrls = post.mediaUrls as string[];
  if (mediaUrls.some((u) => !/^https?:\/\//.test(u)) || mediaUrls.some((u) => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(u))) {
    return prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: 'failed',
        errorMessage: 'Media URL is not publicly reachable. Set FRONTEND_URL (or PUBLIC_MEDIA_URL) on the API to this deployment\'s public https origin.',
      },
    });
  }

  const adapter = getAdapter(post.platform);
  if (!adapter || !adapter.isConfigured()) {
    return prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'failed', errorMessage: `${post.platform} isn't configured yet` },
    });
  }
  try {
    const result = await adapter.publish(withDecryptedToken(post.socialAccount), {
      mediaType: post.mediaType as any,
      mediaUrls: post.mediaUrls as string[],
      caption: post.caption,
      hashtags: post.hashtags as string[] | null,
      altText: post.altText,
      firstComment: post.firstComment,
      linkUrl: post.linkUrl,
    });
    return prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'published', publishedAt: new Date(), platformPostId: result.platformPostId },
    });
  } catch (err: any) {
    console.error('[social/posts] publish failed', err);
    const failed = await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'failed', errorMessage: err.message || 'Publish failed' },
    });
    throw Object.assign(new Error(failed.errorMessage || 'Publish failed'), { status: err.status || 500, post: failed });
  }
}

// ===== PLATFORM CONFIG =====
router.get('/platforms', authMiddleware, async (_req: AuthRequest, res: Response) => {
  const platforms = listAdapters().map((a) => ({
    platform: a.platform,
    configured: a.isConfigured(),
    spec: PLATFORM_SPECS[a.platform],
  }));
  res.json(platforms);
});

// ===== ACCOUNTS =====
router.get('/accounts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.socialAccount.findMany({ where: { userId: await accountOwnerScope(req.userId!) } });
    res.json(accounts.map(maskAccount));
  } catch (err) {
    console.error('[social/accounts] list failed', err);
    res.status(500).json({ error: 'Failed to fetch connected accounts' });
  }
});

router.delete('/accounts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.socialAccount.findUnique({ where: { id: req.params.id } });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    // The account's own connector can always disconnect it; otherwise it's only
    // disconnectable by an approver-tier teammate on the SAME team as whoever
    // connected it (mirrors accountOwnerScope's sharing model) — a maker, or an
    // approver on a different team, still gets a 404.
    if (account.userId !== req.userId) {
      const [ownerMembership, callerMembership] = await Promise.all([
        getMembership(account.userId),
        getMembership(req.userId!),
      ]);
      const authorized = !!ownerMembership && !!callerMembership
        && ownerMembership.teamId === callerMembership.teamId
        && APPROVER_ROLES.includes(callerMembership.role);
      if (!authorized) return res.status(404).json({ error: 'Account not found' });
    }
    await prisma.socialAccount.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[social/accounts] disconnect failed', err);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// ===== OAUTH CONNECT =====
// Called via authenticated fetch — returns the URL to navigate to, rather than
// redirecting itself, since this is an XHR call and the actual OAuth hop needs a
// real browser navigation (window.location.href = authUrl on the frontend).
router.get('/connect/:platform', authMiddleware, async (req: AuthRequest, res: Response) => {
  const adapter = getAdapter(req.params.platform);
  if (!adapter) return res.status(404).json({ error: 'Unknown platform' });
  if (!adapter.isConfigured()) {
    return res.status(400).json({ error: `${req.params.platform} isn't configured yet — add API credentials to enable it.` });
  }
  const membership = await getMembership(req.userId!);
  if (membership && !APPROVER_ROLES.includes(membership.role)) {
    return res.status(403).json({ error: 'Only a team editor or approver can connect social accounts' });
  }
  try {
    const state = signState(req.userId!, req.params.platform);
    const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/social/callback/${req.params.platform}`;
    const authUrl = adapter.getAuthUrl(state, redirectUri);
    res.json({ authUrl });
  } catch (err: any) {
    console.error('[social/connect] failed', err);
    res.status(remapUpstreamStatus(err.status || 500)).json({ error: err.message || 'Failed to start connection' });
  }
});

// Plain browser redirect target — no Authorization header available, identity comes
// from the signed `state` param instead.
router.get('/callback/:platform', async (req, res: Response) => {
  const platform = req.params.platform;
  const adapter = getAdapter(platform);
  const { code, state, error: oauthError } = req.query as Record<string, string>;

  if (oauthError) {
    return res.redirect(`${FRONTEND_URL}/social?error=${encodeURIComponent(oauthError)}`);
  }
  if (!adapter || !code || !state) {
    return res.redirect(`${FRONTEND_URL}/social?error=invalid_callback`);
  }

  let decoded: OAuthState;
  try {
    decoded = verifyState(state);
  } catch {
    return res.redirect(`${FRONTEND_URL}/social?error=invalid_state`);
  }

  try {
    const redirectUri = `${process.env.API_BASE_URL || 'http://localhost:3001'}/api/social/callback/${platform}`;
    const result = await adapter.exchangeCodeForToken(code, redirectUri);

    if (result.accounts.length === 0) {
      return res.redirect(`${FRONTEND_URL}/social?error=no_account&platform=${platform}`);
    }

    if (result.accounts.length === 1) {
      await saveAccount(decoded.userId, platform, result.accessToken, result.expiresAt, result.accounts[0]);
      return res.redirect(`${FRONTEND_URL}/social?connected=${platform}`);
    }

    // Multiple candidate accounts (e.g. several Facebook Pages) — let the user pick
    // one instead of silently choosing the first.
    sweepExpiredPending();
    const pendingId = `pnd_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    pendingSelections.set(pendingId, {
      userId: decoded.userId, platform, accessToken: result.accessToken, expiresAt: result.expiresAt,
      accounts: result.accounts, createdAt: Date.now(),
    });
    return res.redirect(`${FRONTEND_URL}/social?pending=${pendingId}&platform=${platform}`);
  } catch (err: any) {
    console.error('[social/callback] failed', err);
    return res.redirect(`${FRONTEND_URL}/social?error=${encodeURIComponent(err.message || 'connection_failed')}`);
  }
});

router.get('/pending/:pendingId', authMiddleware, async (req: AuthRequest, res: Response) => {
  sweepExpiredPending();
  const entry = pendingSelections.get(req.params.pendingId);
  if (!entry || entry.userId !== req.userId) return res.status(404).json({ error: 'Nothing pending — it may have expired, try connecting again' });
  res.json({
    platform: entry.platform,
    accounts: entry.accounts.map((a) => ({ platformUserId: a.platformUserId, platformUsername: a.platformUsername })),
  });
});

router.post('/pending/:pendingId/select', authMiddleware, async (req: AuthRequest, res: Response) => {
  sweepExpiredPending();
  const entry = pendingSelections.get(req.params.pendingId);
  if (!entry || entry.userId !== req.userId) return res.status(404).json({ error: 'Nothing pending — it may have expired, try connecting again' });
  // Defense in depth — a maker can never reach a real pending entry via the normal
  // flow since /connect already blocks them, but re-check here too rather than
  // trusting that alone.
  const membership = await getMembership(req.userId!);
  if (membership && !APPROVER_ROLES.includes(membership.role)) {
    return res.status(403).json({ error: 'Only a team editor or approver can connect social accounts' });
  }
  const { platformUserIds } = req.body as { platformUserIds: string[] };
  if (!Array.isArray(platformUserIds) || platformUserIds.length === 0) {
    return res.status(400).json({ error: 'Pick at least one account to connect' });
  }
  const chosen = platformUserIds.map((id) => entry.accounts.find((a) => a.platformUserId === id));
  if (chosen.some((c) => !c)) return res.status(400).json({ error: 'That account was not part of the connection result' });
  try {
    const saved = await Promise.all(
      chosen.map((c) => saveAccount(entry.userId, entry.platform, entry.accessToken, entry.expiresAt, c!))
    );
    pendingSelections.delete(req.params.pendingId);
    res.json(saved.map(maskAccount));
  } catch (err) {
    console.error('[social/pending/select] failed', err);
    res.status(500).json({ error: 'Failed to finish connecting the account' });
  }
});

// ===== POSTS =====
router.post('/posts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { socialAccountId, projectId, action, mediaType, mediaUrls: rawMediaUrls, caption, hashtags, altText, firstComment, linkUrl, scheduledFor } = req.body;

    // Meta and Pinterest publish by handing the media URL to the *platform*, whose
    // servers then fetch it — so a relative "/uploads/x.png" won't work as-is. Resolve
    // to the deployment's public origin here rather than trusting whatever the browser
    // sent, so scheduled posts (published later, with no browser involved) store a
    // fetchable URL too. Whether that resolved URL is ACTUALLY publicly reachable
    // (not localhost, has a real public origin configured) is validated later, in
    // executePublish, right before something is actually sent to the platform — not
    // here, since a pending-approval post or a draft never reaches that point at all
    // and shouldn't be blocked by a check that only matters once publishing is real.
    const PUBLIC_ORIGIN = (process.env.PUBLIC_MEDIA_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const mediaUrls: string[] = (Array.isArray(rawMediaUrls) ? rawMediaUrls : []).map((u: string) =>
      typeof u === 'string' && u.startsWith('/') ? `${PUBLIC_ORIGIN}${u}` : u
    );

    // A maker submitting for approval doesn't pick a platform/account at all — that
    // choice is deferred to whichever editor/approver eventually publishes it (see
    // POST /:id/send). Everyone else (no team, or approver-tier) still has to name
    // an account up front since they're publishing/scheduling for real right now.
    const membership = await getMembership(req.userId!);
    const isMaker = !!membership && !APPROVER_ROLES.includes(membership.role);

    if (!socialAccountId) {
      if (!isMaker) return res.status(400).json({ error: 'Choose a social account to publish to' });
      if (action === 'schedule') {
        return res.status(400).json({ error: 'Scheduling isn\'t available yet — an editor or approver picks the account (and can schedule) once they publish' });
      }

      const post = await prisma.socialPost.create({
        data: {
          userId: req.userId!,
          projectId: projectId || null,
          socialAccountId: null,
          platform: null,
          status: 'pending_approval',
          mediaType,
          mediaUrls,
          caption,
          hashtags,
          altText,
          firstComment,
          linkUrl,
          teamId: membership!.teamId,
          submittedById: req.userId!,
        },
      });

      const approvers = await prisma.teamMember.findMany({
        where: { teamId: membership!.teamId, role: { in: APPROVER_ROLES } },
        select: { userId: true },
      });
      const author = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true, email: true } });
      const who = author?.name || author?.email || 'A team member';
      await prisma.notification.createMany({
        data: approvers
          .filter((a) => a.userId !== req.userId)
          .map((a) => ({ userId: a.userId, type: 'social_approval_request', message: `${who} submitted a design for your approval` })),
      }).catch((e) => console.error('[social/posts] failed to notify approvers', e));
      const io = req.app.get('io');
      approvers
        .filter((a) => a.userId !== req.userId)
        .forEach((a) => io?.to(`user:${a.userId}`).emit('social:pending-changed'));
      return res.json(post);
    }

    const account = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
    if (!account || !(await canUseAccount(req.userId!, account))) return res.status(404).json({ error: 'Social account not found' });

    const adapter = getAdapter(account.platform);
    if (!adapter || !adapter.isConfigured()) {
      // Re-checked here even though the UI should already gray this out — a stub
      // platform must fail server-side too if reached directly.
      return res.status(400).json({ error: `${account.platform} isn't configured yet — add API credentials to enable it.` });
    }

    // Authoritative size/format check — never trust the frontend's own validation.
    const spec = PLATFORM_SPECS[account.platform];
    if (spec && !spec.mediaTypes.includes(mediaType)) {
      return res.status(400).json({ error: `${spec.label} doesn't support ${mediaType} posts` });
    }
    if (spec && caption && caption.length > spec.maxCaptionLength) {
      return res.status(400).json({ error: `Caption exceeds ${spec.label}'s ${spec.maxCaptionLength} character limit` });
    }

    // Reaching this point means an account was supplied, which the branch above
    // only allows for a non-maker caller — so this always publishes/schedules/drafts
    // directly, never goes through approval.
    const status = action === 'draft' ? 'draft' : action === 'schedule' ? 'scheduled' : 'publishing';

    const post = await prisma.socialPost.create({
      data: {
        userId: req.userId!,
        projectId: projectId || null,
        socialAccountId,
        platform: account.platform,
        status,
        mediaType,
        mediaUrls,
        caption,
        hashtags,
        altText,
        firstComment,
        linkUrl,
        scheduledFor: action === 'schedule' && scheduledFor ? new Date(scheduledFor) : null,
      },
    });

    if (action === 'now') {
      try {
        const published = await executePublish(post.id);
        return res.json(published);
      } catch (err: any) {
        return res.status(remapUpstreamStatus(err.status || 500)).json(err.post ?? { error: err.message || 'Publish failed' });
      }
    }

    res.json(post);
  } catch (err) {
    console.error('[social/posts] create failed', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

router.get('/posts', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const posts = await prisma.socialPost.findMany({
      where: { userId: req.userId },
      include: { analytics: true, socialAccount: { select: { platform: true, platformUsername: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(posts);
  } catch (err) {
    console.error('[social/posts] list failed', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// ===== APPROVAL WORKFLOW =====
// Tells the client whether to show the approver queue and how the Publish button
// should read (maker → "Submit for approval", approver → "Publish").
router.get('/approval-context', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const membership = await getMembership(req.userId!);
    const isApprover = !!membership && APPROVER_ROLES.includes(membership.role);
    res.json({
      inTeam: !!membership,
      role: membership?.role ?? null,
      isApprover,
      // Only a non-approver team member has posts held for review.
      isMaker: !!membership && !isApprover,
    });
  } catch (err) {
    console.error('[social/approval-context] failed', err);
    res.status(500).json({ error: 'Failed to load approval context' });
  }
});

// The approver's queue: everything awaiting review OR already approved and waiting
// to be sent (the send step moved to the approver tier — see POST /:id/send) on the
// teams they can approve for. The frontend splits this one list into two sections by
// `status`.
router.get('/posts/pending-approval', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const membership = await getMembership(req.userId!);
    if (!membership || !APPROVER_ROLES.includes(membership.role)) return res.json([]);
    const posts = await prisma.socialPost.findMany({
      where: { teamId: membership.teamId, status: { in: ['pending_approval', 'approved'] } },
      include: {
        socialAccount: { select: { platform: true, platformUsername: true } },
        user: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json(posts);
  } catch (err) {
    console.error('[social/posts/pending-approval] failed', err);
    res.status(500).json({ error: 'Failed to fetch pending posts' });
  }
});

// Load the post an approver is about to act on, verifying they may act on it.
async function loadForApproval(postId: string, userId: string) {
  const membership = await getMembership(userId);
  if (!membership || !APPROVER_ROLES.includes(membership.role)) {
    throw Object.assign(new Error('Only an approver can do that'), { status: 403 });
  }
  const post = await prisma.socialPost.findUnique({ where: { id: postId } });
  if (!post || post.teamId !== membership.teamId) throw Object.assign(new Error('Pending post not found'), { status: 404 });
  if (post.status !== 'pending_approval') throw Object.assign(new Error('This post is no longer awaiting approval'), { status: 409 });
  return post;
}

router.post('/posts/:id/approve', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const post = await loadForApproval(req.params.id, req.userId!);

    // A future scheduled time still goes straight back to the scheduler — nobody's
    // expected to be at their desk to hand-fire a 3am post, so approval there is
    // sufficient on its own. For a "now" post, approval only clears it; an
    // editor/approver on the team makes the actual publish happen via POST
    // /:id/send, rather than it firing the instant Approve is clicked.
    const future = post.scheduledFor && post.scheduledFor.getTime() > Date.now();
    const result = await prisma.socialPost.update({
      where: { id: post.id },
      data: { approvedById: req.userId!, approvedAt: new Date(), rejectionReason: null, status: future ? 'scheduled' : 'approved' },
    });

    if (post.submittedById) {
      await prisma.notification.create({
        data: {
          userId: post.submittedById,
          type: 'social_approval_decision',
          message: future
            ? `Your ${post.platform || 'design'} post was approved and scheduled`
            : `Your design was approved — an editor or approver on your team will publish it`,
        },
      }).catch((e) => console.error('[social/approve] notify failed', e));
    }
    req.app.get('io')?.to(`user:${post.userId}`).emit('social:post-decided', { postId: post.id, status: result.status });
    res.json(result);
  } catch (err: any) {
    console.error('[social/approve] failed', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to approve post' });
  }
});

// An approver-tier team member's action, once a maker's post has been approved:
// actually publish it. Kept separate from /approve so an approver clicking Approve
// never itself fires the platform call — a deliberate second, explicit step. This
// used to be the submitting maker's own action; it moved to the approver tier
// alongside restricting social-account connecting to editors/approvers (the account
// being published through is now theirs, not the maker's).
router.post('/posts/:id/send', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.id } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const membership = await getMembership(req.userId!);
    const authorized = !!membership && APPROVER_ROLES.includes(membership.role) && post.teamId === membership.teamId;
    if (!authorized) {
      return res.status(403).json({ error: 'Only a team editor or approver can send this post' });
    }
    if (post.status !== 'approved') {
      return res.status(409).json({ error: 'This post is not approved and ready to send' });
    }

    // A maker never chose a platform/account — this is the first point one gets
    // attached to the post, by whichever editor/approver is sending it now.
    let targetPostId = post.id;
    if (!post.socialAccountId) {
      const { socialAccountId } = req.body as { socialAccountId?: string };
      if (!socialAccountId) return res.status(400).json({ error: 'Choose which connected account to publish to' });
      const account = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
      if (!account || !(await canUseAccount(req.userId!, account))) return res.status(404).json({ error: 'Social account not found' });

      const adapter = getAdapter(account.platform);
      if (!adapter || !adapter.isConfigured()) {
        return res.status(400).json({ error: `${account.platform} isn't configured yet — add API credentials to enable it.` });
      }
      const spec = PLATFORM_SPECS[account.platform];
      if (spec && !spec.mediaTypes.includes(post.mediaType as any)) {
        return res.status(400).json({ error: `${spec.label} doesn't support ${post.mediaType} posts` });
      }
      if (spec && post.caption && post.caption.length > spec.maxCaptionLength) {
        return res.status(400).json({ error: `Caption exceeds ${spec.label}'s ${spec.maxCaptionLength} character limit` });
      }

      const updated = await prisma.socialPost.update({
        where: { id: post.id },
        data: { socialAccountId, platform: account.platform },
      });
      targetPostId = updated.id;
    }

    try {
      const result = await executePublish(targetPostId);
      res.json(result);
    } catch (err: any) {
      // executePublish already marked the post failed — surface why but still 200
      // so the maker sees the failure state on the post rather than a raw error.
      res.json(err.post ?? { ...post, status: 'failed', errorMessage: err.message });
    }
  } catch (err: any) {
    console.error('[social/send] failed', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to send post' });
  }
});

router.post('/posts/:id/reject', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const post = await loadForApproval(req.params.id, req.userId!);
    const reason = (req.body?.reason || '').toString().trim();

    const rejected = await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'rejected', approvedById: req.userId!, rejectionReason: reason || null },
    });

    if (post.submittedById) {
      await prisma.notification.create({
        data: {
          userId: post.submittedById,
          type: 'social_approval_decision',
          message: reason
            ? `Your ${post.platform} post was rejected: ${reason}`
            : `Your ${post.platform} post was rejected`,
        },
      }).catch((e) => console.error('[social/reject] notify failed', e));
    }
    req.app.get('io')?.to(`user:${post.userId}`).emit('social:post-decided', { postId: post.id, status: rejected.status });
    res.json(rejected);
  } catch (err: any) {
    console.error('[social/reject] failed', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to reject post' });
  }
});

router.get('/posts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.id }, include: { analytics: true } });
    if (!post || post.userId !== req.userId) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    console.error('[social/posts/:id] fetch failed', err);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

router.put('/posts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.id } });
    if (!post || post.userId !== req.userId) return res.status(404).json({ error: 'Post not found' });
    // A rejected post is also editable — this is how a maker "edits and resubmits":
    // the SAME row goes back to pending_approval instead of creating an orphaned
    // duplicate that leaves the original rejected post stranded in their history.
    if (post.status !== 'draft' && post.status !== 'scheduled' && post.status !== 'rejected') {
      return res.status(400).json({ error: 'Only drafts, scheduled, and rejected posts can be edited' });
    }
    const { caption, hashtags, altText, firstComment, linkUrl, scheduledFor, mediaUrls, mediaType } = req.body;
    const wasRejected = post.status === 'rejected';
    const updated = await prisma.socialPost.update({
      where: { id: req.params.id },
      data: {
        caption, hashtags, altText, firstComment, linkUrl, mediaUrls, mediaType,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
        ...(wasRejected ? { status: 'pending_approval', rejectionReason: null, approvedById: null, approvedAt: null } : {}),
      },
    });

    if (wasRejected && post.teamId) {
      const approvers = await prisma.teamMember.findMany({
        where: { teamId: post.teamId, role: { in: APPROVER_ROLES } },
        select: { userId: true },
      });
      const author = await prisma.user.findUnique({ where: { id: req.userId! }, select: { name: true, email: true } });
      const who = author?.name || author?.email || 'A team member';
      await prisma.notification.createMany({
        data: approvers
          .filter((a) => a.userId !== req.userId)
          .map((a) => ({ userId: a.userId, type: 'social_approval_request', message: `${who} resubmitted a ${post.platform} post for your approval` })),
      }).catch((e) => console.error('[social/posts/:id] resubmit notify failed', e));
      const io = req.app.get('io');
      approvers.filter((a) => a.userId !== req.userId).forEach((a) => io?.to(`user:${a.userId}`).emit('social:pending-changed'));
    }

    res.json(updated);
  } catch (err) {
    console.error('[social/posts/:id] update failed', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

router.delete('/posts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.id } });
    if (!post || post.userId !== req.userId) return res.status(404).json({ error: 'Post not found' });
    await prisma.socialPost.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[social/posts/:id] delete failed', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ===== ANALYTICS =====
router.get('/posts/:id/analytics', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.socialPost.findUnique({ where: { id: req.params.id }, include: { socialAccount: true } });
    if (!post || post.userId !== req.userId) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'published' || !post.platformPostId) {
      return res.status(400).json({ error: 'Analytics are only available for published posts' });
    }
    // A published post always has a platform/account attached (executePublish only
    // sets status: 'published' after a real publish, which requires both) — this is
    // just the type-narrowing guard for that invariant.
    if (!post.platform || !post.socialAccount) {
      return res.status(400).json({ error: 'No social account is attached to this post' });
    }
    const adapter = getAdapter(post.platform);
    if (!adapter || !adapter.isConfigured()) {
      return res.status(400).json({ error: `${post.platform} isn't configured yet` });
    }
    const stats = await adapter.getAnalytics(withDecryptedToken(post.socialAccount), post.platformPostId);
    const analytics = await prisma.socialPostAnalytics.upsert({
      where: { socialPostId: post.id },
      update: { ...stats, fetchedAt: new Date() },
      create: { socialPostId: post.id, ...stats },
    });
    res.json(analytics);
  } catch (err: any) {
    console.error('[social/posts/:id/analytics] fetch failed', err);
    res.status(remapUpstreamStatus(err.status || 500)).json({ error: err.message || 'Failed to fetch analytics' });
  }
});

export default router;
export { pendingSelections, sweepExpiredPending };
