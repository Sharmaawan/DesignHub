import { create } from 'zustand';
import { teamAPI } from '../utils/api';

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'rejected';
  expiresAt: string;
  token: string;
  createdAt: string;
  invitedBy?: { id: string; name: string; email: string; avatar?: string };
  team?: { id: string; name: string };
}

export interface TeamMember {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: { id: string; name: string; email: string; avatar?: string };
}

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  plan: string;
  memberCount: number;
  createdAt: string;
  members?: TeamMember[];
  invites?: TeamInvite[];
}

interface TeamState {
  invites: TeamInvite[];
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  userInvites: TeamInvite[];
  isLoading: boolean;
  loadTeams: () => Promise<void>;
  loadUserInvites: () => Promise<void>;
  createTeam: (name: string) => Promise<void>;
  sendInvite: (teamId: string, email: string, role?: string) => Promise<void>;
  acceptInvite: (inviteId: string) => Promise<void>;
  rejectInvite: (inviteId: string) => Promise<void>;
  resendInvite: (inviteId: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  removeMember: (teamId: string, memberId: string) => Promise<void>;
  setCurrentWorkspace: (ws: Workspace) => void;
}

export const useTeamStore = create<TeamState>((set, get) => ({
  invites: [],
  workspaces: [],
  currentWorkspace: null,
  userInvites: [],
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
        members: t.members || [],
        invites: t.invites || [],
      }));
      set({ workspaces, currentWorkspace: workspaces[0] || null, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  loadUserInvites: async () => {
    try {
      const { data } = await teamAPI.getUserInvites();
      set({ userInvites: data });
    } catch {
      set({ userInvites: [] });
    }
  },

  createTeam: async (name: string) => {
    try {
      await teamAPI.create({ name });
      await get().loadTeams();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to create team');
    }
  },

  sendInvite: async (teamId: string, email: string, role?: string) => {
    try {
      await teamAPI.sendInvite(teamId, { email, role });
      await get().loadTeams();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to send invite');
    }
  },

  acceptInvite: async (inviteId: string) => {
    try {
      await teamAPI.acceptInvite(inviteId);
      await get().loadTeams();
      await get().loadUserInvites();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to accept invite');
    }
  },

  rejectInvite: async (inviteId: string) => {
    try {
      await teamAPI.rejectInvite(inviteId);
      await get().loadUserInvites();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to reject invite');
    }
  },

  resendInvite: async (inviteId: string) => {
    try {
      await teamAPI.resendInvite(inviteId);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to resend invite');
    }
  },

  revokeInvite: async (inviteId: string) => {
    try {
      await teamAPI.revokeInvite(inviteId);
      await get().loadTeams();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to revoke invite');
    }
  },

  removeMember: async (teamId: string, memberId: string) => {
    try {
      await teamAPI.removeMember(teamId, memberId);
      await get().loadTeams();
    } catch (err: any) {
      throw new Error(err.response?.data?.error || 'Failed to remove member');
    }
  },

  setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),
}));
