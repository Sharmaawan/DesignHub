import { SocialPlatformAdapter, NotConfiguredError } from './types';

// Stub — see linkedin.ts for why isConfigured() is unconditionally false rather than
// checking env vars: the real Pinterest API integration isn't implemented yet.
export const pinterestAdapter: SocialPlatformAdapter = {
  platform: 'pinterest',
  isConfigured: () => false,
  getAuthUrl: () => { throw new NotConfiguredError('Pinterest'); },
  exchangeCodeForToken: async () => { throw new NotConfiguredError('Pinterest'); },
  publish: async () => { throw new NotConfiguredError('Pinterest'); },
  getAnalytics: async () => { throw new NotConfiguredError('Pinterest'); },
};
