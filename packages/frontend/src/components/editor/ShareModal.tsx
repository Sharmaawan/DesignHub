import { useState } from 'react';
import { HiOutlineX, HiOutlineLink, HiOutlineMail, HiOutlineGlobe, HiOutlineLockClosed, HiOutlineCheck, HiOutlineUserGroup, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
}

interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  permission: 'viewer' | 'commenter' | 'editor';
}

const DEMO_COLLABORATORS: Collaborator[] = [
  { id: '2', name: 'Sarah Chen', email: 'sarah@team.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah', permission: 'editor' },
  { id: '3', name: 'Mike Johnson', email: 'mike@team.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike', permission: 'commenter' },
];

export default function ShareModal({ open, onClose }: ShareModalProps) {
  const { user } = useAuthStore();
  const [collaborators, setCollaborators] = useState<Collaborator[]>(DEMO_COLLABORATORS);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<'viewer' | 'commenter' | 'editor'>('editor');
  const [linkAccess, setLinkAccess] = useState<'restricted' | 'anyone'>('restricted');
  const [linkCopied, setLinkCopied] = useState(false);
  const [expirationDays, setExpirationDays] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'people' | 'link'>('people');

  if (!open) return null;

  const handleInvite = () => {
    if (!inviteEmail.trim()) return;
    const newCollab: Collaborator = {
      id: Date.now().toString(),
      name: inviteEmail.split('@')[0],
      email: inviteEmail,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${inviteEmail}`,
      permission: invitePermission,
    };
    setCollaborators([...collaborators, newCollab]);
    setInviteEmail('');
    toast.success(`Invitation sent to ${inviteEmail}`);
  };

  const handleCopyLink = () => {
    const link = `https://designhub.app/design/${Date.now()}`;
    navigator.clipboard.writeText(link).catch(() => {});
    setLinkCopied(true);
    toast.success('Share link copied to clipboard!');
    setTimeout(() => setLinkCopied(false), 3000);
  };

  const handleRemoveCollab = (id: string) => {
    setCollaborators(collaborators.filter((c) => c.id !== id));
    toast.success('Collaborator removed');
  };

  const handlePermissionChange = (id: string, permission: 'viewer' | 'commenter' | 'editor') => {
    setCollaborators(collaborators.map((c) => c.id === id ? { ...c, permission } : c));
    toast.success('Permission updated');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Share design</h2>
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
                <button onClick={handleInvite} className="btn-primary px-4 text-sm flex-shrink-0">
                  <HiOutlinePlus size={16} />
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
                  className={`w-11 h-6 rounded-full transition-colors relative ${linkAccess === 'anyone' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${linkAccess === 'anyone' ? 'translate-x-5' : 'translate-x-0.5'}`} />
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
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end">
          <button onClick={onClose} className="btn-primary">Done</button>
        </div>
      </div>
    </div>
  );
}
