import { SocialAccount } from '@prisma/client';

export interface PublishPayload {
  mediaType: 'image' | 'video' | 'carousel' | 'story';
  mediaUrls: string[];
  caption?: string | null;
  hashtags?: string[] | null;
  altText?: string | null;
  firstComment?: string | null;
  linkUrl?: string | null;
}

export interface ExchangedAccount {
  platformUserId: string;
  platformUsername: string;
  // Present only for platforms where a single OAuth login can control multiple
  // publishable identities (Facebook Pages, each with an optional linked Instagram
  // Business account) — lets the caller offer a picker instead of silently taking [0].
  pageAccessToken?: string;
}

export interface ExchangeResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  accounts: ExchangedAccount[];
}

export interface PlatformAnalytics {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
}

export interface SocialPlatformAdapter {
  platform: string;
  /** false when required env credentials are missing — gates connect/publish everywhere. */
  isConfigured(): boolean;
  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCodeForToken(code: string, redirectUri: string): Promise<ExchangeResult>;
  publish(account: SocialAccount, post: PublishPayload): Promise<{ platformPostId: string }>;
  getAnalytics(account: SocialAccount, platformPostId: string): Promise<PlatformAnalytics>;
}

export class NotConfiguredError extends Error {
  constructor(platform: string) {
    super(`${platform} isn't configured yet — add API credentials to enable it.`);
    this.name = 'NotConfiguredError';
  }
}
