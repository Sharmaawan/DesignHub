import { SocialAccount } from '@prisma/client';
import { SocialPlatformAdapter, PublishPayload, ExchangeResult, PlatformAnalytics, NotConfiguredError } from './types';
import { metaConfigured, metaAuthUrl, metaExchangeCode, metaFetchPages, graphGet, graphPost } from './metaShared';

const SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'read_insights'];

export const facebookAdapter: SocialPlatformAdapter = {
  platform: 'facebook',

  isConfigured: metaConfigured,

  getAuthUrl(state, redirectUri) {
    if (!metaConfigured()) throw new NotConfiguredError('Facebook');
    return metaAuthUrl(state, redirectUri, SCOPES);
  },

  async exchangeCodeForToken(code, redirectUri): Promise<ExchangeResult> {
    if (!metaConfigured()) throw new NotConfiguredError('Facebook');
    const { accessToken, expiresAt } = await metaExchangeCode(code, redirectUri);
    const pages = await metaFetchPages(accessToken);
    return {
      accessToken,
      expiresAt,
      // One candidate per Facebook Page the user manages — the caller offers a picker
      // when there's more than one instead of silently choosing the first.
      accounts: pages.map((p) => ({
        platformUserId: p.id,
        platformUsername: p.name,
        pageAccessToken: p.access_token,
      })),
    };
  },

  async publish(account: SocialAccount, post: PublishPayload) {
    const pageId = account.platformUserId;
    const pageToken = account.accessToken; // the Page access token, stored at connect time
    const caption = [post.caption, post.hashtags?.length ? post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ') : null]
      .filter(Boolean).join('\n\n');

    let result: { id: string };

    if (post.mediaType === 'video') {
      result = await graphPost(`/${pageId}/videos`, pageToken, {
        file_url: post.mediaUrls[0],
        description: caption,
      });
    } else if (post.mediaType === 'carousel' && post.mediaUrls.length > 1) {
      // Upload each image unpublished, then attach them all to one feed post.
      const uploaded = await Promise.all(
        post.mediaUrls.map((url) => graphPost(`/${pageId}/photos`, pageToken, { url, published: 'false' }))
      );
      const attachedMedia: Record<string, string> = {};
      uploaded.forEach((u, i) => { attachedMedia[`attached_media[${i}]`] = JSON.stringify({ media_fbid: u.id }); });
      result = await graphPost(`/${pageId}/feed`, pageToken, {
        message: caption,
        ...(post.linkUrl ? { link: post.linkUrl } : {}),
        ...attachedMedia,
      });
    } else if (post.mediaType === 'story') {
      const photo = await graphPost(`/${pageId}/photos`, pageToken, { url: post.mediaUrls[0], published: 'false' });
      result = await graphPost(`/${pageId}/photo_stories`, pageToken, { photo_id: photo.id });
    } else {
      // Single image post
      result = await graphPost(`/${pageId}/photos`, pageToken, {
        url: post.mediaUrls[0],
        caption,
      });
    }

    if (post.firstComment) {
      await graphPost(`/${result.id}/comments`, pageToken, { message: post.firstComment }).catch(() => {
        // First comment is best-effort — the main post already succeeded.
      });
    }

    return { platformPostId: result.id };
  },

  async getAnalytics(account: SocialAccount, platformPostId: string): Promise<PlatformAnalytics> {
    const data = await graphGet(`/${platformPostId}`, account.accessToken, {
      fields: 'likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_impressions_unique)',
    });
    const impressionsMetric = data.insights?.data?.find((m: any) => m.name === 'post_impressions');
    const reachMetric = data.insights?.data?.find((m: any) => m.name === 'post_impressions_unique');
    return {
      likes: data.likes?.summary?.total_count || 0,
      comments: data.comments?.summary?.total_count || 0,
      shares: data.shares?.count || 0,
      reach: reachMetric?.values?.[0]?.value || 0,
      impressions: impressionsMetric?.values?.[0]?.value || 0,
    };
  },
};
