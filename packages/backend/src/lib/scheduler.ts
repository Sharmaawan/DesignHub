import prisma from './prisma';
import { getAdapter } from './socialPlatforms';
import { decryptSecret } from './crypto';

// No job-queue infra exists in this codebase (no Redis/BullMQ) — a 60s poll is the
// right-sized tool for a single-process dev-scale app, not a reason to add one.
const TICK_MS = 60 * 1000;
let isTickRunning = false;

async function publishDuePost(postId: string) {
  // Atomically claim the post before doing any network I/O: a plain UPDATE ... WHERE
  // status='scheduled' AND id=? only succeeds (count===1) for whichever tick gets
  // there first. This — not the interval itself — is what prevents double-publishing
  // if a previous tick's Graph API call is still in flight past 60s.
  const claim = await prisma.socialPost.updateMany({
    where: { id: postId, status: 'scheduled' },
    data: { status: 'publishing' },
  });
  if (claim.count === 0) return; // another tick already claimed it, or it moved on

  const post = await prisma.socialPost.findUnique({ where: { id: postId }, include: { socialAccount: true } });
  if (!post) return;

  const adapter = getAdapter(post.platform);
  if (!adapter || !adapter.isConfigured()) {
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'failed', errorMessage: `${post.platform} isn't configured yet` },
    });
    return;
  }

  try {
    const account = { ...post.socialAccount, accessToken: decryptSecret(post.socialAccount.accessToken) };
    const result = await adapter.publish(account, {
      mediaType: post.mediaType as any,
      mediaUrls: post.mediaUrls as string[],
      caption: post.caption,
      hashtags: post.hashtags as string[] | null,
      altText: post.altText,
      firstComment: post.firstComment,
      linkUrl: post.linkUrl,
    });
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'published', publishedAt: new Date(), platformPostId: result.platformPostId },
    });
  } catch (err: any) {
    console.error('[scheduler] publish failed', post.id, err);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: 'failed', errorMessage: err.message || 'Scheduled publish failed' },
    });
  }
}

async function tick() {
  if (isTickRunning) return;
  isTickRunning = true;
  try {
    const due = await prisma.socialPost.findMany({
      where: { status: 'scheduled', scheduledFor: { lte: new Date() } },
      select: { id: true },
    });
    for (const post of due) {
      await publishDuePost(post.id);
    }
  } catch (err) {
    console.error('[scheduler] tick failed', err);
  } finally {
    isTickRunning = false;
  }
}

export function startScheduler() {
  setInterval(tick, TICK_MS);
  console.log('[scheduler] social post scheduler started (60s interval)');
}
