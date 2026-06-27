import { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';
import { HiOutlineCheck, HiOutlineX, HiOutlineRefresh, HiOutlineLink, HiOutlineUserGroup, HiOutlineClock } from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function TeamRequests() {
  const { invites, acceptInvite, rejectInvite, resendInvite, revokeInvite, copyInviteLink } = useTeamStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pendingInvites = invites.filter((i) => i.status === 'pending');
  const processedInvites = invites.filter((i) => i.status !== 'pending');

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expired';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  };

  const handleCopyLink = (id: string) => {
    const link = copyInviteLink(id);
    navigator.clipboard.writeText(link);
    toast.success('Invite link copied!');
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
            <p className="text-xs text-gray-400">{pendingInvites.length} pending</p>
          </div>
        </div>
      </div>

      {pendingInvites.length === 0 && processedInvites.length === 0 ? (
        <div className="p-8 text-center">
          <HiOutlineUserGroup size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">No team invites yet</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {/* Pending invites */}
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="p-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#7B2FBE]/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-[#7B2FBE]">{invite.email[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{invite.email}</p>
                    <p className="text-[11px] text-gray-400">{invite.role} · {getTimeRemaining(invite.expiresAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleCopyLink(invite.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors" title="Copy invite link">
                    <HiOutlineLink size={14} />
                  </button>
                  <button onClick={() => { resendInvite(invite.id); toast.success('Invitation resent!'); }} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-600 transition-colors" title="Resend">
                    <HiOutlineRefresh size={14} />
                  </button>
                  <button onClick={() => { acceptInvite(invite.id); toast.success('Invitation accepted'); }} className="p-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 text-gray-400 hover:text-green-600 transition-colors" title="Accept">
                    <HiOutlineCheck size={14} />
                  </button>
                  <button onClick={() => { rejectInvite(invite.id); toast('Invitation rejected', { icon: '👋' }); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors" title="Reject">
                    <HiOutlineX size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Processed invites */}
          {processedInvites.map((invite) => (
            <div key={invite.id} className="p-4 opacity-60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                    <span className="text-sm font-bold text-gray-400">{invite.email[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{invite.email}</p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                        invite.status === 'accepted' ? 'bg-green-500' :
                        invite.status === 'rejected' ? 'bg-red-500' : 'bg-gray-400'
                      }`} />
                      {invite.status}
                    </p>
                  </div>
                </div>
                <button onClick={() => revokeInvite(invite.id)} className="text-[11px] text-gray-400 hover:text-red-500 transition-colors">
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
