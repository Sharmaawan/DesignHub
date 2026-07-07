export interface DimensionSpec {
  label: string;
  width: number;
  height: number;
}

export interface PlatformSpec {
  platform: string;
  label: string;
  mediaTypes: ('image' | 'video' | 'carousel' | 'story')[];
  dimensions: DimensionSpec[];
  maxFileSizeMB: number;
  maxCaptionLength: number;
}

// Fixed reference data, not adapter behavior — used identically by the frontend for
// pre-flight warnings and the backend for authoritative re-validation on POST /posts.
// Instagram/Facebook/LinkedIn values are exactly what the feature spec requires;
// X/Pinterest use each platform's own published guidance since no exact spec was given.
export const PLATFORM_SPECS: Record<string, PlatformSpec> = {
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    mediaTypes: ['image', 'video', 'carousel', 'story'],
    dimensions: [
      { label: 'Facebook Post', width: 1200, height: 630 },
      { label: 'Facebook Story', width: 1080, height: 1920 },
    ],
    maxFileSizeMB: 100,
    maxCaptionLength: 63206,
  },
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    mediaTypes: ['image', 'video', 'carousel', 'story'],
    dimensions: [
      { label: 'Instagram Post', width: 1080, height: 1080 },
      { label: 'Instagram Story', width: 1080, height: 1920 },
    ],
    maxFileSizeMB: 100,
    maxCaptionLength: 2200,
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    // Video excluded on purpose: LinkedIn's video upload is a separate chunked-upload
    // API the adapter doesn't implement — omitting it here keeps the UI from ever
    // offering an option that would fail every time.
    mediaTypes: ['image', 'carousel'],
    dimensions: [
      { label: 'LinkedIn Post', width: 1200, height: 627 },
    ],
    maxFileSizeMB: 200,
    maxCaptionLength: 3000,
  },
  twitter: {
    platform: 'twitter',
    label: 'X (Twitter)',
    mediaTypes: ['image', 'video'],
    dimensions: [
      { label: 'X Post', width: 1600, height: 900 },
    ],
    maxFileSizeMB: 512,
    maxCaptionLength: 280,
  },
  pinterest: {
    platform: 'pinterest',
    label: 'Pinterest',
    mediaTypes: ['image', 'video'],
    dimensions: [
      { label: 'Pinterest Pin', width: 1000, height: 1500 },
    ],
    maxFileSizeMB: 100,
    maxCaptionLength: 500,
  },
};

export const PLATFORMS = Object.keys(PLATFORM_SPECS);
