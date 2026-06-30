import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { HiOutlineArrowLeft, HiOutlineUser, HiOutlineCamera, HiOutlineCheck, HiOutlineKey } from 'react-icons/hi';
import toast from 'react-hot-toast';
import api from '../utils/api';

export default function ProfileSettingsPage() {
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      const res = await api.put('/auth/me', { name: name.trim(), avatar });
      setUser(res.data);
      localStorage.setItem('designhub-user', JSON.stringify(res.data));
      toast.success('Profile updated!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setChangingPassword(true);
    try {
      await api.put('/auth/me/password', { currentPassword, newPassword });
      toast.success('Password changed!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const avatarOptions = [
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`,
    `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.email}`,
    `https://api.dicebear.com/7.x/lorelei/svg?seed=${user?.email}`,
    `https://api.dicebear.com/7.x/notionists/svg?seed=${user?.email}`,
  ];

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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>
            <p className="text-sm text-gray-500">Manage your account information</p>
          </div>
        </div>

        {/* Avatar Section */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Profile Photo</h3>
          <div className="flex items-center gap-6">
            <div className="relative group">
              <img
                src={avatar || avatarOptions[0]}
                alt="Profile"
                className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 object-cover"
              />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                <HiOutlineCamera size={20} className="text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name || 'User'}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
              <div className="flex gap-2 mt-3">
                {avatarOptions.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => setAvatar(opt)}
                    className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-colors ${
                      avatar === opt ? 'border-[#7B2FBE]' : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img src={opt} alt="" className="w-full h-full" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Basic Info */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Basic Information</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Email Address</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2.5 text-sm bg-gray-100 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 cursor-not-allowed"
              />
              <p className="text-[11px] text-gray-400 mt-1">Email cannot be changed</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Login Provider</label>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{user?.provider || 'Email'}</span>
                {user?.provider === 'google' && (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">OAuth</span>
                )}
              </div>
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving || !name.trim()}
              className="px-6 py-2.5 bg-[#7B2FBE] text-white rounded-xl text-sm font-medium hover:bg-[#6A25A8] disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <HiOutlineCheck size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Change Password</h3>
          <p className="text-xs text-gray-400 mb-4">
            {user?.provider === 'google'
              ? 'You signed in with Google. Set a password to also enable email login.'
              : 'Update your password regularly to keep your account secure.'}
          </p>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
              />
            </div>
            <button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="px-6 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-xl text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <HiOutlineKey size={16} />
              {changingPassword ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
