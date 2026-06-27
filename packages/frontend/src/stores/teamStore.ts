import { create } from 'zustand';
import { TeamInvite, Workspace } from '../types';
import { teamAPI } from '../utils/api';

interface TeamState {
  invites: TeamInvite[];
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;
  loadTeams: () => Promise<void>;
  addInvite: (invite: Omit<TeamInvite, 'id' | 'inviteToken' | 'createdAt'>) => void;
  acceptInvite: (id: string) => void;
  rejectInvite: (id: string) => void;
  resendInvite: (id: string) => void;
  revokeInvite: (id: string) => void;
  copyInviteLink: (id: string) => string;
  setCurrentWorkspace: (ws: Workspace) => void;
  getPendingInvites: () => TeamInvite[];
}

export const useTeamStore = create<TeamState>((set, get) => ({
  invites: [],
  workspaces: [],
  currentWorkspace: null,
  isLoading: false,

  loadTeams: async () => {
    set({ isLoading: true });
    try {
      const { data } = await teamAPI.list();
      const workspaces: Workspace[] = data.map((t: any) => ({
        id: t.id,
        name: t.name,
        ownerId: t.ownerId,
        plan: 'free',
        memberCount: t.members?.length || 0,
        createdAt: t.createdAt,
      }));
      set({ workspaces, currentWorkspace: workspaces[0] || null, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  addInvite: (invite) => {
    set((state) => ({
      invites: [
        {
          ...invite,
          id: `inv-${Date.now()}`,
          inviteToken: `tok-${Math.random().toString(36).substring(2, 10)}`,
          createdAt: new Date().toISOString(),
        },
        ...state.invites,
      ],
    }));
  },

  acceptInvite: (id) =>
    set((state) => ({
      invites: state.invites.map((inv) => (inv.id === id ? { ...inv, status: 'accepted' as const } : inv)),
    })),

  rejectInvite: (id) =>
    set((state) => ({
      invites: state.invites.map((inv) => (inv.id === id ? { ...inv, status: 'rejected' as const } : inv)),
    })),

  resendInvite: (id) =>
    set((state) => ({
      invites: state.invites.map((inv) =>
        inv.id === id
          ? { ...inv, status: 'pending' as const, expiresAt: new Date(Date.now() + 86400000 * 7).toISOString() }
          : inv
      ),
    })),

  revokeInvite: (id) =>
    set((state) => ({
      invites: state.invites.filter((inv) => inv.id !== id),
    })),

  copyInviteLink: (id) => {
    const invite = get().invites.find((i) => i.id === id);
    return invite ? `https://designhub.app/invite/${invite.inviteToken}` : '';
  },

  setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),
  getPendingInvites: () => get().invites.filter((i) => i.status === 'pending'),
}));
