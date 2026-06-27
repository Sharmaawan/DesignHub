import { useState, useEffect } from 'react';
import { HiOutlineX, HiOutlineCheck, HiOutlineCog, HiOutlineSun, HiOutlineMoon, HiOutlineGlobe, HiOutlineKey, HiOutlineClock, HiOutlineViewGrid, HiOutlineTemplate, HiOutlineBell, HiOutlineShieldCheck, HiOutlineUser } from 'react-icons/hi';
import { useThemeStore } from '../../stores/themeStore';
import toast from 'react-hot-toast';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'editor' | 'account' | 'shortcuts' | 'notifications' | 'privacy';

interface AppSettings {
  appearance: { theme: 'light' | 'dark' | 'system'; language: string };
  editor: { autosaveInterval: number; showGrid: boolean; showRulers: boolean; showGuides: boolean; snapEnabled: boolean; defaultCanvasWidth: number; defaultCanvasHeight: number };
  account: { name: string; email: string };
  notifications: { emailNotifications: boolean; collaborationNotifs: boolean; commentNotifs: boolean };
  privacy: { profileVisible: boolean; activityVisible: boolean };
}

const DEFAULT_SETTINGS: AppSettings = {
  appearance: { theme: 'system', language: 'English' },
  editor: { autosaveInterval: 30, showGrid: false, showRulers: true, showGuides: true, snapEnabled: true, defaultCanvasWidth: 1920, defaultCanvasHeight: 1080 },
  account: { name: '', email: '' },
  notifications: { emailNotifications: true, collaborationNotifs: true, commentNotifs: true },
  privacy: { profileVisible: true, activityVisible: true },
};

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem('designhub-settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem('designhub-settings', JSON.stringify(settings));
}

export { loadSettings, saveSettings };
export type { AppSettings };

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const { setTheme } = useThemeStore();

  useEffect(() => {
    if (open) setSettings(loadSettings());
  }, [open]);

  const update = (section: keyof AppSettings, key: string, value: any) => {
    const updated = { ...settings, [section]: { ...(settings[section] as any), [key]: value } };
    setSettings(updated);
    saveSettings(updated);
    if (section === 'appearance' && key === 'theme') setTheme(value);
    toast.success('Setting saved');
  };

  if (!open) return null;

  const tabs: { id: SettingsTab; icon: any; label: string }[] = [
    { id: 'appearance', icon: HiOutlineSun, label: 'Appearance' },
    { id: 'editor', icon: HiOutlineViewGrid, label: 'Editor' },
    { id: 'shortcuts', icon: HiOutlineKey, label: 'Shortcuts' },
    { id: 'account', icon: HiOutlineUser, label: 'Account' },
    { id: 'notifications', icon: HiOutlineBell, label: 'Notifications' },
    { id: 'privacy', icon: HiOutlineShieldCheck, label: 'Privacy' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[80vh] flex overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Sidebar */}
        <div className="w-56 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between px-3 py-2 mb-2">
            <span className="text-sm font-bold text-gray-900 dark:text-white">Settings</span>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"><HiOutlineX size={16} /></button>
          </div>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-canva-purple/10 text-canva-purple' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Appearance</h3>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Theme</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => update('appearance', 'theme', theme)}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                        settings.appearance.theme === theme
                          ? 'border-canva-purple bg-canva-purple/5 text-canva-purple'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-lg mb-1">{theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '💻'}</span>
                      {theme.charAt(0).toUpperCase() + theme.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Language</label>
                <select
                  value={settings.appearance.language}
                  onChange={(e) => update('appearance', 'language', e.target.value)}
                  className="input-field"
                >
                  {['English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Portuguese', 'Korean', 'Arabic', 'Hindi'].map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Editor Preferences</h3>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">Auto-save interval (seconds)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={120}
                    value={settings.editor.autosaveInterval}
                    onChange={(e) => update('editor', 'autosaveInterval', Number(e.target.value))}
                    className="flex-1 accent-canva-purple"
                  />
                  <span className="text-sm text-gray-500 w-12 text-right">{settings.editor.autosaveInterval}s</span>
                </div>
              </div>
              {[
                { key: 'showGrid', label: 'Show grid by default' },
                { key: 'showRulers', label: 'Show rulers by default' },
                { key: 'showGuides', label: 'Show alignment guides' },
                { key: 'snapEnabled', label: 'Enable snap to grid' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between py-2 cursor-pointer">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                  <button
                    onClick={() => update('editor', item.key, !(settings.editor as any)[item.key])}
                    className={`w-10 h-6 rounded-full transition-colors relative ${(settings.editor as any)[item.key] ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(settings.editor as any)[item.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Default canvas width</label>
                  <input type="number" value={settings.editor.defaultCanvasWidth} onChange={(e) => update('editor', 'defaultCanvasWidth', Number(e.target.value))} className="input-field" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Default canvas height</label>
                  <input type="number" value={settings.editor.defaultCanvasHeight} onChange={(e) => update('editor', 'defaultCanvasHeight', Number(e.target.value))} className="input-field" />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h3>
              <div className="grid grid-cols-1 gap-2">
                {[
                  ['Ctrl+Z', 'Undo'],
                  ['Ctrl+Shift+Z', 'Redo'],
                  ['Ctrl+C', 'Copy element'],
                  ['Ctrl+V', 'Paste element'],
                  ['Ctrl+X', 'Cut element'],
                  ['Ctrl+A', 'Select all'],
                  ['Ctrl+D', 'Duplicate element'],
                  ['Delete / Backspace', 'Delete selected'],
                  ['Escape', 'Deselect all'],
                  ['Ctrl++', 'Zoom in'],
                  ['Ctrl+-', 'Zoom out'],
                  ['Ctrl+0', 'Reset zoom'],
                  ['Ctrl+Shift+S', 'Save project'],
                  ['Ctrl+G', 'Group elements'],
                  ['Ctrl+Shift+G', 'Ungroup elements'],
                  ['Double-click text', 'Edit text inline'],
                  ['Scroll wheel', 'Zoom canvas'],
                  ['Middle-click drag', 'Pan canvas'],
                ].map(([key, action]) => (
                  <div key={key} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{action}</span>
                    <kbd className="px-2.5 py-1 bg-gray-100 dark:bg-gray-700 rounded-md text-xs font-mono text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Account Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Display name</label>
                  <input type="text" className="input-field" placeholder="Your name" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Email</label>
                  <input type="email" className="input-field" placeholder="your@email.com" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Password</label>
                  <button className="btn-secondary text-sm">Change password</button>
                </div>
                <hr className="border-gray-200 dark:border-gray-700" />
                <div>
                  <button className="text-sm text-red-600 hover:text-red-700 font-medium">Delete account</button>
                  <p className="text-xs text-gray-400 mt-1">This action cannot be undone.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Notifications</h3>
              {[
                { key: 'emailNotifications', label: 'Email notifications', desc: 'Receive email updates about your designs' },
                { key: 'collaborationNotifs', label: 'Collaboration alerts', desc: 'Get notified when someone edits your design' },
                { key: 'commentNotifs', label: 'Comment notifications', desc: 'Get notified about new comments' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">{item.label}</span>
                    <span className="text-xs text-gray-400">{item.desc}</span>
                  </div>
                  <button
                    onClick={() => update('notifications', item.key, !(settings.notifications as any)[item.key])}
                    className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${(settings.notifications as any)[item.key] ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(settings.notifications as any)[item.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              ))}
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Privacy</h3>
              {[
                { key: 'profileVisible', label: 'Public profile', desc: 'Allow others to see your profile' },
                { key: 'activityVisible', label: 'Show activity status', desc: 'Let others see when you are online' },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">{item.label}</span>
                    <span className="text-xs text-gray-400">{item.desc}</span>
                  </div>
                  <button
                    onClick={() => update('privacy', item.key, !(settings.privacy as any)[item.key])}
                    className={`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 ${(settings.privacy as any)[item.key] ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${(settings.privacy as any)[item.key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
