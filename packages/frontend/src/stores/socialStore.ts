import { create } from 'zustand';
import { socialAPI } from '../utils/api';

export interface PlatformDimension { label: string; width: number; height: number; }
export interface PlatformSpec {
  platform: string;
  label: string;
  mediaTypes: ('image' | 'video' | 'carousel' | 'story')[];
  dimensions: PlatformDimension[];
  maxFileSizeMB: number;
  maxCaptionLength: number;
}
export interface PlatformConfig { platform: string; configured: boolean; spec: PlatformSpec; }

export interface SocialAccount {
  id: string;
  platform: string;
  platformUsername: string | null;
  isActive: boolean;
  connectedAt: string;
  tokenExpiresAt: string | null;
}

export interface SocialPostAnalytics {
  likes: number; comments: number; shares: number; reach: number; impressions: number; fetchedAt: string;
}

export interface SocialPost {
  id: string;
  platform: string;
  status: 'draft' | 'pending_approval' | 'rejected' | 'scheduled' | 'publishing' | 'published' | 'failed';
  mediaType: 'image' | 'video' | 'carousel' | 'story';
  mediaUrls: string[];
  caption: string | null;
  hashtags: string[] | null;
  altText: string | null;
  firstComment: string | null;
  linkUrl: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  platformPostId: string | null;
  errorMessage: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  analytics?: SocialPostAnalytics | null;
  socialAccount?: { platform: string; platformUsername: string | null };
  // Present on the approver queue only — who submitted the post.
  user?: { name: string | null; email: string | null };
}

export interface ApprovalContext {
  inTeam: boolean;
  role: string | null;
  isApprover: boolean;
  isMaker: boolean;
}

interface SocialState {
  platforms: PlatformConfig[];
  accounts: SocialAccount[];
  posts: SocialPost[];
  isLoading: boolean;
  approvalContext: ApprovalContext | null;
  pendingApproval: SocialPost[];

  loadPlatforms: () => Promise<void>;
  loadAccounts: () => Promise<void>;
  connect: (platform: string) => Promise<string>; // returns the authUrl to navigate to
  disconnect: (id: string) => Promise<void>;
  resolvePending: (pendingId: string) => Promise<{ platform: string; accounts: { platformUserId: string; platformUsername: string }[] }>;
  selectPending: (pendingId: string, platformUserIds: string[]) => Promise<void>;

  loadPosts: () => Promise<void>;
  createPost: (data: Parameters<typeof socialAPI.createPost>[0]) => Promise<SocialPost>;
  deletePost: (id: string) => Promise<void>;
  refreshAnalytics: (id: string) => Promise<void>;

  loadApprovalContext: () => Promise<void>;
  loadPendingApproval: () => Promise<void>;
  approvePost: (id: string) => Promise<void>;
  rejectPost: (id: string, reason?: string) => Promise<void>;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  platforms: [],
  accounts: [],
  posts: [],
  isLoading: false,
  approvalContext: null,
  pendingApproval: [],

  loadPlatforms: async () => {
    try {
      const { data } = await socialAPI.platforms();
      set({ platforms: data });
    } catch (err) {
      console.error('[social] failed to load platform config', err);
    }
  },

  loadAccounts: async () => {
    set({ isLoading: true });
    try {
      const { data } = await socialAPI.accounts();
      set({ accounts: data, isLoading: false });
    } catch (err) {
      console.error('[social] failed to load accounts', err);
      set({ isLoading: false });
    }
  },

  connect: async (platform) => {
    try {
      const { data } = await socialAPI.connect(platform);
      return data.authUrl as string;
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to start connection');
    }
  },

  disconnect: async (id) => {
    try {
      await socialAPI.disconnect(id);
      set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to disconnect account');
    }
  },

  resolvePending: async (pendingId) => {
    try {
      const { data } = await socialAPI.pending(pendingId);
      return data;
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'That connection attempt expired — try again');
    }
  },

  selectPending: async (pendingId, platformUserIds) => {
    try {
      await socialAPI.selectPending(pendingId, platformUserIds);
      await get().loadAccounts();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to finish connecting the account');
    }
  },

  loadPosts: async () => {
    try {
      const { data } = await socialAPI.posts();
      set({ posts: data });
    } catch (err) {
      console.error('[social] failed to load posts', err);
    }
  },

  createPost: async (postData) => {
    try {
      const { data } = await socialAPI.createPost(postData);
      set((s) => ({ posts: [data, ...s.posts] }));
      return data;
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to create post');
    }
  },

  deletePost: async (id) => {
    try {
      await socialAPI.deletePost(id);
      set((s) => ({ posts: s.posts.filter((p) => p.id !== id) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to delete post');
    }
  },

  refreshAnalytics: async (id) => {
    try {
      const { data } = await socialAPI.analytics(id);
      set((s) => ({ posts: s.posts.map((p) => (p.id === id ? { ...p, analytics: data } : p)) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to fetch analytics');
    }
  },

  loadApprovalContext: async () => {
    try {
      const { data } = await socialAPI.approvalContext();
      set({ approvalContext: data });
    } catch (err) {
      console.error('[social] failed to load approval context', err);
    }
  },

  loadPendingApproval: async () => {
    try {
      const { data } = await socialAPI.pendingApproval();
      set({ pendingApproval: data });
    } catch (err) {
      console.error('[social] failed to load pending approvals', err);
    }
  },

  approvePost: async (id) => {
    try {
      await socialAPI.approvePost(id);
      set((s) => ({ pendingApproval: s.pendingApproval.filter((p) => p.id !== id) }));
      await get().loadPosts();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to approve post');
    }
  },

  rejectPost: async (id, reason) => {
    try {
      await socialAPI.rejectPost(id, reason);
      set((s) => ({ pendingApproval: s.pendingApproval.filter((p) => p.id !== id) }));
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to reject post');
    }
  },
}));
