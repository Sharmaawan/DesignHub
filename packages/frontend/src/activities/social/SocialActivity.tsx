import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { socialApi } from '@/services/api/socialApi'
import { approvalApi, type ApprovalState, type WaitingItem } from '@/services/api/approvalApi'
import { useAuthStore } from '@/stores/authStore'
import { useSocialStore } from '@/stores/socialStore'
import { errorMessage, toast } from '@/stores/toastStore'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Tabs, TextAreaField } from '@/components/ui/Fields'
import { confirmDialog } from '@/components/ui/confirm'
import { Modal } from '@/components/ui/Modal'
import { PostComposer } from '@/components/social/PostComposer'
import { PostRow } from '@/components/social/PostRow'
import { PLATFORM_LABEL } from '@/components/social/platforms'
import { PLATFORM_LOGOS } from '@/components/social/platformLogos'
import { timeAgo } from '@/utils/common'
import './social.css'

type Tab = 'posts' | 'approvals' | 'accounts'

// LinkedIn's logo is not in the shared logo set, so its card keeps the text mark until LinkedIn's own file is added.
const PLATFORM_MARK: Record<string, { mark: string; className: string }> = {
  facebook: { mark: 'f', className: 'facebook' },
  instagram: { mark: '◎', className: 'instagram' },
  linkedin: { mark: 'in', className: 'linkedin' },
  x: { mark: 'X', className: 'x' },
  pinterest: { mark: 'P', className: 'pinterest' },
}

export default function SocialActivity() {
  const user = useAuthStore((s) => s.user)!
  const { platforms, accounts, posts, loaded, load, removeAccount } = useSocialStore()
  const [params, setParams] = useSearchParams()
  const initialTab = params.get('tab')
  const [tab, setTab] = useState<Tab>(initialTab === 'approvals' || initialTab === 'accounts' || params.get('connected') || params.get('error') ? initialTab === 'approvals' ? 'approvals' : 'accounts' : 'posts')
  const [error, setError] = useState<string | null>(null)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [designApprovals, setDesignApprovals] = useState<WaitingItem[]>([])
  const [selectedApproval, setSelectedApproval] = useState<{ item: WaitingItem; state: ApprovalState } | null>(null)
  const [approvalFeedback, setApprovalFeedback] = useState('')
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [pendingPages, setPendingPages] = useState<{ ticket: string; pages: { id: string; name: string; loginName: string | null }[] } | null>(null)
  const [pickedPageIds, setPickedPageIds] = useState<string[]>([])
  const [savingPages, setSavingPages] = useState(false)

  useEffect(() => {
    load().catch((e) => setError(errorMessage(e)))
  }, [load])

  async function loadDesignApprovals() {
    try {
      setDesignApprovals(await approvalApi.waiting())
      setApprovalError(null)
    } catch (e) {
      setApprovalError(errorMessage(e))
    }
  }

  useEffect(() => {
    void loadDesignApprovals()
  }, [])

  // useSearchParams() returns a new URLSearchParams instance on every render (not just on navigation), so
  // an effect keyed on `params` can re-fire — asynchronously, before setParams({}, {replace:true}) below
  // has actually cleared the URL — while the connect/error/ticket values are unchanged. That duplicated
  // the "connected"/error toasts and re-requested the same ticket a second time (surfacing as a spurious
  // "expired" toast on an otherwise-valid ticket). Guard with the raw query string so each one is handled once.
  const handledQuery = useRef<string | null>(null)
  useEffect(() => {
    const query = params.toString()
    if (!query || handledQuery.current === query) return
    handledQuery.current = query
    const connected = params.get('connected')
    const err = params.get('error')
    const ticket = params.get('ticket')
    if (connected) toast.success(`${PLATFORM_LABEL[connected] ?? connected} is connected`)
    if (err) toast.error(err === 'cancelled' || err === 'denied' ? 'The connection was cancelled' : err === 'expired' ? 'That connection attempt expired. Try again.' : err)
    if (ticket) {
      setTab('accounts')
      void socialApi.pendingFacebookPages(ticket)
        .then((pages) => {
          setPickedPageIds([])
          setPendingPages({ ticket, pages })
        })
        .catch((error) => toast.error(errorMessage(error)))
    }
    setParams({}, { replace: true })
  }, [params, setParams])

  async function connect(platform: string) {
    setConnecting(platform)
    try {
      window.location.href = (await socialApi.connect(platform)).url
    } catch (e) {
      toast.error(errorMessage(e))
      setConnecting(null)
    }
  }

  async function disconnect(id: number, name: string) {
    const ok = await confirmDialog({ title: `Disconnect ${name}?`, message: 'Scheduled posts for this account will stop working.', confirmLabel: 'Disconnect', danger: true })
    if (!ok) return
    try {
      await socialApi.disconnect(id)
      removeAccount(id)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  function togglePage(pageId: string) {
    setPickedPageIds((current) => (current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId]))
  }

  async function connectPickedPages() {
    if (!pendingPages || !pickedPageIds.length) return
    setSavingPages(true)
    try {
      const saved = await socialApi.selectFacebookPages(pendingPages.ticket, pickedPageIds)
      await load()
      setPendingPages(null)
      toast.success(saved.length === 1 ? `${saved[0]!.displayName} is connected` : `${saved.length} Facebook Pages are connected`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSavingPages(false)
    }
  }

  async function reviewDesign(item: WaitingItem) {
    try {
      const state = await approvalApi.status(item.projectId)
      if (!state.canReview || !state.id) {
        await loadDesignApprovals()
        toast.error('This design is no longer waiting for your review.')
        return
      }
      setApprovalFeedback('')
      setSelectedApproval({ item, state })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  async function decideDesign(approve: boolean) {
    if (!selectedApproval?.state.id) return
    if (!approve && !approvalFeedback.trim()) {
      toast.error('Add a reason before requesting changes.')
      return
    }
    setApprovalBusy(true)
    try {
      if (approve) await approvalApi.approve(selectedApproval.state.id, selectedApproval.state.caption ?? '')
      else await approvalApi.requestChanges(selectedApproval.state.id, approvalFeedback.trim())
      setSelectedApproval(null)
      await loadDesignApprovals()
      toast.success(approve ? 'Design approved for publishing.' : 'Changes requested from the Maker.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setApprovalBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => location.reload()} />
  const waiting = posts.filter((p) => p.status === 'PENDING_APPROVAL' && p.reviewerId === user.id)

  return (
    <div className="page__inner">
      <div className="page__head">
        <div>
          <h1>Publishing</h1>
          <p>Draft, review, schedule and publish your designs to social networks.</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setComposing(true)}>
          New post
        </Button>
      </div>
      <div style={{ maxWidth: 520, marginBottom: 20 }}>
        <Tabs<Tab>
          value={tab}
          onChange={(next) => {
            setTab(next)
            setParams(next === 'posts' ? {} : { tab: next }, { replace: true })
            if (next === 'approvals') void loadDesignApprovals()
          }}
          tabs={[
            { id: 'posts', label: waiting.length ? `Posts (${waiting.length} to review)` : 'Posts' },
            { id: 'approvals', label: designApprovals.length ? `Design approvals (${designApprovals.length})` : 'Design approvals' },
            { id: 'accounts', label: 'Accounts' },
          ]}
        />
      </div>

      {tab === 'approvals' ? (
        approvalError ? (
          <ErrorState message={approvalError} onRetry={() => void loadDesignApprovals()} />
        ) : designApprovals.length === 0 ? (
          <EmptyState icon="check" title="No designs awaiting review" message="Designs submitted by Makers will appear here for review." />
        ) : (
          <div className="post-list">
            {designApprovals.map((item) => (
              <article key={item.projectId} className="card post-row">
                {item.thumbnail
                  ? <img className="post-row__img" src={item.thumbnail} alt={`Preview of ${item.title}`} />
                  : <div className="post-row__img post-row__img--empty" />}
                <div className="post-row__body">
                  <div className="post-row__top">
                    <strong>{item.title}</strong>
                    <span className="badge badge--warn">Pending approval</span>
                  </div>
                  <p className="post-row__meta">Submitted by {item.requestedBy} · {new Date(item.requestedAt).toLocaleString()}</p>
                  <div className="post-row__actions">
                    <Button size="sm" onClick={() => window.open(`/editor/${item.projectId}`, '_blank', 'noopener,noreferrer')}>Open design</Button>
                    <Button size="sm" variant="primary" icon="check" onClick={() => void reviewDesign(item)}>Review</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : !loaded ? (
        <Skeleton height={180} radius={16} />
      ) : tab === 'posts' ? (
        posts.length === 0 ? (
          <EmptyState
            icon="send"
            title="No posts yet"
            message={accounts.length ? 'Create a post, or publish straight from the editor.' : 'Connect a social account, then create your first post.'}
            action={
              <Button variant="primary" onClick={() => (accounts.length ? setComposing(true) : setTab('accounts'))}>
                {accounts.length ? 'New post' : 'Connect an account'}
              </Button>
            }
          />
        ) : (
          <div className="post-list">
            {posts.map((p) => (
              <PostRow key={p.id} post={p} userId={user.id} />
            ))}
          </div>
        )
      ) : (
        <section className="accounts-section" aria-label="Social accounts">
          <div className="accounts-section__intro">
            <div>
              <h2>Social accounts</h2>
              <p>Connect your channels to publish and manage posts from one place.</p>
            </div>
            <span className="accounts-section__count">{accounts.length} connected</span>
          </div>
          <div className="platform-grid">
            {platforms.map((p) => {
              const mine = accounts.filter((a) => a.platform === p.platform)
              const platform = PLATFORM_MARK[p.platform] ?? { mark: (PLATFORM_LABEL[p.platform] ?? p.platform).slice(0, 1).toUpperCase(), className: 'default' }
              return (
                <section key={p.platform} className={`card platform-card${mine.length ? ' platform-card--connected' : ''}${!p.configured ? ' platform-card--unconfigured' : ''}`}>
                  <div className="platform-card__head">
                    <div className="platform-card__identity">
                      <span className={`platform-mark platform-mark--${platform.className}`} aria-hidden="true">
                        {PLATFORM_LOGOS[p.platform] ? (
                          <svg viewBox="0 0 24 24" width="22" height="22" role="img" aria-label={PLATFORM_LOGOS[p.platform]!.title}>
                            <path d={PLATFORM_LOGOS[p.platform]!.path} fill={p.platform === 'x' ? '#FFFFFF' : PLATFORM_LOGOS[p.platform]!.hex} />
                          </svg>
                        ) : platform.mark}
                      </span>
                      <div>
                        <h3>{PLATFORM_LABEL[p.platform] ?? p.platform}</h3>
                        <span className={`platform-card__status${mine.length ? ' is-connected' : ''}`}>
                          <span className="platform-card__status-dot" />
                          {mine.length ? `${mine.length} account${mine.length === 1 ? '' : 's'} connected` : p.configured ? 'Ready to connect' : 'Setup required'}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" disabled={!p.configured} loading={connecting === p.platform} onClick={() => void connect(p.platform)}>
                      {mine.length ? 'Add another' : 'Connect'}
                    </Button>
                  </div>
                  {!p.configured && <p className="platform-card__setup">An administrator needs to add this platform’s app credentials.</p>}
                  {mine.map((a) => (
                    <div key={a.id} className="account-row">
                      <div className="account-row__identity">
                        <strong>{a.displayName}</strong>
                        <div className="field__hint">
                          Connected {timeAgo(a.connectedAt)}
                          {a.loginName && ` · Login: ${a.loginName}`}
                          {a.expired && ' · Expired, reconnect'}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => void disconnect(a.id, a.displayName)}>
                        Disconnect
                      </Button>
                    </div>
                  ))}
                </section>
              )
            })}
          </div>
        </section>
      )}

      {composing && <PostComposer onClose={() => setComposing(false)} />}
      {pendingPages && (
        <Modal
          title="Choose Facebook Pages"
          onClose={() => !savingPages && setPendingPages(null)}
          locked={savingPages}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPendingPages(null)} disabled={savingPages}>Cancel</Button>
              <Button
                variant="primary"
                loading={savingPages}
                disabled={!pickedPageIds.length}
                onClick={() => void connectPickedPages()}
              >
                {pickedPageIds.length ? `Connect ${pickedPageIds.length} Page${pickedPageIds.length === 1 ? '' : 's'}` : 'Connect Pages'}
              </Button>
            </>
          }
        >
          <p style={{ color: 'var(--ink-2)', marginTop: 0 }}>
            Select the Pages you want to connect. Pages from another Facebook login can be added with “Add another.”
          </p>
          {pendingPages.pages[0]?.loginName && (
            <p className="field__hint">Pages granted by {pendingPages.pages[0].loginName}</p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {pendingPages.pages.map((page) => (
              <label
                key={page.id}
                style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 12, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={pickedPageIds.includes(page.id)}
                  onChange={() => togglePage(page.id)}
                  disabled={savingPages}
                />
                {page.name}
              </label>
            ))}
          </div>
        </Modal>
      )}
      {selectedApproval && (
        <Modal
          title="Review design"
          onClose={() => !approvalBusy && setSelectedApproval(null)}
          locked={approvalBusy}
          wide
          footer={
            <>
              <Button variant="ghost" onClick={() => setSelectedApproval(null)} disabled={approvalBusy}>Cancel</Button>
              <Button onClick={() => void decideDesign(false)} loading={approvalBusy}>Request changes</Button>
              <Button variant="primary" icon="check" onClick={() => void decideDesign(true)} loading={approvalBusy}>Approve for publishing</Button>
            </>
          }
        >
          <p><b>{selectedApproval.item.title}</b> submitted by {selectedApproval.item.requestedBy}</p>
          <p className="field__hint">
            Submitted {new Date(selectedApproval.item.requestedAt).toLocaleString()}.
            {' '}Open the full design in another tab if you need to inspect its pages closely.
          </p>
          {selectedApproval.item.thumbnail && (
            <img
              src={selectedApproval.item.thumbnail}
              alt={`Preview of ${selectedApproval.item.title}`}
              style={{ display: 'block', width: '100%', maxHeight: '45vh', objectFit: 'contain', background: 'var(--surface-2)', borderRadius: 12, margin: '12px 0' }}
            />
          )}
          {selectedApproval.state.message && <p>{selectedApproval.state.message}</p>}
          <TextAreaField
            label="Feedback for the Maker"
            value={approvalFeedback}
            onChange={(event) => setApprovalFeedback(event.target.value)}
            rows={3}
            maxLength={2000}
            hint="Required when requesting changes."
          />
        </Modal>
      )}
    </div>
  )
}
