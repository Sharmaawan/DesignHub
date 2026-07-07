import { SocialPlatformAdapter } from './types';
import { facebookAdapter } from './facebook';
import { instagramAdapter } from './instagram';
import { linkedinAdapter } from './linkedin';
import { twitterAdapter } from './twitter';
import { pinterestAdapter } from './pinterest';

export * from './types';
export { PLATFORM_SPECS, PLATFORMS } from './specs';

const ADAPTERS: Record<string, SocialPlatformAdapter> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  linkedin: linkedinAdapter,
  twitter: twitterAdapter,
  pinterest: pinterestAdapter,
};

export function getAdapter(platform: string): SocialPlatformAdapter | undefined {
  return ADAPTERS[platform];
}

export function listAdapters(): SocialPlatformAdapter[] {
  return Object.values(ADAPTERS);
}
