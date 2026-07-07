import { SocialPlatformAdapter, NotConfiguredError } from './types';

// Stub — see linkedin.ts for why isConfigured() is unconditionally false rather than
// checking env vars: the real X API v2 posting integration isn't implemented yet.
export const twitterAdapter: SocialPlatformAdapter = {
  platform: 'twitter',
  isConfigured: () => false,
  getAuthUrl: () => { throw new NotConfiguredError('X (Twitter)'); },
  exchangeCodeForToken: async () => { throw new NotConfiguredError('X (Twitter)'); },
  publish: async () => { throw new NotConfiguredError('X (Twitter)'); },
  getAnalytics: async () => { throw new NotConfiguredError('X (Twitter)'); },
};
