import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
};

export const templateAPI = {
  list: (params?: { category?: string; search?: string }) => api.get('/templates', { params }),
  get: (id: string) => api.get(`/templates/${id}`),
  create: (data: any) => api.post('/templates', data),
  delete: (id: string) => api.delete(`/templates/${id}`),
  trash: () => api.get('/templates/trash'),
  restore: (id: string) => api.post(`/templates/${id}/restore`),
  deletePermanent: (id: string) => api.delete(`/templates/${id}/permanent`),
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
  generate: (data: { provider: string; prompt: string; type: string; referenceImages?: string[] }) => api.post('/ai/generate', data),
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
    socialAccountId: string; projectId?: string; action: 'now' | 'schedule' | 'draft';
    mediaType: 'image' | 'video' | 'carousel' | 'story'; mediaUrls: string[];
    caption?: string; hashtags?: string[]; altText?: string; firstComment?: string;
    linkUrl?: string; scheduledFor?: string;
  }) => api.post('/social/posts', data),
  posts: () => api.get('/social/posts'),
  post: (id: string) => api.get(`/social/posts/${id}`),
  updatePost: (id: string, data: any) => api.put(`/social/posts/${id}`, data),
  deletePost: (id: string) => api.delete(`/social/posts/${id}`),
  analytics: (id: string) => api.get(`/social/posts/${id}/analytics`),
};

export default api;
