import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import { remapUpstreamStatus } from '../lib/http';
import { getAdapter, listAdapters, PLATFORM_SPECS, ExchangedAccount } from '../lib/socialPlatforms';

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
    const accounts = await prisma.socialAccount.findMany({ where: { userId: req.userId } });
    res.json(accounts.map(maskAccount));
  } catch (err) {
    console.error('[social/accounts] list failed', err);
    res.status(500).json({ error: 'Failed to fetch connected accounts' });
  }
});

router.delete('/accounts/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.socialAccount.findUnique({ where: { id: req.params.id } });
    if (!account || account.userId !== req.userId) return res.status(404).json({ error: 'Account not found' });
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
    // servers then fetch it — so a relative "/uploads/x.png" (or anything pointing at
    // localhost) can never work, and the failure surfaces as an opaque upstream error.
    // Resolve to the deployment's public origin here rather than trusting whatever the
    // browser sent, so scheduled posts (published later, with no browser involved)
    // store a fetchable URL too.
    const PUBLIC_ORIGIN = (process.env.PUBLIC_MEDIA_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const mediaUrls: string[] = (Array.isArray(rawMediaUrls) ? rawMediaUrls : []).map((u: string) =>
      typeof u === 'string' && u.startsWith('/') ? `${PUBLIC_ORIGIN}${u}` : u
    );
    if (mediaUrls.some((u) => !/^https?:\/\//.test(u))) {
      return res.status(400).json({
        error: 'Media URL is not publicly reachable. Set FRONTEND_URL (or PUBLIC_MEDIA_URL) on the API to this deployment\'s public https origin.',
      });
    }
    if (mediaUrls.some((u) => /^https?:\/\/(localhost|127\.0\.0\.1)/.test(u))) {
      return res.status(400).json({
        error: 'Media URL points at localhost, which social platforms cannot fetch. Set FRONTEND_URL (or PUBLIC_MEDIA_URL) to the public origin.',
      });
    }

    const account = await prisma.socialAccount.findUnique({ where: { id: socialAccountId } });
    if (!account || account.userId !== req.userId) return res.status(404).json({ error: 'Social account not found' });

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
        const result = await adapter.publish(withDecryptedToken(account), { mediaType, mediaUrls, caption, hashtags, altText, firstComment, linkUrl });
        const published = await prisma.socialPost.update({
          where: { id: post.id },
          data: { status: 'published', publishedAt: new Date(), platformPostId: result.platformPostId },
        });
        return res.json(published);
      } catch (err: any) {
        console.error('[social/posts] publish failed', err);
        const failed = await prisma.socialPost.update({
          where: { id: post.id },
          data: { status: 'failed', errorMessage: err.message || 'Publish failed' },
        });
        return res.status(remapUpstreamStatus(err.status || 500)).json(failed);
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
    if (post.status !== 'draft' && post.status !== 'scheduled') {
      return res.status(400).json({ error: 'Only drafts and scheduled posts can be edited' });
    }
    const { caption, hashtags, altText, firstComment, linkUrl, scheduledFor, mediaUrls, mediaType } = req.body;
    const updated = await prisma.socialPost.update({
      where: { id: req.params.id },
      data: { caption, hashtags, altText, firstComment, linkUrl, mediaUrls, mediaType, scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined },
    });
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
