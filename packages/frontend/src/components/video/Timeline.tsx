import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { VideoClip } from '@/models/video'
import { useVideoEditorStore } from '@/stores/videoEditorStore'
import { useVideoEditorUiStore } from '@/stores/videoEditorUiStore'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { AudioWaveform, VideoThumbnails } from './ClipMedia'

const MIN_DURATION = 0.2

function fmt(t: number) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

interface TrimValues {
  start: number
  duration: number
  trimIn: number
}

interface TrimSession {
  id: string
  kind: VideoClip['kind']
  sourceDuration?: number
  original: TrimValues
  draft: TrimValues
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Precision trim toolbar for a clip in trim mode: numeric Trim In / Trim Out / Duration fields, a
 * mini bar previewing the selected segment against the full source, and Reset/Cancel/Apply. All edits
 * write to `onDraft` (live-previewed via store.previewClip by the caller) and only commit on Apply. */
function TrimToolbar({ session, onDraft, onReset, onCancel, onApply }: {
  session: TrimSession
  onDraft: (next: TrimValues) => void
  onReset: () => void
  onCancel: () => void
  onApply: () => void
}) {
  const { draft, sourceDuration } = session
  const trimOut = draft.trimIn + draft.duration
  const maxOut = sourceDuration ?? trimOut + 100000

  function setTrimIn(raw: string) {
    const v = Number(raw)
    if (!Number.isFinite(v)) return
    const clamped = Math.max(0, Math.min(v, trimOut - MIN_DURATION))
    const delta = clamped - draft.trimIn
    onDraft({ start: Math.max(0, round2(draft.start + delta)), duration: round2(draft.duration - delta), trimIn: round2(clamped) })
  }

  function setTrimOut(raw: string) {
    const v = Number(raw)
    if (!Number.isFinite(v)) return
    const clamped = Math.max(draft.trimIn + MIN_DURATION, Math.min(v, maxOut))
    onDraft({ ...draft, duration: round2(clamped - draft.trimIn) })
  }

  const barPct = (v: number) => (sourceDuration ? Math.min(100, Math.max(0, (v / sourceDuration) * 100)) : 0)

  return (
    <div className="video-trim-toolbar">
      <span className="video-trim-toolbar__title">
        <Icon name="scissors" size={14} /> Precision trim
      </span>
      <label className="video-trim-toolbar__field">
        Trim in
        <input type="number" step="0.1" min={0} value={draft.trimIn} onChange={(e) => setTrimIn(e.target.value)} />
      </label>
      <label className="video-trim-toolbar__field">
        Trim out
        <input type="number" step="0.1" min={0} value={round2(trimOut)} onChange={(e) => setTrimOut(e.target.value)} />
      </label>
      <span className="video-trim-toolbar__readout">
        Duration <strong>{draft.duration.toFixed(1)}s</strong>
      </span>
      <span className="video-trim-toolbar__readout">
        Source <strong>{sourceDuration != null ? `${sourceDuration.toFixed(1)}s` : '—'}</strong>
      </span>
      {sourceDuration != null && (
        <div className="video-trim-toolbar__bar" title="Selected segment of the source media">
          <div className="video-trim-toolbar__bar-segment" style={{ left: `${barPct(draft.trimIn)}%`, width: `${barPct(trimOut) - barPct(draft.trimIn)}%` }} />
        </div>
      )}
      <span style={{ flex: 1 }} />
      <Button size="sm" variant="ghost" onClick={onReset}>Reset</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel (Esc)</Button>
      <Button size="sm" variant="primary" onClick={onApply}>Apply (Enter)</Button>
    </div>
  )
}

export function Timeline() {
  const tracks = useVideoEditorStore((s) => s.tracks)
  const selection = useVideoEditorStore((s) => s.selection)
  const select = useVideoEditorStore((s) => s.select)
  const playhead = useVideoEditorStore((s) => s.playhead)
  const setPlayhead = useVideoEditorStore((s) => s.setPlayhead)
  const moveClip = useVideoEditorStore((s) => s.moveClip)
  const addClip = useVideoEditorStore((s) => s.addClip)
  const updateClip = useVideoEditorStore((s) => s.updateClip)
  const previewClip = useVideoEditorStore((s) => s.previewClip)
  const removeClip = useVideoEditorStore((s) => s.removeClip)
  const splitClipAt = useVideoEditorStore((s) => s.splitClipAt)
  const duplicateClip = useVideoEditorStore((s) => s.duplicateClip)
  const toggleMute = useVideoEditorStore((s) => s.toggleMute)
  const addTrack = useVideoEditorStore((s) => s.addTrack)
  const removeTrack = useVideoEditorStore((s) => s.removeTrack)
  const undo = useVideoEditorStore((s) => s.undo)
  const redo = useVideoEditorStore((s) => s.redo)
  const canUndo = useVideoEditorStore((s) => s.undoStack.length > 0)
  const canRedo = useVideoEditorStore((s) => s.redoStack.length > 0)
  const duration = useVideoEditorStore((s) => s.duration())
  const pps = useVideoEditorUiStore((s) => s.pixelsPerSecond)
  const setPps = useVideoEditorUiStore((s) => s.setPixelsPerSecond)
  const activeTrackId = useVideoEditorUiStore((s) => s.activeTrackId)
  const setActiveTrack = useVideoEditorUiStore((s) => s.setActiveTrack)

  const railRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: string; mode: 'move' | 'trim-left' | 'trim-right'; startX: number; clip: VideoClip } | null>(null)
  const [dragPreview, setDragPreview] = useState<{ start: number; duration: number; trimIn: number } | null>(null)
  const [manualHeight, setManualHeight] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)
  const resizeStart = useRef<{ y: number; height: number } | null>(null)

  // Double-click precision-trim mode: a local draft (start/duration/trimIn) for exactly one clip, live
  // mirrored into the store via previewClip() (no history entry) so the preview canvas and playback stay
  // in sync while dragging, and only committed as one real, undoable change on Apply.
  const [trim, setTrim] = useState<TrimSession | null>(null)
  const trimHandleDrag = useRef<{ side: 'in' | 'out'; startX: number; base: TrimValues } | null>(null)

  const totalWidth = Math.max(600, (duration + 10) * pps)
  const selectedClip = selection.length === 1 ? tracks.flatMap((t) => t.clips).find((c) => c.id === selection[0]) : undefined

  function enterTrimMode(clip: VideoClip) {
    if ((clip.kind !== 'video' && clip.kind !== 'audio') || clip.locked) return
    // Switching clips mid-trim: discard the previous clip's uncommitted draft (restore its real values
    // via previewClip) before opening a session for the new one — Video 1's edits must never leak into
    // Video 2 just because the user double-clicked away without hitting Apply/Cancel.
    if (trim && trim.id !== clip.id) previewClip(trim.id, trim.original)
    select([clip.id])
    const original: TrimValues = { start: clip.start, duration: clip.duration, trimIn: clip.trimIn }
    setTrim({ id: clip.id, kind: clip.kind, sourceDuration: clip.sourceDuration, original, draft: original })
  }

  function setTrimDraft(next: TrimValues) {
    if (!trim) return
    previewClip(trim.id, next)
    setTrim({ ...trim, draft: next })
  }

  function cancelTrim() {
    if (trim) previewClip(trim.id, trim.original)
    setTrim(null)
    trimHandleDrag.current = null
  }

  function resetTrim() {
    if (!trim) return
    previewClip(trim.id, trim.original)
    setTrim({ ...trim, draft: trim.original })
  }

  function applyTrim() {
    if (!trim) return
    updateClip(trim.id, trim.draft)
    ensurePlayheadWithin(trim.draft.start, trim.draft.duration)
    setTrim(null)
    trimHandleDrag.current = null
  }

  useEffect(() => {
    if (!trim) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelTrim()
      else if (e.key === 'Enter') applyTrim()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trim])

  function startTrimHandleDrag(e: ReactPointerEvent<HTMLElement>, side: 'in' | 'out') {
    if (!trim) return
    e.stopPropagation()
    e.preventDefault()
    trimHandleDrag.current = { side, startX: e.clientX, base: trim.draft }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onTrimHandleMove(e: ReactPointerEvent<HTMLElement>) {
    const hd = trimHandleDrag.current
    if (!hd || !trim) return
    const dx = (e.clientX - hd.startX) / pps
    if (hd.side === 'in') {
      const maxShrink = hd.base.duration - MIN_DURATION
      const minClamp = Math.max(-hd.base.start, -hd.base.trimIn)
      const clamped = Math.max(minClamp, Math.min(maxShrink, dx))
      setTrimDraft({ start: round2(hd.base.start + clamped), duration: round2(hd.base.duration - clamped), trimIn: round2(hd.base.trimIn + clamped) })
    } else {
      const maxDuration = trim.sourceDuration != null ? Math.max(MIN_DURATION, trim.sourceDuration - hd.base.trimIn) : Infinity
      const duration = Math.min(maxDuration, Math.max(MIN_DURATION, hd.base.duration + dx))
      setTrimDraft({ ...hd.base, duration: round2(duration) })
    }
  }

  function endTrimHandleDrag() {
    trimHandleDrag.current = null
  }

  // Fit the timeline to its actual content (toolbar + ruler + however many track rows exist) instead of
  // reserving a fixed slice of the viewport — a fixed vh-based height starves the preview's vertical
  // space for tall (9:16) canvases even when the timeline only has one or two tracks in it. The user can
  // still drag the top edge to override this (manualHeight), e.g. to see more rows at once.
  const TOOLBAR_H = 48
  const RULER_H = 24
  const TRACK_ROW_H = 52
  const MIN_HEIGHT = 140
  const MAX_HEIGHT = 560
  const visibleRows = Math.max(1, tracks.length)
  const autoHeight = Math.min(360, Math.max(MIN_HEIGHT, TOOLBAR_H + RULER_H + visibleRows * TRACK_ROW_H + 8))
  const timelineHeight = manualHeight ?? autoHeight

  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    resizeStart.current = { y: e.clientY, height: timelineHeight }
    setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!resizeStart.current) return
    const dy = resizeStart.current.y - e.clientY
    setManualHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStart.current.height + dy)))
  }
  function endResize() {
    resizeStart.current = null
    setResizing(false)
  }

  function timeAt(clientX: number) {
    const rail = railRef.current
    if (!rail) return 0
    const x = clientX - rail.getBoundingClientRect().left + rail.scrollLeft
    return Math.max(0, x / pps)
  }

  function seekFromClick(e: ReactPointerEvent<HTMLDivElement>) {
    setPlayhead(timeAt(e.clientX))
  }

  /** Reuses the existing text track if there is one (never creates duplicate empty text tracks), and —
   * crucially — actually inserts a text CLIP at the playhead. Before this, "+ Text track" only created
   * an empty track with nothing on it, which is why nothing could ever be typed or shown: there was no
   * clip for the properties panel or preview to find. */
  function addTextClip() {
    const existing = tracks.find((t) => t.kind === 'text')
    const trackId = existing?.id ?? addTrack('text')
    setActiveTrack(trackId)
    const start = Math.max(0, playhead)
    const id = addClip(trackId, {
      kind: 'text',
      start,
      duration: 5,
      trimIn: 0,
      volume: 0,
      text: 'Type something...',
      fontSize: 48,
      color: '#ffffff',
      textAlign: 'center',
      opacity: 1,
      x: 0.5,
      y: 0.85,
      bold: false,
      italic: false,
    })
    select([id])
  }

  /** Keeps the preview showing something after a select/trim, instead of silently landing outside the clip. */
  function ensurePlayheadWithin(start: number, duration: number) {
    const s = useVideoEditorStore.getState()
    if (s.playhead < start || s.playhead >= start + duration) setPlayhead(start)
  }

  function startDrag(e: ReactPointerEvent<HTMLElement>, clip: VideoClip, mode: 'move' | 'trim-left' | 'trim-right') {
    e.stopPropagation()
    e.preventDefault()
    select([clip.id])
    if (clip.locked) return
    ensurePlayheadWithin(clip.start, clip.duration)
    setDrag({ id: clip.id, mode, startX: e.clientX, clip })
    setDragPreview({ start: clip.start, duration: clip.duration, trimIn: clip.trimIn })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onDragMove(e: ReactPointerEvent<HTMLElement>) {
    if (!drag) return
    const dx = (e.clientX - drag.startX) / pps
    const { clip } = drag
    if (drag.mode === 'move') {
      setDragPreview({ start: Math.max(0, clip.start + dx), duration: clip.duration, trimIn: clip.trimIn })
    } else if (drag.mode === 'trim-right') {
      // Can't extend past the end of the source media, if known (images/text have none, so grow freely).
      const maxDuration = clip.sourceDuration != null ? Math.max(MIN_DURATION, clip.sourceDuration - clip.trimIn) : Infinity
      const duration = Math.min(maxDuration, Math.max(MIN_DURATION, clip.duration + dx))
      setDragPreview({ start: clip.start, duration, trimIn: clip.trimIn })
    } else {
      const maxShrink = clip.duration - MIN_DURATION
      // Can't move the clip's timeline start before 0, and can't pull trimIn below 0 (start of the source).
      const minClamp = Math.max(-clip.start, -clip.trimIn)
      const clamped = Math.max(minClamp, Math.min(maxShrink, dx))
      setDragPreview({
        start: clip.start + clamped,
        duration: clip.duration - clamped,
        trimIn: clip.trimIn + clamped,
      })
    }
  }

  function endDrag() {
    if (!drag || !dragPreview) {
      setDrag(null)
      setDragPreview(null)
      return
    }
    const start = Math.round(dragPreview.start * 100) / 100
    const duration = Math.round(dragPreview.duration * 100) / 100
    if (drag.mode === 'move') moveClip(drag.id, start)
    else updateClip(drag.id, { start, duration, trimIn: Math.round(dragPreview.trimIn * 100) / 100 })
    ensurePlayheadWithin(start, duration)
    setDrag(null)
    setDragPreview(null)
  }

  return (
    <div className="video-timeline" style={{ height: timelineHeight }}>
      <div
        className={`video-timeline__resize-handle ${resizing ? 'is-active' : ''}`}
        onPointerDown={startResize}
        onPointerMove={onResizeMove}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        title="Drag to resize the timeline"
      />
      <div className="video-timeline__head">
        <IconButton icon="undo" label="Undo" disabled={!canUndo} onClick={undo} />
        <IconButton icon="redo" label="Redo" disabled={!canRedo} onClick={redo} />
        <IconButton icon="scissors" label="Split clip at playhead" disabled={!selection.length} onClick={() => selection.forEach((id) => splitClipAt(id, playhead))} />
        <IconButton icon="copy" label="Duplicate clip" disabled={selection.length !== 1} onClick={() => selection.forEach((id) => duplicateClip(id))} />
        <IconButton icon="audio" label="Mute/unmute clip" disabled={selection.length !== 1} active={!!selectedClip?.muted} onClick={() => selection.forEach((id) => toggleMute(id))} />
        <IconButton icon="trash" label="Delete selected clip" disabled={!selection.length} onClick={() => selection.forEach((id) => removeClip(id))} />
        <span className="video-timeline__time">{fmt(playhead)} / {fmt(duration)}</span>
        <span style={{ flex: 1 }} />
        <IconButton icon="zoomOut" label="Zoom out" onClick={() => setPps(pps - 20)} />
        <IconButton icon="zoomIn" label="Zoom in" onClick={() => setPps(pps + 20)} />
        <Button size="sm" icon="plus" onClick={() => setActiveTrack(addTrack('video'))}>Video track</Button>
        <Button size="sm" icon="plus" onClick={() => setActiveTrack(addTrack('audio'))}>Audio track</Button>
        <Button size="sm" icon="plus" onClick={addTextClip}>Text track</Button>
      </div>
      {trim && (
        <TrimToolbar session={trim} onDraft={setTrimDraft} onReset={resetTrim} onCancel={cancelTrim} onApply={applyTrim} />
      )}
      <div className="video-timeline__rail" ref={railRef}>
        <div className="video-timeline__ruler" style={{ width: totalWidth }} onPointerDown={seekFromClick}>
          {Array.from({ length: Math.ceil(totalWidth / pps) + 1 }, (_, i) => (
            <span key={i} className="video-timeline__tick" style={{ left: i * pps }}>{fmt(i)}</span>
          ))}
        </div>
        <div className="video-timeline__tracks" style={{ width: totalWidth }} onPointerDown={seekFromClick}>
          {tracks.length === 0 && <p className="field__hint" style={{ padding: 16 }}>Add a track, or click an upload to start one.</p>}
          {tracks.map((track) => (
            <div key={track.id} className={`video-track ${activeTrackId === track.id ? 'is-active' : ''}`}>
              {/* Lane renders first and spans the full un-offset coordinate space, so clip.start * pps lines
                  up exactly with the ruler and playhead above/below it. The label is a sticky overlay on top
                  of the lane (not a flex sibling that would push the lane's own origin to the right) — a flex
                  sibling here previously caused clips to render ~110px right of where the ruler/playhead said
                  they were. */}
              <div className="video-track__lane" style={{ width: totalWidth }}>
                {track.clips.map((clip) => {
                  const inTrimMode = trim?.id === clip.id
                  const live = inTrimMode ? trim.draft : drag?.id === clip.id && dragPreview ? dragPreview : clip
                  const widthPx = Math.max(10, live.duration * pps)
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      className={`video-clip video-clip--${clip.kind} ${selection.includes(clip.id) ? 'is-selected' : ''} ${clip.hidden ? 'is-hidden-layer' : ''} ${clip.locked ? 'is-locked-layer' : ''} ${inTrimMode ? 'is-trimming' : ''}`}
                      style={{ left: live.start * pps, width: widthPx }}
                      onPointerDown={(e) => { if (!inTrimMode) startDrag(e, clip, 'move') }}
                      onPointerMove={inTrimMode ? undefined : onDragMove}
                      onPointerUp={inTrimMode ? undefined : endDrag}
                      onPointerCancel={inTrimMode ? undefined : endDrag}
                      onDoubleClick={(e) => { e.stopPropagation(); enterTrimMode(clip) }}
                    >
                      {clip.kind === 'video' && clip.assetUrl && (
                        <VideoThumbnails assetUrl={clip.assetUrl} trimIn={live.trimIn} duration={live.duration} widthPx={widthPx} />
                      )}
                      {clip.kind === 'audio' && clip.assetUrl && (
                        <AudioWaveform assetUrl={clip.assetUrl} trimIn={live.trimIn} duration={live.duration} sourceDuration={clip.sourceDuration} />
                      )}
                      <span
                        className="video-clip__handle video-clip__handle--left"
                        onPointerDown={(e) => (inTrimMode ? startTrimHandleDrag(e, 'in') : startDrag(e, clip, 'trim-left'))}
                        onPointerMove={inTrimMode ? onTrimHandleMove : onDragMove}
                        onPointerUp={inTrimMode ? endTrimHandleDrag : endDrag}
                        onPointerCancel={inTrimMode ? endTrimHandleDrag : endDrag}
                      />
                      <span className="video-clip__label">{clip.kind === 'text' ? (clip.text || 'Text') : clip.assetUrl?.split('/').pop()}</span>
                      <span
                        className="video-clip__handle video-clip__handle--right"
                        onPointerDown={(e) => (inTrimMode ? startTrimHandleDrag(e, 'out') : startDrag(e, clip, 'trim-right'))}
                        onPointerMove={inTrimMode ? onTrimHandleMove : onDragMove}
                        onPointerUp={inTrimMode ? endTrimHandleDrag : endDrag}
                        onPointerCancel={inTrimMode ? endTrimHandleDrag : endDrag}
                      />
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="video-track__label"
                title="Click to make this the target for new media"
                onClick={() => setActiveTrack(track.id)}
              >
                <span>{track.name}</span>
                <span
                  className="video-track__remove"
                  role="button"
                  tabIndex={0}
                  title="Remove track"
                  aria-label={`Remove ${track.name}`}
                  onClick={(e) => { e.stopPropagation(); removeTrack(track.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); removeTrack(track.id) } }}
                >
                  <Icon name="close" size={12} />
                </span>
              </button>
            </div>
          ))}
        </div>
        <div className="video-timeline__playhead" style={{ left: playhead * pps }}>
          <Icon name="chevronDown" size={14} />
        </div>
      </div>
    </div>
  )
}
