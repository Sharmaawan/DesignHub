import { useState, useEffect } from 'react';
import { HiOutlineX, HiOutlineCheck, HiOutlineExclamation, HiOutlineLink, HiOutlineChatAlt, HiOutlineClock, HiOutlinePlus } from 'react-icons/hi';
import { useEditorStore } from '../../stores/editorStore';
import { useSocialStore, SocialAccount } from '../../stores/socialStore';
import { uploadAPI } from '../../utils/api';
import toast from 'react-hot-toast';

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  initialAccountId?: string | null;
}

const PLATFORM_META: Record<string, { label: string; icon: string; color: string }> = {
  facebook: { label: 'Facebook', icon: '👍', color: '#1877F2' },
  instagram: { label: 'Instagram', icon: '📷', color: '#C13584' },
  linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2' },
  twitter: { label: 'X (Twitter)', icon: '🐦', color: '#111827' },
  pinterest: { label: 'Pinterest', icon: '📌', color: '#E60023' },
};

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

export default function PublishModal({ open, onClose, initialAccountId }: PublishModalProps) {
  const { pages, currentPageIndex } = useEditorStore();
  const { platforms, accounts, loadPlatforms, loadAccounts, connect, createPost } = useSocialStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'carousel' | 'story'>('image');
  const [caption, setCaption] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [altText, setAltText] = useState('');
  const [firstComment, setFirstComment] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [action, setAction] = useState<'now' | 'schedule' | 'draft'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'published' | 'scheduled' | 'draft' | 'failed' | null>(null);

  const currentPage = pages[currentPageIndex];

  useEffect(() => {
    if (!open) return;
    setStep(initialAccountId ? 2 : 1);
    setSelectedAccountId(initialAccountId || null);
    setResult(null);
    setSubmitting(false);
    loadPlatforms();
    loadAccounts();
  }, [open, initialAccountId]);

  if (!open) return null;

  const account: SocialAccount | undefined = selectedAccountId ? accounts.find((a) => a.id === selectedAccountId) : undefined;
  const platformConfig = account ? platforms.find((p) => p.platform === account.platform) : null;

  const handleConnect = async (p: string) => {
    try {
      const authUrl = await connect(p);
      const popup = window.open(authUrl, 'oauth-connect', 'width=600,height=700');
      if (!popup) {
        // A blocked popup looks identical to "the user closed it" to the poll below
        // (both are a falsy `popup`) — without this check it would silently no-op
        // instead of explaining what happened.
        toast.error('Your browser blocked the login popup — allow popups for this site and try again');
        return;
      }
      const poll = setInterval(() => {
        if (popup.closed) {
          clearInterval(poll);
          loadAccounts();
        }
      }, 1000);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSelectAccount = (a: SocialAccount) => {
    setSelectedAccountId(a.id);
    const spec = platforms.find((pc) => pc.platform === a.platform)?.spec;
    if (spec && !spec.mediaTypes.includes(mediaType)) setMediaType(spec.mediaTypes[0]);
  };

  const dimensionWarning = (() => {
    if (!platformConfig || !currentPage) return null;
    const match = platformConfig.spec.dimensions.find((d) => d.width === currentPage.width && d.height === currentPage.height);
    if (match) return null;
    const best = platformConfig.spec.dimensions[0];
    return `Your design is ${currentPage.width}×${currentPage.height} — ${platformConfig.spec.label} recommends ${best.label} (${best.width}×${best.height}). You can still publish; it may get cropped or letterboxed.`;
  })();

  const handleSubmit = async () => {
    if (!account) return;
    setSubmitting(true);
    try {
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('Could not find the design canvas to export');
      const dataUrl = canvas.toDataURL('image/png');
      const file = dataUrlToFile(dataUrl, `publish-${Date.now()}.png`);
      const { data: uploaded } = await uploadAPI.upload(file);
      const BACKEND = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
      const mediaUrl = `${BACKEND}${uploaded.url}`;

      const hashtags = hashtagsInput.split(/[\s,]+/).map((h) => h.replace(/^#/, '').trim()).filter(Boolean);

      const post = await createPost({
        socialAccountId: account.id,
        action,
        mediaType,
        mediaUrls: [mediaUrl],
        caption: caption || undefined,
        hashtags: hashtags.length ? hashtags : undefined,
        altText: altText || undefined,
        firstComment: firstComment || undefined,
        linkUrl: linkUrl || undefined,
        scheduledFor: action === 'schedule' && scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      });

      setResult(post.status === 'published' ? 'published' : post.status === 'failed' ? 'failed' : post.status === 'scheduled' ? 'scheduled' : 'draft');
      if (post.status === 'failed') {
        toast.error(post.errorMessage || 'Publish failed');
      } else {
        toast.success(
          post.status === 'published' ? 'Published!' : post.status === 'scheduled' ? 'Scheduled!' : 'Saved as draft'
        );
      }
    } catch (err: any) {
      console.error('[Publish] failed', err);
      toast.error(err.response?.data?.error || err.message || 'Failed to publish');
      setResult('failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Publish design</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><HiOutlineX size={18} /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[65vh] overflow-y-auto">
          {/* STEP 1: choose account */}
          {step === 1 && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-3">Choose an account</label>
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
                          {platformAccounts.map((a) => {
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
                                onClick={() => handleSelectAccount(a)}
                                disabled={!p.configured}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 text-left transition-all disabled:cursor-not-allowed ${
                                  selectedAccountId === a.id
                                    ? 'border-canva-purple bg-canva-purple/5'
                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                              >
                                <span className="text-sm font-medium text-gray-900 dark:text-white">@{a.platformUsername}</span>
                                {selectedAccountId === a.id && <HiOutlineCheck size={16} className="text-canva-purple" />}
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
            </div>
          )}

          {/* STEP 2: composer */}
          {step === 2 && platformConfig && (
            <div className="space-y-4">
              {dimensionWarning && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl text-amber-700 dark:text-amber-400 text-xs">
                  <HiOutlineExclamation size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{dimensionWarning}</span>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Format</label>
                <div className="flex gap-2 flex-wrap">
                  {platformConfig.spec.mediaTypes.map((mt) => (
                    <button key={mt} onClick={() => setMediaType(mt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 capitalize transition-all ${
                        mediaType === mt ? 'border-canva-purple bg-canva-purple/5 text-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                      {mt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">Caption</label>
                <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3}
                  maxLength={platformConfig.spec.maxCaptionLength}
                  placeholder="Write a caption..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg resize-none bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30" />
                <div className="text-[10px] text-gray-400 text-right mt-0.5">{caption.length} / {platformConfig.spec.maxCaptionLength}</div>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">Hashtags</label>
                <input value={hashtagsInput} onChange={(e) => setHashtagsInput(e.target.value)} placeholder="design, canva, marketing"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30" />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">Alt text</label>
                <input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="Describe the image for accessibility"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30" />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-1"><HiOutlineChatAlt size={14} /> First comment</label>
                <input value={firstComment} onChange={(e) => setFirstComment(e.target.value)} placeholder="Posted automatically right after publishing"
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30" />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-1"><HiOutlineLink size={14} /> Link attachment</label>
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30" />
              </div>
            </div>
          )}

          {/* STEP 3: schedule + confirm */}
          {step === 3 && platformConfig && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">When?</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'now', label: 'Post now' },
                    { id: 'schedule', label: 'Schedule' },
                    { id: 'draft', label: 'Save as draft' },
                  ] as const).map((a) => (
                    <button key={a.id} onClick={() => setAction(a.id)}
                      className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                        action === a.id ? 'border-canva-purple bg-canva-purple/5 text-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>

              {action === 'schedule' && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5 mb-1"><HiOutlineClock size={14} /> Schedule for</label>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-canva-purple/30"
                  />
                </div>
              )}

              {result && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
                  result === 'failed' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                }`}>
                  {result === 'failed' ? <HiOutlineExclamation size={18} /> : <HiOutlineCheck size={18} />}
                  {result === 'published' && 'Published successfully!'}
                  {result === 'scheduled' && 'Scheduled — it will publish automatically at the chosen time.'}
                  {result === 'draft' && 'Saved as a draft. Find it in Social Publishing > History.'}
                  {result === 'failed' && "Couldn't publish — check the platform is connected and try again."}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <button
            onClick={() => (step === 1 ? onClose() : setStep((s) => (s - 1) as 1 | 2))}
            className="btn-secondary text-sm"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as 2 | 3)}
              disabled={step === 1 && !account}
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting || (action === 'schedule' && !scheduledFor) || result !== null}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Publishing…' : action === 'now' ? 'Publish' : action === 'schedule' ? 'Schedule' : 'Save draft'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
