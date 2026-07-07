import { useState, useEffect } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { useAuthStore } from '../../stores/authStore';
import { HiOutlineCheck, HiOutlineX, HiOutlineRefresh, HiOutlineLink, HiOutlineUserGroup, HiOutlinePlus, HiOutlineMail } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function TeamRequests() {
  const { userInvites, workspaces, loadTeams, loadUserInvites, acceptInvite, rejectInvite, resendInvite, revokeInvite, sendInvite, createTeam } = useTeamStore();
  const { user } = useAuthStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadTeams();
    loadUserInvites();
  }, []);

  const pendingInvites = userInvites.filter((i) => i.status === 'pending');
  const currentTeam = workspaces[0];

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  const handleAccept = async (inviteId: string) => {
    try {
      await acceptInvite(inviteId);
      toast.success('Invitation accepted!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReject = async (inviteId: string) => {
    try {
      await rejectInvite(inviteId);
      toast('Invitation declined', { icon: '👋' });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResend = async (inviteId: string) => {
    try {
      await resendInvite(inviteId);
      toast.success('Invitation resent!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await revokeInvite(inviteId);
      toast.success('Invitation revoked');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleCopyLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied!');
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setIsCreating(true);
    try {
      await createTeam(teamName.trim());
      setTeamName('');
      setShowCreateTeamModal(false);
      toast.success('Team created!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return;
    const teamId = selectedTeamId || currentTeam?.id;
    if (!teamId) {
      toast.error('No team available. Create a team first.');
      return;
    }
    setIsSending(true);
    try {
      await sendInvite(teamId, inviteEmail.trim(), inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      setShowInviteModal(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const getPendingCount = () => {
    let count = pendingInvites.length;
    workspaces.forEach((ws) => {
      count += (ws.invites || []).filter((i) => i.status === 'pending').length;
    });
    return count;
  };

  return (
    <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <HiOutlineUserGroup size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Team Requests</h3>
            <p className="text-xs text-gray-400">{getPendingCount()} pending</p>
          </div>
        </div>
        {currentTeam ? (
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7B2FBE] text-white rounded-lg text-xs font-medium hover:bg-[#6A25A8] transition-colors"
          >
            <HiOutlinePlus size={14} /> Invite
          </button>
        ) : (
          <button
            onClick={() => setShowCreateTeamModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7B2FBE] text-white rounded-lg text-xs font-medium hover:bg-[#6A25A8] transition-colors"
          >
            <HiOutlinePlus size={14} /> Create Team
          </button>
        )}
      </div>

      {/* No team created yet */}
      {!currentTeam && pendingInvites.length === 0 && (
        <div className="p-8 text-center">
          <HiOutlineUserGroup size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">No team yet</p>
          <p className="text-xs text-gray-400 mb-4">Create a team to start collaborating with others</p>
          <button
            onClick={() => setShowCreateTeamModal(true)}
            className="px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] transition-colors"
          >
            Create Team
          </button>
        </div>
      )}

      {/* Pending incoming invites */}
      {pendingInvites.length > 0 && (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <HiOutlineMail size={16} className="text-green-600 dark:text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {invite.team?.name || 'Team'}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Invited as {invite.role} · {getTimeRemaining(invite.expiresAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleAccept(invite.id)}
                    className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 transition-colors"
                    title="Accept"
                  >
                    <HiOutlineCheck size={16} />
                  </button>
                  <button
                    onClick={() => handleReject(invite.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 transition-colors"
                    title="Reject"
                  >
                    <HiOutlineX size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Outgoing invites (sent by user's team) */}
      {currentTeam && (currentTeam.invites || []).length > 0 && (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {(currentTeam.invites || []).map((invite: any) => (
            <div key={invite.id} className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#7B2FBE]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-[#7B2FBE]">{invite.email[0].toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{invite.email}</p>
                    <p className="text-[11px] text-gray-400">{invite.role} · {getTimeRemaining(invite.expiresAt)}</p>
                  </div>
                </div>
                {/* flex-shrink-0 so a long email truncates instead of squeezing these
                    (especially Revoke/delete) off the edge of a narrow card. */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleCopyLink(invite.token)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors" title="Copy link">
                    <HiOutlineLink size={14} />
                  </button>
                  <button onClick={() => handleResend(invite.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 transition-colors" title="Resend">
                    <HiOutlineRefresh size={14} />
                  </button>
                  <button onClick={() => handleRevoke(invite.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors" title="Revoke invite">
                    <HiOutlineX size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Team Members */}
      {currentTeam && (currentTeam.members || []).length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Team Members ({currentTeam.members!.length})</p>
          <div className="space-y-2">
            {currentTeam.members!.slice(0, 5).map((member: any) => (
              <div key={member.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                  {member.user.name?.[0]?.toUpperCase() || member.user.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{member.user.name || member.user.email}</p>
                </div>
                <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full ${
                  member.role === 'owner' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                  member.role === 'admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {member.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when team exists but no invites */}
      {currentTeam && pendingInvites.length === 0 && (currentTeam.invites || []).length === 0 && (
        <div className="p-6 text-center">
          <p className="text-xs text-gray-400">No pending invitations</p>
        </div>
      )}

      {/* Create Team Modal */}
      {showCreateTeamModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateTeamModal(false)}>
          <div className="bg-white dark:bg-[#1e1e30] rounded-2xl shadow-2xl w-[420px] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Create your team</h3>
            <p className="text-sm text-gray-500 mb-4">Set up a workspace to collaborate with others on designs.</p>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Team name</label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Marketing Team"
                  autoFocus
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTeam(); }}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowCreateTeamModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleCreateTeam}
                  disabled={!teamName.trim() || isCreating}
                  className="px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] disabled:opacity-50 transition-colors"
                >
                  {isCreating ? 'Creating...' : 'Create Team'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white dark:bg-[#1e1e30] rounded-2xl shadow-2xl w-[420px] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Invite team member</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
                >
                  <option value="viewer">Viewer - Can view designs</option>
                  <option value="editor">Editor - Can edit designs</option>
                  <option value="admin">Admin - Full access</option>
                </select>
              </div>
              {user?.email && (
                <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <HiOutlineMail size={14} className="text-gray-400" />
                  <p className="text-[11px] text-gray-500">Invitation will be sent from <strong>{user.email}</strong></p>
                </div>
              )}
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowInviteModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSendInvite}
                  disabled={!inviteEmail.trim() || isSending}
                  className="px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] disabled:opacity-50 transition-colors"
                >
                  {isSending ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
