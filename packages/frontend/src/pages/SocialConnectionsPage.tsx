import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSocialStore } from '../stores/socialStore';
import { useNotificationStore } from '../stores/notificationStore';
import DashboardSidebar from '../components/dashboard/DashboardSidebar';
import CreateButton from '../components/dashboard/CreateButton';
import NotificationCenter from '../components/dashboard/NotificationCenter';
import { HiOutlineBell, HiOutlineTrash, HiOutlineRefresh, HiOutlineExclamation, HiOutlineCheck, HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  facebook: { label: 'Facebook', icon: '👍', color: '#1877F2' },
  instagram: { label: 'Instagram', icon: '📷', color: '#C13584' },
  linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2' },
  twitter: { label: 'X (Twitter)', icon: '🐦', color: '#111827' },
  pinterest: { label: 'Pinterest', icon: '📌', color: '#E60023' },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  publishing: { label: 'Publishing', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function SocialConnectionsPage() {
  const {
    platforms, accounts, posts,
    loadPlatforms, loadAccounts, disconnect,
    resolvePending, selectPending,
    loadPosts, deletePost, refreshAnalytics,
  } = useSocialStore();
  const { unreadCount, setIsOpen: setNotifOpen } = useNotificationStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('designhub-sidebar-collapsed') === 'true');
  const [activeSection, setActiveSection] = useState('social');
  const [activeTab, setActiveTab] = useState<'connections' | 'history'>('connections');
  const [pendingChoices, setPendingChoices] = useState<{ platform: string; accounts: { platformUserId: string; platformUsername: string }[] } | null>(null);
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
  const [connectingSelected, setConnectingSelected] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  // The pending id is stripped from the URL as soon as it's read (see effect below),
  // so it has to be kept somewhere across renders for the picker's "select" action —
  // a plain variable would be reset to null on every re-render, hence useRef.
  const pendingSelectionId = useRef<string | null>(null);

  useEffect(() => {
    loadPlatforms();
    loadAccounts();
    loadPosts();
  }, []);

  // Land here from the OAuth popup's redirect (?connected=, ?pending=, ?error=)
  useEffect(() => {
    const connected = searchParams.get('connected');
    const pending = searchParams.get('pending');
    const error = searchParams.get('error');

    if (connected) {
      toast.success(`Connected to ${PLATFORM_META[connected]?.label || connected}`);
      loadAccounts();
      setSearchParams({}, { replace: true });
      // This page loaded inside the OAuth popup (the backend's callback redirect
      // lands here, not back on whichever page opened it) — close it so the opener's
      // `popup.closed` poll fires and refreshes its own account list, instead of
      // leaving a second full copy of the app sitting open.
      if (window.opener) window.close();
    } else if (pending) {
      pendingSelectionId.current = pending;
      resolvePending(pending)
        .then((data) => { setPendingChoices(data); setPendingSelected(new Set()); })
        .catch((err) => toast.error(err.message));
      setSearchParams({}, { replace: true });
      // Deliberately NOT closed here — the user still needs to pick which account(s)
      // to connect in this same popup; it closes after that selection completes.
    } else if (error) {
      toast.error(`Connection failed: ${error.replace(/_/g, ' ')}`);
      setSearchParams({}, { replace: true });
      if (window.opener) window.close();
    }
  }, [searchParams]);

  const togglePendingSelected = (platformUserId: string) => {
    setPendingSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platformUserId)) next.delete(platformUserId);
      else next.add(platformUserId);
      return next;
    });
  };

  const handleConnectSelected = async () => {
    if (!pendingChoices || !pendingSelectionId.current || pendingSelected.size === 0) return;
    setConnectingSelected(true);
    try {
      await selectPending(pendingSelectionId.current, Array.from(pendingSelected));
      toast.success(pendingSelected.size > 1 ? `${pendingSelected.size} accounts connected` : 'Account connected');
      setPendingChoices(null);
      setPendingSelected(new Set());
      pendingSelectionId.current = null;
      // Selection finished — safe to close now (see the pending branch above for why
      // it wasn't closed immediately on landing here).
      if (window.opener) window.close();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setConnectingSelected(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#111127] transition-colors">
      <DashboardSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} activeSection={activeSection} onSectionChange={setActiveSection} />

      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-[72px]' : 'ml-[240px]'}`}>
        <header className="sticky top-0 z-30 bg-gray-50/80 dark:bg-[#111127]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-800/50">
          <div className="flex items-center justify-between px-6 h-16">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Social Publishing</h2>
            <div className="flex items-center gap-3">
              <CreateButton />
              <button onClick={() => setNotifOpen(true)} className="relative p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500">
                <HiOutlineBell size={20} />
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold text-white bg-red-500 rounded-full">{unreadCount}</span>}
              </button>
            </div>
          </div>
        </header>

        <main className="px-6 py-8 max-w-[1200px] mx-auto">
          {/* Multi-Page picker (Facebook/Instagram can have several Pages) */}
          {pendingChoices && (
            <div className="mb-6 bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                Choose accounts to connect for {PLATFORM_META[pendingChoices.platform]?.label}
              </h4>
              <p className="text-xs text-gray-400 mb-4">You manage more than one — pick which ones DesignHub should be able to publish to. You can select several.</p>
              <div className="space-y-2">
                {pendingChoices.accounts.map((a) => {
                  const selected = pendingSelected.has(a.platformUserId);
                  return (
                    <button
                      key={a.platformUserId}
                      onClick={() => togglePendingSelected(a.platformUserId)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                        selected ? 'border-[#7B2FBE] bg-[#7B2FBE]/5' : 'border-gray-200 dark:border-gray-700 hover:border-[#7B2FBE] hover:bg-[#7B2FBE]/5'
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{a.platformUsername}</span>
                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                        selected ? 'bg-[#7B2FBE] border-[#7B2FBE] text-white' : 'border-gray-300 dark:border-gray-600'
                      }`}>
                        {selected && <HiOutlineCheck size={12} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleConnectSelected}
                  disabled={pendingSelected.size === 0 || connectingSelected}
                  className="px-4 py-2 text-sm font-medium bg-[#7B2FBE] text-white rounded-xl hover:bg-[#6A25A8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {connectingSelected ? 'Connecting…' : `Connect ${pendingSelected.size || ''} account${pendingSelected.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-6">
            {(['connections', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium capitalize transition-all ${
                  activeTab === tab
                    ? 'bg-[#7B2FBE] text-white shadow-md shadow-[#7B2FBE]/30'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'
                }`}
              >
                {tab === 'connections' ? 'Connected Accounts' : 'Publish History'}
              </button>
            ))}
          </div>

          {/* CONNECTIONS TAB */}
          {activeTab === 'connections' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {platforms.map((p) => {
                const meta = PLATFORM_META[p.platform];
                const platformAccounts = accounts.filter((a) => a.platform === p.platform && a.isActive);

                const startConnect = async () => {
                  try {
                    const { connect } = useSocialStore.getState();
                    const authUrl = await connect(p.platform);
                    const popup = window.open(authUrl, 'oauth-connect', 'width=600,height=700');
                    if (!popup) {
                      // A blocked popup looks identical to "the user closed it" to the
                      // poll below (both are a falsy `popup`) — without this check it
                      // would silently no-op instead of explaining what happened.
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

                return (
                  <div key={p.platform} className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${meta?.color}15` }}>{meta?.icon}</div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{meta?.label}</p>
                        {!p.configured && <p className="text-[11px] text-gray-400">Not available yet</p>}
                      </div>
                    </div>

                    {platformAccounts.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {platformAccounts.map((account) => {
                          const expired = !!account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date();
                          return (
                            <div key={account.id} className="flex items-center justify-between gap-2">
                              {expired ? (
                                <button onClick={startConnect} className="text-xs text-amber-600 dark:text-amber-400 hover:underline text-left">
                                  Expired — @{account.platformUsername} — Reconnect
                                </button>
                              ) : (
                                <span className="text-xs text-green-600 dark:text-green-400">Connected as @{account.platformUsername}</span>
                              )}
                              <button
                                onClick={async () => { await disconnect(account.id); toast.success('Disconnected'); }}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                              >
                                <HiOutlineTrash size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button
                      disabled={!p.configured}
                      onClick={startConnect}
                      className={`w-full py-2 text-sm font-medium rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1 ${
                        platformAccounts.length > 0
                          ? 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                          : 'bg-[#7B2FBE] text-white hover:bg-[#6A25A8]'
                      }`}
                    >
                      {platformAccounts.length > 0 ? (<><HiOutlinePlus size={14} /> Connect another account</>) : 'Connect'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {posts.length === 0 && (
                <div className="text-center py-16 text-gray-400 text-sm">No posts yet — publish a design from the editor to see it here.</div>
              )}
              {posts.map((post) => {
                const meta = PLATFORM_META[post.platform];
                const status = STATUS_META[post.status];
                return (
                  <div key={post.id} className="bg-white dark:bg-[#1e1e30] rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {post.mediaUrls[0] && <img src={post.mediaUrls[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span>{meta?.icon}</span>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{meta?.label}</span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${status?.className}`}>{status?.label}</span>
                          </div>
                          <p className="text-xs text-gray-500 truncate max-w-md">{post.caption || '(no caption)'}</p>
                          {post.status === 'failed' && post.errorMessage && (
                            <p className="text-[11px] text-red-500 flex items-center gap-1 mt-1"><HiOutlineExclamation size={12} /> {post.errorMessage}</p>
                          )}
                          {post.status === 'scheduled' && post.scheduledFor && (
                            <p className="text-[11px] text-blue-500 mt-1">Scheduled for {new Date(post.scheduledFor).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                      <button onClick={async () => { await deletePost(post.id); toast.success('Removed'); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0">
                        <HiOutlineTrash size={14} />
                      </button>
                    </div>

                    {post.status === 'published' && (
                      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                        {post.analytics ? (
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>❤️ {post.analytics.likes} likes</span>
                            <span>💬 {post.analytics.comments} comments</span>
                            <span>🔁 {post.analytics.shares} shares</span>
                            <span>👁️ {post.analytics.reach} reach</span>
                            <span>📊 {post.analytics.impressions} impressions</span>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">No analytics fetched yet</p>
                        )}
                        <button
                          onClick={async () => {
                            setRefreshingId(post.id);
                            try { await refreshAnalytics(post.id); } catch (err: any) { toast.error(err.message); }
                            setRefreshingId(null);
                          }}
                          className="mt-2 flex items-center gap-1 text-[11px] text-[#7B2FBE] hover:underline"
                        >
                          <HiOutlineRefresh size={12} className={refreshingId === post.id ? 'animate-spin' : ''} /> Refresh analytics
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <NotificationCenter />
    </div>
  );
}
