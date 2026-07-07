import { SocialAccount } from '@prisma/client';
import { SocialPlatformAdapter, PublishPayload, ExchangeResult, PlatformAnalytics, NotConfiguredError } from './types';
import { metaConfigured, metaAuthUrl, metaExchangeCode, metaFetchPages, graphGet, graphPost } from './metaShared';

// Instagram Business publishing authenticates through the same Meta app as Facebook
// (there's no separate Instagram-only OAuth), but only Pages with a *linked* Instagram
// Business Account can actually publish — every other Page is filtered out here.
const SCOPES = ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish', 'read_insights'];

export const instagramAdapter: SocialPlatformAdapter = {
  platform: 'instagram',

  isConfigured: metaConfigured,

  getAuthUrl(state, redirectUri) {
    if (!metaConfigured()) throw new NotConfiguredError('Instagram');
    return metaAuthUrl(state, redirectUri, SCOPES);
  },

  async exchangeCodeForToken(code, redirectUri): Promise<ExchangeResult> {
    if (!metaConfigured()) throw new NotConfiguredError('Instagram');
    const { accessToken, expiresAt } = await metaExchangeCode(code, redirectUri);
    const pages = await metaFetchPages(accessToken);
    const linked = pages.filter((p) => !!p.instagram_business_account);

    const accounts = await Promise.all(linked.map(async (p) => {
      const igId = p.instagram_business_account!.id;
      const profile = await graphGet(`/${igId}`, p.access_token, { fields: 'username' }).catch(() => ({ username: p.name }));
      return {
        platformUserId: igId,
        platformUsername: profile.username || p.name,
        pageAccessToken: p.access_token, // publishing to the IG account uses the linked Page's token
      };
    }));

    return { accessToken, expiresAt, accounts };
  },

  async publish(account: SocialAccount, post: PublishPayload) {
    const igId = account.platformUserId;
    const token = account.accessToken;
    const caption = [post.caption, post.hashtags?.length ? post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ') : null]
      .filter(Boolean).join('\n\n');

    let containerId: string;

    if (post.mediaType === 'carousel' && post.mediaUrls.length > 1) {
      const children = await Promise.all(
        post.mediaUrls.map((url) => graphPost(`/${igId}/media`, token, { image_url: url, is_carousel_item: 'true' }))
      );
      const parent = await graphPost(`/${igId}/media`, token, {
        media_type: 'CAROUSEL',
        children: children.map((c) => c.id).join(','),
        caption,
      });
      containerId = parent.id;
    } else if (post.mediaType === 'video' || post.mediaType === 'story') {
      const container = await graphPost(`/${igId}/media`, token, {
        media_type: post.mediaType === 'story' ? 'STORIES' : 'REELS',
        video_url: post.mediaUrls[0],
        ...(post.mediaType === 'story' ? {} : { caption }),
      });
      containerId = container.id;
    } else {
      const container = await graphPost(`/${igId}/media`, token, {
        image_url: post.mediaUrls[0],
        caption,
        ...(post.altText ? { alt_text: post.altText } : {}),
      });
      containerId = container.id;
    }

    const published = await graphPost(`/${igId}/media_publish`, token, { creation_id: containerId });

    if (post.firstComment) {
      await graphPost(`/${published.id}/comments`, token, { message: post.firstComment }).catch(() => {
        // Best-effort — the main post already succeeded.
      });
    }

    return { platformPostId: published.id };
  },

  async getAnalytics(account: SocialAccount, platformPostId: string): Promise<PlatformAnalytics> {
    const [insights, comments] = await Promise.all([
      graphGet(`/${platformPostId}/insights`, account.accessToken, { metric: 'impressions,reach,likes,comments,shares,saved' }).catch(() => ({ data: [] })),
      graphGet(`/${platformPostId}`, account.accessToken, { fields: 'like_count,comments_count' }).catch(() => ({})),
    ]);
    const metric = (name: string) => insights.data?.find((m: any) => m.name === name)?.values?.[0]?.value || 0;
    return {
      likes: comments.like_count ?? metric('likes'),
      comments: comments.comments_count ?? metric('comments'),
      shares: metric('shares'),
      reach: metric('reach'),
      impressions: metric('impressions'),
    };
  },
};
