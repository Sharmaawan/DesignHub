import { SocialAccount } from '@prisma/client';
import { SocialPlatformAdapter, PublishPayload, ExchangeResult, PlatformAnalytics, NotConfiguredError } from './types';

// LinkedIn's current versioned REST APIs (Posts, Images, Social Actions) all require
// this header — a monthly version string, not a real API version number.
const LINKEDIN_VERSION = '202405';
const API_BASE = 'https://api.linkedin.com';

function linkedinConfigured(): boolean {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
}

async function linkedinFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw Object.assign(new Error(data?.message || 'LinkedIn API request failed'), { status: res.status });
  }
  return { data, headers: res.headers };
}

// Registers an image upload slot, then PUTs the actual bytes (fetched from our own
// hosted media URL) to the one-time upload URL LinkedIn hands back. Returns the image
// URN to reference from a post — same two-step pattern LinkedIn's Images API requires.
async function uploadImage(personUrn: string, accessToken: string, mediaUrl: string): Promise<string> {
  const { data: init } = await linkedinFetch('/rest/images?action=initializeUpload', accessToken, {
    method: 'POST',
    body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
  });
  const uploadUrl = init.value.uploadUrl as string;
  const imageUrn = init.value.image as string;

  const imageRes = await fetch(mediaUrl);
  if (!imageRes.ok) throw Object.assign(new Error('Could not fetch the design image to upload to LinkedIn'), { status: 502 });
  const bytes = await imageRes.arrayBuffer();

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: bytes,
  });
  if (!putRes.ok) throw Object.assign(new Error('LinkedIn image upload failed'), { status: putRes.status });

  return imageUrn;
}

export const linkedinAdapter: SocialPlatformAdapter = {
  platform: 'linkedin',

  isConfigured: linkedinConfigured,

  getAuthUrl(state, redirectUri) {
    if (!linkedinConfigured()) throw new NotConfiguredError('LinkedIn');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID || '',
      redirect_uri: redirectUri,
      state,
      scope: 'openid profile email w_member_social',
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  },

  async exchangeCodeForToken(code, redirectUri): Promise<ExchangeResult> {
    if (!linkedinConfigured()) throw new NotConfiguredError('LinkedIn');

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({})) as any;
      throw Object.assign(new Error(err?.error_description || 'LinkedIn token exchange failed'), { status: tokenRes.status });
    }
    const tokenData = await tokenRes.json() as any;
    const accessToken = tokenData.access_token as string;
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : undefined;

    // Personal profiles have exactly one publishable identity — the caller's own
    // profile — unlike Facebook Pages there's no multi-account picker step here.
    const userRes = await fetch(`${API_BASE}/v2/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!userRes.ok) throw Object.assign(new Error('Failed to read LinkedIn profile'), { status: userRes.status });
    const profile = await userRes.json() as any;

    return {
      accessToken,
      expiresAt,
      accounts: [{ platformUserId: profile.sub, platformUsername: profile.name }],
    };
  },

  async publish(account: SocialAccount, post: PublishPayload) {
    const personUrn = `urn:li:person:${account.platformUserId}`;
    const commentary = [post.caption, post.hashtags?.length ? post.hashtags.map((h) => `#${h.replace(/^#/, '')}`).join(' ') : null]
      .filter(Boolean).join('\n\n');

    const body: Record<string, any> = {
      author: personUrn,
      commentary,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };

    if (post.mediaType === 'carousel' && post.mediaUrls.length > 1) {
      const images = await Promise.all(post.mediaUrls.map((url) => uploadImage(personUrn, account.accessToken, url)));
      body.content = { multiImage: { images: images.map((id) => ({ id })) } };
    } else {
      const imageUrn = await uploadImage(personUrn, account.accessToken, post.mediaUrls[0]);
      body.content = { media: { id: imageUrn, ...(post.altText ? { altText: post.altText } : {}) } };
    }

    const { headers } = await linkedinFetch('/rest/posts', account.accessToken, { method: 'POST', body: JSON.stringify(body) });
    // The Posts API returns the created post's URN in a response header, not the body.
    const postUrn = headers.get('x-restli-id') || headers.get('x-linkedin-id') || '';
    if (!postUrn) throw Object.assign(new Error('LinkedIn accepted the post but did not return an id'), { status: 502 });

    if (post.firstComment) {
      await linkedinFetch(`/rest/socialActions/${encodeURIComponent(postUrn)}/comments`, account.accessToken, {
        method: 'POST',
        body: JSON.stringify({ actor: personUrn, message: { text: post.firstComment } }),
      }).catch(() => {
        // Best-effort — the main post already succeeded.
      });
    }

    return { platformPostId: postUrn };
  },

  async getAnalytics(account: SocialAccount, platformPostId: string): Promise<PlatformAnalytics> {
    // Full reach/impressions data requires LinkedIn's Community Management API, which
    // needs a separate partner approval beyond basic "Share on LinkedIn" access — those
    // two fields honestly report 0 rather than pretending to have data we can't fetch.
    const { data } = await linkedinFetch(`/rest/socialActions/${encodeURIComponent(platformPostId)}`, account.accessToken);
    return {
      likes: data.likesSummary?.totalLikes || 0,
      comments: data.commentsSummary?.totalFirstLevelComments || 0,
      shares: 0,
      reach: 0,
      impressions: 0,
    };
  },
};
