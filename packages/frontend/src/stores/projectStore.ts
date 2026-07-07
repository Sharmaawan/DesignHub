import { create } from 'zustand';
import { Project, Folder, Template } from '../types';
import { projectAPI, templateAPI, favoriteAPI } from '../utils/api';

interface ProjectState {
  projects: Project[];
  folders: Folder[];
  templates: Template[];
  recentProjects: Project[];
  favoriteProjects: Project[];
  sharedProjects: Project[];
  isLoading: boolean;
  searchQuery: string;

  setProjects: (projects: Project[]) => void;
  addProject: (project: Partial<Project>) => Project;
  updateProject: (id: string, data: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  toggleFavorite: (id: string) => void;

  addFolder: (name: string, parentId?: string) => Folder;
  updateFolder: (id: string, data: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;

  loadTemplates: () => void;
  loadProjects: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  getFilteredProjects: () => Project[];
  getFilteredTemplates: () => Template[];
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  folders: [],
  templates: [],
  recentProjects: [],
  favoriteProjects: [],
  sharedProjects: [],
  isLoading: false,
  searchQuery: '',

  setProjects: (projects) => set({ projects }),

  addProject: (projectData) => {
    const project: Project = {
      id: `proj-${Date.now()}`,
      name: projectData.name || 'Untitled Design',
      pages: projectData.pages || [{
        id: `page-${Date.now()}`, name: 'Page 1', elements: [], backgroundColor: '#FFFFFF', width: 1920, height: 1080,
      }],
      ownerId: '1',
      collaborators: [],
      isFavorite: false,
      isTemplate: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...projectData,
    } as Project;
    set((s) => ({ projects: [project, ...s.projects] }));
    return project;
  },

  updateProject: (id, data) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === id ? {
        ...p, ...data,
        // Mirror canvasData into pages on the local copy too — EditorPage's effect
        // re-runs setProject(project) whenever this array's identity changes (which
        // happens on every autosave), and it reads project.pages. Leaving pages stale
        // here meant every autosave tick reset the live editor back to whatever was
        // last loaded, silently wiping anything added since (new pages, a background
        // photo, in-progress edits).
        ...(data.canvasData ? { pages: data.canvasData } : {}),
        updatedAt: new Date().toISOString(),
      } : p),
    }));
    // Persist to MySQL for real DB projects (local-only projects have id starting with 'proj-')
    if (!id.startsWith('proj-')) {
      projectAPI.update(id, data).catch(() => {/* silent — autosave best-effort */});
    }
  },

  deleteProject: (id) => {
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },

  toggleFavorite: (id) => {
    set((s) => ({
      projects: s.projects.map((p) => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p),
    }));
  },

  addFolder: (name, parentId) => {
    const folder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      parentId,
      projectCount: 0,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ folders: [...s.folders, folder] }));
    return folder;
  },

  updateFolder: (id, data) => {
    set((s) => ({
      folders: s.folders.map((f) => f.id === id ? { ...f, ...data } : f),
    }));
  },

  deleteFolder: (id) => {
    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
  },

  loadTemplates: async () => {
    try {
      const { data } = await templateAPI.list();
      const templates: Template[] = data.map((t: any) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        thumbnail: t.thumbnail || '',
        tags: Array.isArray(t.tags) ? t.tags : [],
        data: t.data || t.templateData,
        isPro: t.isPremium,
        ownerId: t.ownerId,
      }));
      set({ templates });
    } catch {
      set({ templates: [] });
    }
  },

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const { data } = await projectAPI.list();
      // canvasData (a JSON snapshot of the full pages array, written by the editor's
      // own save paths) is the real source of truth — nothing currently populates the
      // structured Page/Element tables for hand-authored designs, so that relation is
      // kept only as a fallback for rows that do have it (e.g. duplicated projects).
      const projects: Project[] = data.map((p: any) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        pages: (Array.isArray(p.canvasData) && p.canvasData.length > 0)
          ? p.canvasData
          : p.pages?.map((pg: any) => ({
          id: pg.id,
          name: pg.name,
          elements: pg.elements?.map((el: any) => ({
            id: el.id,
            type: el.type,
            x: el.x || 0,
            y: el.y || 0,
            width: el.width || 100,
            height: el.height || 100,
            rotation: el.rotation || 0,
            opacity: el.opacity ?? 1,
            visible: el.visible ?? true,
            locked: el.locked,
            name: el.name || '',
            zIndex: el.index || 0,
            data: el.data,
          })) || [],
          backgroundColor: pg.backgroundColor || '#FFFFFF',
          width: pg.width || 1920,
          height: pg.height || 1080,
        })) || [],
        ownerId: p.ownerId,
        collaborators: [],
        isFavorite: p.favorites?.length > 0,
        isTemplate: false,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      set({ projects, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  getFilteredProjects: () => {
    const { projects, searchQuery } = get();
    if (!searchQuery) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  },

  getFilteredTemplates: () => {
    const { templates, searchQuery } = get();
    if (!searchQuery) return templates;
    const q = searchQuery.toLowerCase();
    return templates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
    );
  },
}));
