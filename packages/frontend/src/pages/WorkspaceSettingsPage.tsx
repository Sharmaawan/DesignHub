import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useTeamStore } from '../stores/teamStore';
import { HiOutlineArrowLeft, HiOutlineUserGroup, HiOutlinePlus, HiOutlineTrash, HiOutlineCog, HiOutlineShieldCheck, HiOutlineGlobe, HiOutlineBell, HiOutlineRefresh } from 'react-icons/hi';
import { templateAPI } from '../utils/api';
import { Template } from '../types';
import toast from 'react-hot-toast';

export default function WorkspaceSettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { workspaces, loadTeams, createTeam } = useTeamStore();
  const [teamName, setTeamName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(user?.name ? `${user.name}'s Workspace` : 'My Workspace');
  const [autoSave, setAutoSave] = useState(true);
  const [defaultView, setDefaultView] = useState('grid');
  const [language, setLanguage] = useState('en');
  const [trashItems, setTrashItems] = useState<Template[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);

  useEffect(() => {
    loadTeams();
    loadTrash();
  }, []);

  const loadTrash = async () => {
    setTrashLoading(true);
    try {
      const { data } = await templateAPI.trash();
      setTrashItems(data);
    } catch {
      toast.error('Failed to load recycle bin');
    } finally {
      setTrashLoading(false);
    }
  };

  const handleRestoreTemplate = async (id: string) => {
    try {
      await templateAPI.restore(id);
      toast.success('Template restored');
      loadTrash();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to restore template');
    }
  };

  const handlePermanentDelete = async (id: string) => {
    try {
      await templateAPI.deletePermanent(id);
      toast.success('Deleted permanently');
      loadTrash();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete template');
    }
  };

  const handleCreateTeam = async () => {
    if (!teamName.trim()) return;
    setIsCreating(true);
    try {
      await createTeam(teamName.trim());
      setTeamName('');
      toast.success('Team created!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f0f23]">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          >
            <HiOutlineArrowLeft size={20} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workspace Settings</h1>
            <p className="text-sm text-gray-500">Manage your workspace and team settings</p>
          </div>
        </div>

        {/* Workspace Info */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineCog size={20} className="text-[#7B2FBE]" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">General</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Workspace Name</label>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Default View</label>
              <select
                value={defaultView}
                onChange={(e) => setDefaultView(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              >
                <option value="grid">Grid View</option>
                <option value="list">List View</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="hi">हिन्दी</option>
              </select>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Auto-save</p>
                <p className="text-xs text-gray-400">Automatically save changes while editing</p>
              </div>
              <button
                onClick={() => setAutoSave(!autoSave)}
                className={`w-11 h-6 rounded-full transition-colors relative ${autoSave ? 'bg-[#7B2FBE]' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${autoSave ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Teams */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <HiOutlineUserGroup size={20} className="text-[#7B2FBE]" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Teams</h3>
            </div>
          </div>
          {workspaces.length > 0 ? (
            <div className="space-y-3 mb-4">
              {workspaces.map((ws) => (
                <div key={ws.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#7B2FBE] to-[#4A0E8F] flex items-center justify-center">
                      <span className="text-sm font-bold text-white">{ws.name?.[0]?.toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{ws.name}</p>
                      <p className="text-[11px] text-gray-400">{(ws.members || []).length} members</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-4">No teams yet. Create one to collaborate with others.</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="New team name..."
              className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTeam(); }}
            />
            <button
              onClick={handleCreateTeam}
              disabled={!teamName.trim() || isCreating}
              className="px-4 py-2 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <HiOutlinePlus size={14} />
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>

        {/* Preferences */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineBell size={20} className="text-[#7B2FBE]" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Notifications</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Email notifications', desc: 'Receive email updates about your projects', defaultOn: true },
              { label: 'Collaboration alerts', desc: 'Get notified when someone edits your designs', defaultOn: true },
              { label: 'Comment mentions', desc: 'Get notified when someone mentions you', defaultOn: true },
              { label: 'Product updates', desc: 'Learn about new features and improvements', defaultOn: false },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>
                <button
                  className={`w-11 h-6 rounded-full transition-colors relative ${item.defaultOn ? 'bg-[#7B2FBE]' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow absolute top-0.5 transition-transform ${item.defaultOn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Templates Recycle Bin — only ever shows templates this user uploaded and
            deleted themselves; the shared built-in catalog is never deletable. */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineTrash size={20} className="text-[#7B2FBE]" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Templates Recycle Bin</h3>
          </div>
          {trashLoading && <p className="text-xs text-gray-400 text-center py-6">Loading…</p>}
          {!trashLoading && trashItems.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">Nothing here — templates you uploaded and deleted will show up in this bin.</p>
          )}
          {!trashLoading && trashItems.length > 0 && (
            <div className="space-y-2">
              {trashItems.map((t) => (
                <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <div className="w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                    {t.thumbnail && <img src={t.thumbnail} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.name}</p>
                    <p className="text-[11px] text-gray-400">{t.category}</p>
                  </div>
                  <button
                    onClick={() => handleRestoreTemplate(t.id)}
                    title="Restore"
                    className="p-2 rounded-lg text-gray-400 hover:text-[#7B2FBE] hover:bg-[#7B2FBE]/10"
                  >
                    <HiOutlineRefresh size={16} />
                  </button>
                  <button
                    onClick={() => handlePermanentDelete(t.id)}
                    title="Delete forever"
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <HiOutlineTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Privacy & Security */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <HiOutlineShieldCheck size={20} className="text-[#7B2FBE]" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Privacy & Security</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Public profile</p>
                <p className="text-xs text-gray-400">Allow others to find your profile</p>
              </div>
              <button className="w-11 h-6 rounded-full transition-colors relative bg-gray-300 dark:bg-gray-600">
                <div className="w-5 h-5 rounded-full bg-white shadow absolute top-0.5 translate-x-0.5" />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Activity status</p>
                <p className="text-xs text-gray-400">Show when you're online</p>
              </div>
              <button className="w-11 h-6 rounded-full transition-colors relative bg-[#7B2FBE]">
                <div className="w-5 h-5 rounded-full bg-white shadow absolute top-0.5 translate-x-5" />
              </button>
            </div>
            <button className="w-full p-3 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors">
              Delete Account
            </button>
          </div>
        </div>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => toast.success('Settings saved!')}
            className="px-6 py-2.5 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] transition-colors"
          >
            Save All Changes
          </button>
        </div>
      </div>
    </div>
  );
}
