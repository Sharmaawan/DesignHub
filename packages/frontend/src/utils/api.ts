import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Bare backend origin, for URLs the API returns as server-relative paths
// (/uploads/...) and for the socket.io connection.
//
// This strips a *trailing* /api only. The obvious `.replace('/api', '')`
// replaces the first match anywhere, which eats the slash out of the scheme
// when the host itself starts with "api." — "https://api.example.com/api"
// became "https:/.example.com/api". It happened to work on localhost, so the
// breakage only ever showed up in deployed builds.
export const BACKEND_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

/** Resolve a possibly server-relative asset path against the backend origin. */
export function resolveAssetUrl(url: string): string {
  if (!url) return url;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return `${BACKEND_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('designhub-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('designhub-token');
      localStorage.removeItem('designhub-user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data: { name: string; email: string; password: string }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  googleLoginWithCredential: (credential: string) => api.post('/auth/google', { credential }),
  getMe: () => api.get('/auth/me'),
};

export const projectAPI = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  duplicate: (id: string) => api.post(`/projects/${id}/duplicate`),
  // PHASE 1 TEST: Create a project with hardcoded native elements
  createPhase1Test: () => api.post('/projects/test/phase1-native-elements', {}),
};

export const templateAPI = {
  list: (params?: { category?: string; search?: string }) => api.get('/templates', { params }),
  get: (id: string) => api.get(`/templates/${id}`),
  create: (data: any) => api.post('/templates', data),
  delete: (id: string) => api.delete(`/templates/${id}`),
  trash: () => api.get('/templates/trash'),
  restore: (id: string) => api.post(`/templates/${id}/restore`),
  deletePermanent: (id: string) => api.delete(`/templates/${id}/permanent`),
  detectFrame: (url: string) => api.post<{ hole: { shape: 'circle' | 'rectangle'; x: number; y: number; width: number; height: number } | null; overlayUrl: string | null }>('/templates/detect-frame', { url }),
};

// Flat image -> editable layers. All AI/vision/inpainting happens on the backend;
// the browser never sees a provider key.
export interface DesignRect { x: number; y: number; width: number; height: number }
export interface DesignTextRegion extends DesignRect { id: string; core?: DesignRect }
export interface DesignCapability { available: boolean; provider?: string; reason?: string }
export interface DesignAnalysis {
  sourceHash: string;
  version: string;
  imageWidth: number;
  imageHeight: number;
  texts: { id: string; accepted: boolean; reason?: string; ink?: DesignRect; inkColor?: string; maskPng?: string }[];
  objects: {
    id: string; type: string; description: string; confidence: number;
    x: number; y: number; width: number; height: number;
    extracted: boolean; cutoutUrl?: string; cutoutRect?: DesignRect; reason?: string; color?: string;
  }[];
  capabilities: { vision: DesignCapability; segmentation: DesignCapability; aiInpaint: DesignCapability };
  cached: { vision: boolean };
}
export interface DesignReconstruction {
  sourceHash: string;
  version: string;
  backgroundUrl: string;
  method: 'none' | 'local-inpaint' | 'ai-inpaint+local-inpaint';
  cached: boolean;
  warnings: string[];
  droppedObjectIds: string[];
}
export interface DesignDetectedRegion extends DesignRect { id: string; type: string; description: string; confidence: number; color?: string }
export interface DesignVisionResult {
  regions: DesignDetectedRegion[];
  status: DesignCapability;
  cached: boolean;
}
export interface DesignRegionReconstruction {
  ok: boolean;
  reason?: string;
  workingBackgroundUrl?: string;
  version?: number;
  inkColor?: string;
}

export const designAPI = {
  // No text involved — safe to fire the moment the upload finishes, in parallel
  // with client-side OCR, instead of waiting for OCR to finish first.
  analyzeVision: (url: string, signal?: AbortSignal) =>
    api.post<DesignVisionResult>('/design/analyze-vision', { url }, { timeout: 60000, signal }),
  analyze: (url: string, textRegions: DesignTextRegion[], precomputedVision: DesignVisionResult | undefined, signal?: AbortSignal) =>
    api.post<DesignAnalysis>('/design/analyze', { url, textRegions, precomputedVision }, { timeout: 120000, signal }),
  // Legacy all-at-once reconstruction — no longer called by the normal Make
  // Editable / Upload Template flow (see reconstructRegion below), kept for
  // any future bulk "flatten everything" action.
  reconstruct: (
    url: string, textRegions: DesignTextRegion[], acceptedTextIds: string[], objectIds: string[], signal?: AbortSignal,
  ) => api.post<DesignReconstruction>('/design/reconstruct', { url, textRegions, acceptedTextIds, objectIds }, { timeout: 180000, signal }),
  // Progressive reconstruction — cleans exactly one element's region against
  // the incrementally-patched working background. Called on demand (text:
  // first edit; objects: first move/delete), never during import.
  reconstructRegion: (
    url: string, textRegions: DesignTextRegion[], elementId: string, kind: 'text' | 'object', signal?: AbortSignal,
  ) => api.post<DesignRegionReconstruction>('/design/reconstruct-region', { url, textRegions, elementId, kind }, { timeout: 60000, signal }),
};

export const categoryAPI = {
  list: () => api.get('/categories'),
  create: (data: any) => api.post('/categories', data),
};

export const uploadAPI = {
  upload: (file: File, onProgress?: (pct: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (ev) => {
        if (ev.total) onProgress?.(Math.round((ev.loaded / ev.total) * 100));
      },
    });
  },
  uploadMultiple: (files: File[], onProgress?: (pct: number) => void) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return api.post('/upload/multiple', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (ev) => {
        if (ev.total) onProgress?.(Math.round((ev.loaded / ev.total) * 100));
      },
    });
  },
  list: () => api.get('/upload'),
  delete: (id: string) => api.delete(`/upload/${id}`),
};

export const notificationAPI = {
  list: () => api.get('/notifications'),
  markRead: (id: string) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  delete: (id: string) => api.delete(`/notifications/${id}`),
};

export const commentAPI = {
  listByProject: (projectId: string) => api.get(`/comments/project/${projectId}`),
  create: (data: { projectId: string; content: string; elementId?: string; x?: number; y?: number }) => api.post('/comments', data),
  resolve: (id: string) => api.put(`/comments/${id}/resolve`),
  delete: (id: string) => api.delete(`/comments/${id}`),
};

export const versionAPI = {
  listByProject: (projectId: string) => api.get(`/versions/project/${projectId}`),
  create: (data: { projectId: string; data?: any; canvasSnapshot?: any }) => api.post('/versions', data),
};

export const favoriteAPI = {
  list: () => api.get('/favorites'),
  toggleProject: (projectId: string) => api.post(`/favorites/project/${projectId}`),
  toggleTemplate: (templateId: string) => api.post(`/favorites/template/${templateId}`),
};

export const teamAPI = {
  list: () => api.get('/teams'),
  create: (data: { name: string }) => api.post('/teams', data),
  getMembers: (teamId: string) => api.get(`/teams/${teamId}/members`),
  addMember: (teamId: string, data: { email: string; role?: string }) => api.post(`/teams/${teamId}/members`, data),
  removeMember: (teamId: string, memberId: string) => api.delete(`/teams/${teamId}/members/${memberId}`),
  updateMemberRole: (teamId: string, memberId: string, role: string) => api.put(`/teams/${teamId}/members/${memberId}`, { role }),
  getInvites: (teamId: string) => api.get(`/teams/${teamId}/invites`),
  sendInvite: (teamId: string, data: { email: string; role?: string }) => api.post(`/teams/${teamId}/invites`, data),
  acceptInvite: (inviteId: string) => api.put(`/teams/invites/${inviteId}/accept`),
  rejectInvite: (inviteId: string) => api.put(`/teams/invites/${inviteId}/reject`),
  resendInvite: (inviteId: string) => api.put(`/teams/invites/${inviteId}/resend`),
  revokeInvite: (inviteId: string) => api.delete(`/teams/invites/${inviteId}`),
  getUserInvites: () => api.get('/teams/user/invites'),
};

export const collaboratorAPI = {
  listByProject: (projectId: string) => api.get(`/collaborators/project/${projectId}`),
  add: (data: { projectId: string; email: string; permission?: string }) => api.post('/collaborators', data),
  update: (id: string, data: { permission: string }) => api.put(`/collaborators/${id}`, data),
  remove: (id: string) => api.delete(`/collaborators/${id}`),
};

export const shareLinkAPI = {
  create: (data: { projectId: string; accessLevel?: string; expiresAt?: string }) => api.post('/share-links', data),
  getByToken: (token: string) => api.get(`/share-links/${token}`),
  delete: (id: string) => api.delete(`/share-links/${id}`),
};

export const preferenceAPI = {
  get: () => api.get('/preferences'),
  update: (data: any) => api.put('/preferences', data),
};

export const activityAPI = {
  list: () => api.get('/activity'),
  create: (data: { activityType: string; referenceId?: string }) => api.post('/activity', data),
};

export const exportAPI = {
  create: (data: { format: string; projectId: string }) => api.post('/export', data),
  get: (id: string) => api.get(`/export/${id}`),
};

export const productUpdateAPI = {
  list: () => api.get('/product-updates'),
  create: (data: any) => api.post('/product-updates', data),
  update: (id: string, data: any) => api.put(`/product-updates/${id}`, data),
  delete: (id: string) => api.delete(`/product-updates/${id}`),
};

export const aiAPI = {
  // Image generation (gpt-image-1) routinely takes well past the shared 30s
  // default — overriding just this call avoids either cutting real image
  // generations off early or loosening the timeout for every other endpoint.
  generate: (data: { provider: string; prompt: string; type: string; referenceImages?: string[] }) =>
    api.post('/ai/generate', data, { timeout: data.type === 'image' ? 120000 : 30000 }),
  history: () => api.get('/ai/history'),
  stats: () => api.get('/ai/stats'),
};

export const aiSettingsAPI = {
  list: () => api.get('/ai-settings'),
  saveKey: (data: { provider: string; apiKey: string; model?: string }) => api.post('/ai-settings/key', data),
  deleteKey: (id: string) => api.delete(`/ai-settings/key/${id}`),
  toggleKey: (id: string) => api.put(`/ai-settings/key/${id}/toggle`),
};

export const backgroundRemovalAPI = {
  remove: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/background-removal/remove', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  list: () => api.get('/background-removal'),
  delete: (id: string) => api.delete(`/background-removal/${id}`),
};

export const zandoviAPI = {
  status: () => api.get('/zandovi/status'),
  projects: () => api.get('/zandovi/projects'),
  templates: (projectId: string) => api.get(`/zandovi/projects/${projectId}/templates`),
  template: (templateId: string) => api.get(`/zandovi/templates/${templateId}`),
  preview: (templateId: string) => api.get(`/zandovi/templates/${templateId}/preview`),
  generate: (templateId: string, variables?: Record<string, string>) =>
    api.post(`/zandovi/templates/${templateId}/generate`, { variables }),
};

export const emailSettingsAPI = {
  get: () => api.get('/email-settings'),
  connect: (data: { email: string; appPassword: string; host?: string; port?: number }) =>
    api.post('/email-settings/connect', data),
  disconnect: () => api.post('/email-settings/disconnect'),
  test: () => api.post('/email-settings/test'),
};

export const socialAPI = {
  platforms: () => api.get('/social/platforms'),
  accounts: () => api.get('/social/accounts'),
  disconnect: (id: string) => api.delete(`/social/accounts/${id}`),
  connect: (platform: string) => api.get(`/social/connect/${platform}`),
  pending: (pendingId: string) => api.get(`/social/pending/${pendingId}`),
  selectPending: (pendingId: string, platformUserIds: string[]) => api.post(`/social/pending/${pendingId}/select`, { platformUserIds }),
  createPost: (data: {
    socialAccountId?: string; projectId?: string; action: 'now' | 'schedule' | 'draft';
    mediaType: 'image' | 'video' | 'carousel' | 'story'; mediaUrls: string[];
    caption?: string; hashtags?: string[]; altText?: string; firstComment?: string;
    linkUrl?: string; scheduledFor?: string;
  }) => api.post('/social/posts', data),
  posts: () => api.get('/social/posts'),
  post: (id: string) => api.get(`/social/posts/${id}`),
  updatePost: (id: string, data: any) => api.put(`/social/posts/${id}`, data),
  deletePost: (id: string) => api.delete(`/social/posts/${id}`),
  analytics: (id: string) => api.get(`/social/posts/${id}/analytics`),
  // Maker/approver workflow
  approvalContext: () => api.get('/social/approval-context'),
  pendingApproval: () => api.get('/social/posts/pending-approval'),
  approvePost: (id: string) => api.post(`/social/posts/${id}/approve`),
  rejectPost: (id: string, reason?: string) => api.post(`/social/posts/${id}/reject`, { reason }),
  sendPost: (id: string, socialAccountId?: string) => api.post(`/social/posts/${id}/send`, { socialAccountId }),
};

export default api;
