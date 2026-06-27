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
  googleLogin: (data: { email: string; name: string; avatar?: string }) => api.post('/auth/google', data),
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
};

export const categoryAPI = {
  list: () => api.get('/categories'),
  create: (data: any) => api.post('/categories', data),
};

export const uploadAPI = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  uploadMultiple: (files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return api.post('/upload/multiple', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
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
  addMember: (teamId: string, data: { email: string; role?: string }) => api.post(`/teams/${teamId}/members`, data),
  removeMember: (teamId: string, memberId: string) => api.delete(`/teams/${teamId}/members/${memberId}`),
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

export default api;
