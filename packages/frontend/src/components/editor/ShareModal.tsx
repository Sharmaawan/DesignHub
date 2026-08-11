import { useState, useEffect } from 'react';
import { HiOutlineX, HiOutlineLink, HiOutlineMail, HiOutlineGlobe, HiOutlineGlobeAlt, HiOutlineLockClosed, HiOutlineCheck, HiOutlineUserGroup, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useSocialStore, SocialAccount } from '../../stores/socialStore';
import { collaboratorAPI } from '../../utils/api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  facebook: { label: 'Facebook', icon: '👍' },
  instagram: { label: 'Instagram', icon: '📷' },
  linkedin: { label: 'LinkedIn', icon: '💼' },
  twitter: { label: 'X (Twitter)', icon: '🐦' },
  pinterest: { label: 'Pinterest', icon: '📌' },
};

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  onPublish: (accountId: string) => void;
  projectId?: string;
  projectName?: string;
}

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  permission: 'viewer' | 'commenter' | 'editor';
}

// Shape returned by GET /collaborators/project/:projectId — a Collaborator row
// with its related User embedded, not the flattened shape the UI wants.
interface ApiCollaborator {
  id: string;
  permission: string;
  user: { id: string; name: string; email: string; avatar?: string };
}

const mapApiCollaborator = (c: ApiCollaborator): Collaborator => ({
  id: c.id,
  name: c.user.name,
  email: c.user.email,
  avatar: c.user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.user.email}`,
  permission: (c.permission as Collaborator['permission']) || 'viewer',
});

export default function ShareModal({ open, onClose, onPublish, projectId, projectName }: ShareModalProps) {
  const { user } = useAuthStore();
  const { platforms, accounts, loadPlatforms, loadAccounts, connect } = useSocialStore();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<'viewer' | 'commenter' | 'editor'>('editor');
  const [inviting, setInviting] = useState(false);
  const [linkAccess, setLinkAccess] = useState<'restricted' | 'anyone'>('restricted');
  const [linkCopied, setLinkCopied] = useState(false);
  const [expirationDays, setExpirationDays] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'people' | 'link' | 'social'>('people');

  useEffect(() => {
    if (!open) return;
    loadPlatforms();
    loadAccounts();
  }, [open]);

  useEffect(() => {
    if (!open || !projectId) return;
    setLoadingCollaborators(true);
    collaboratorAPI.listByProject(projectId)
      .then(({ data }) => setCollaborators((data as ApiCollaborator[]).map(mapApiCollaborator)))
      .catch(() => toast.error('Failed to load who has access to this design'))
      .finally(() => setLoadingCollaborators(false));
  }, [open, projectId]);

  if (!open) return null;

  const handleConnect = async (p: string) => {
    try {
      const authUrl = await connect(p);
      const popup = window.open(authUrl, 'oauth-connect', 'width=600,height=700');
      if (!popup) {
        toast.error('Your browser blocked the login popup — allow popups for this site and try again');
        return;
      }
      const poll = setInterval(() => {
        if (popup.closed) { clearInterval(poll); loadAccounts(); }
      }, 1000);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      toast.error('Enter a valid email address');
      return;
    }
    if (!projectId) {
      toast.error("Can't share — no design is open");
      return;
    }
    if (collaborators.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
      toast.error('This person already has access to this design');
      return;
    }
    setInviting(true);
    try {
      const { data } = await collaboratorAPI.add({ projectId, email, permission: invitePermission });
      setCollaborators([...collaborators, mapApiCollaborator(data)]);
      setInviteEmail('');
      if (data.emailSent) {
        toast.success(`Invitation sent to ${email}`);
      } else {
        // Real, common case in local/dev environments with no SMTP configured — the
        // share itself still worked (they'll see it next time they open DesignHub),
        // just say so honestly instead of implying an email went out that didn't.
        toast.success(`${email} now has access — but the invite email couldn't be sent (no email service configured)`);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = () => {
    const link = `https://designhub.app/design/${Date.now()}`;
    navigator.clipboard.writeText(link).catch(() => {});
    setLinkCopied(true);
    toast.success('Share link copied to clipboard!');
    setTimeout(() => setLinkCopied(false), 3000);
  };

  const handleRemoveCollab = async (id: string) => {
    const prev = collaborators;
    setCollaborators(collaborators.filter((c) => c.id !== id));
    try {
      await collaboratorAPI.remove(id);
      toast.success('Collaborator removed');
    } catch (err: any) {
      setCollaborators(prev);
      toast.error(err.response?.data?.error || 'Failed to remove collaborator');
    }
  };

  const handlePermissionChange = async (id: string, permission: 'viewer' | 'commenter' | 'editor') => {
    const prev = collaborators;
    setCollaborators(collaborators.map((c) => c.id === id ? { ...c, permission } : c));
    try {
      await collaboratorAPI.update(id, { permission });
      toast.success('Permission updated');
    } catch (err: any) {
      setCollaborators(prev);
      toast.error(err.response?.data?.error || 'Failed to update permission');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Share design</h2>
            {projectName && <p className="text-xs text-gray-400 truncate max-w-xs">{projectName}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><HiOutlineX size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-700">
          <button onClick={() => setActiveTab('people')} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'people' ? 'border-canva-purple text-canva-purple' : 'border-transparent text-gray-400'}`}>
            <HiOutlineUserGroup size={16} className="inline mr-1.5" />People ({collaborators.length})
          </button>
          <button onClick={() => setActiveTab('link')} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'link' ? 'border-canva-purple text-canva-purple' : 'border-transparent text-gray-400'}`}>
            <HiOutlineLink size={16} className="inline mr-1.5" />Link sharing
          </button>
          <button onClick={() => setActiveTab('social')} className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'social' ? 'border-canva-purple text-canva-purple' : 'border-transparent text-gray-400'}`}>
            <HiOutlineGlobeAlt size={16} className="inline mr-1.5" />Post to social
          </button>
        </div>

        <div className="p-5 max-h-[50vh] overflow-y-auto">
          {activeTab === 'people' && (
            <div className="space-y-4">
              {/* Invite */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <HiOutlineMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="input-field pl-9"
                    onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  />
                </div>
                <select value={invitePermission} onChange={(e) => setInvitePermission(e.target.value as any)} className="input-field w-28">
                  <option value="viewer">Viewer</option>
                  <option value="commenter">Commenter</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteEmail.trim()}
                  className="btn-primary px-4 text-sm flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {inviting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <HiOutlinePlus size={16} />
                  )}
                </button>
              </div>

              {/* Current user */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <img src={user?.avatar} alt="" className="w-9 h-9 rounded-full bg-gray-200" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{user?.name} <span className="text-xs text-gray-400">(you)</span></div>
                  <div className="text-xs text-gray-400">{user?.email}</div>
                </div>
                <span className="px-2 py-1 bg-canva-purple/10 text-canva-purple text-xs font-medium rounded-lg">Owner</span>
              </div>

              {/* Collaborators list */}
              {loadingCollaborators && (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-canva-purple border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!loadingCollaborators && collaborators.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">
                  Nobody else has access yet — invite someone above.
                </p>
              )}
              {collaborators.map((collab) => (
                <div key={collab.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <img src={collab.avatar} alt="" className="w-9 h-9 rounded-full bg-gray-200" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{collab.name}</div>
                    <div className="text-xs text-gray-400 truncate">{collab.email}</div>
                  </div>
                  <select
                    value={collab.permission}
                    onChange={(e) => handlePermissionChange(collab.id, e.target.value as any)}
                    className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="commenter">Commenter</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button onClick={() => handleRemoveCollab(collab.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                    <HiOutlineTrash size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'link' && (
            <div className="space-y-5">
              {/* Public link toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                <div className="flex items-center gap-3">
                  {linkAccess === 'anyone' ? <HiOutlineGlobe size={20} className="text-green-500" /> : <HiOutlineLockClosed size={20} className="text-gray-400" />}
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">Anyone with the link</div>
                    <div className="text-xs text-gray-400">{linkAccess === 'anyone' ? 'Anyone can view' : 'Only invited people'}</div>
                  </div>
                </div>
                <button
                  onClick={() => setLinkAccess(linkAccess === 'anyone' ? 'restricted' : 'anyone')}
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${linkAccess === 'anyone' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${linkAccess === 'anyone' ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Copy link */}
              <button onClick={handleCopyLink} className="w-full flex items-center justify-center gap-2 py-3 bg-canva-purple/10 text-canva-purple rounded-xl font-medium text-sm hover:bg-canva-purple/20 transition-colors">
                {linkCopied ? <><HiOutlineCheck size={16} /> Link copied!</> : <><HiOutlineLink size={16} /> Copy share link</>}
              </button>

              {/* Expiration */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Link expiration</label>
                <select value={expirationDays} onChange={(e) => setExpirationDays(Number(e.target.value))} className="input-field">
                  <option value={0}>Never expires</option>
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'social' && (
            <div className="space-y-4">
              {platforms.map((p) => {
                const meta = PLATFORM_META[p.platform];
                const platformAccounts = accounts.filter((a) => a.platform === p.platform && a.isActive);
                return (
                  <div key={p.platform} className={!p.configured ? 'opacity-60' : ''}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base">{meta?.icon}</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{meta?.label}</span>
                      {!p.configured && <span className="text-[10px] text-gray-400">Not available yet</span>}
                    </div>
                    {platformAccounts.length > 0 && (
                      <div className="space-y-1.5 mb-1.5">
                        {platformAccounts.map((a: SocialAccount) => {
                          const expired = !!a.tokenExpiresAt && new Date(a.tokenExpiresAt) < new Date();
                          return expired ? (
                            <button
                              key={a.id}
                              onClick={() => handleConnect(p.platform)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/10 text-left"
                            >
                              <span className="text-sm text-amber-700 dark:text-amber-400">@{a.platformUsername}</span>
                              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">Expired — Reconnect</span>
                            </button>
                          ) : (
                            <button
                              key={a.id}
                              onClick={() => onPublish(a.id)}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 text-left transition-all"
                            >
                              <span className="text-sm font-medium text-gray-900 dark:text-white">@{a.platformUsername}</span>
                              <span className="text-[10px] text-canva-purple font-medium">Publish</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <button
                      disabled={!p.configured}
                      onClick={() => handleConnect(p.platform)}
                      className="text-[11px] text-canva-purple hover:underline disabled:no-underline disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <HiOutlinePlus size={12} /> {platformAccounts.length > 0 ? 'Connect another account' : 'Connect account'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button onClick={onClose} className="btn-primary">Done</button>
        </div>
      </div>
    </div>
  );
}
