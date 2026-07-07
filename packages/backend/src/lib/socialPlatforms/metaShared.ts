// Shared by facebook.ts and instagram.ts — both authenticate through the same Meta
// (Facebook Login) OAuth app and the same Graph API, differing only in which
// Page-linked identity they publish to and how they shape publish/analytics calls.
// Instagram Business publishing is done via the linked Facebook Page's access token,
// not a separate Instagram-only OAuth flow.

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export function metaConfigured(): boolean {
  return !!(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET);
}

export function metaAuthUrl(state: string, redirectUri: string, scopes: string[]): string {
  const params = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID || '',
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

interface GraphPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

export async function metaExchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; expiresAt?: Date }> {
  const appId = process.env.FACEBOOK_APP_ID || '';
  const appSecret = process.env.FACEBOOK_APP_SECRET || '';

  // Step 1: short-lived user token
  const shortRes = await fetch(`${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code,
  })}`);
  if (!shortRes.ok) {
    const err = await shortRes.json().catch(() => ({})) as any;
    throw Object.assign(new Error(err?.error?.message || 'Facebook token exchange failed'), { status: shortRes.status });
  }
  const shortData = await shortRes.json() as any;

  // Step 2: exchange for a long-lived user token (~60 days) so we're not asking users
  // to reconnect every couple of hours.
  const longRes = await fetch(`${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortData.access_token,
  })}`);
  if (!longRes.ok) {
    const err = await longRes.json().catch(() => ({})) as any;
    throw Object.assign(new Error(err?.error?.message || 'Facebook long-lived token exchange failed'), { status: longRes.status });
  }
  const longData = await longRes.json() as any;
  const expiresAt = longData.expires_in ? new Date(Date.now() + longData.expires_in * 1000) : undefined;
  return { accessToken: longData.access_token, expiresAt };
}

export async function metaFetchPages(userAccessToken: string): Promise<GraphPage[]> {
  const res = await fetch(`${GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userAccessToken)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw Object.assign(new Error(err?.error?.message || 'Failed to list Facebook Pages'), { status: res.status });
  }
  const data = await res.json() as any;
  return (data.data || []) as GraphPage[];
}

export async function graphGet(path: string, accessToken: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${GRAPH_BASE}${path}?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as any)?.error?.message || 'Graph API request failed'), { status: res.status });
  return data as any;
}

export async function graphPost(path: string, accessToken: string, body: Record<string, string>) {
  const params = new URLSearchParams({ ...body, access_token: accessToken });
  const res = await fetch(`${GRAPH_BASE}${path}`, { method: 'POST', body: params });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as any)?.error?.message || 'Graph API request failed'), { status: res.status });
  return data as any;
}
