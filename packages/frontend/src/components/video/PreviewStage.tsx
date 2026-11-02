import { useEffect, useRef, useState } from 'react'
import type { VideoClip, VideoTrack } from '@/models/video'
import { useVideoEditorStore } from '@/stores/videoEditorStore'
import { errorMessage, toast } from '@/stores/toastStore'
import { IconButton } from '@/components/ui/Button'
import { CanvasSettings } from './CanvasSettings'
import { textFontCss } from '@/models/textFonts'

function fmt(t: number) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function activeClip(track: VideoTrack, t: number): VideoClip | undefined {
  return track.clips.find((c) => !c.hidden && t >= c.start && t < c.start + c.duration)
}

/**
 * Composites every active video track (stacked bottom-to-top by track order) with text overlays,
 * and plays audio from both video-track clips and dedicated audio tracks, driven by a single rAF
 * clock on the store's playhead.
 *
 * All play()/pause()/src/currentTime commands for a given element go through playOrHold()/syncElement()
 * below — the single source of truth — so no two effects ever race to control the same element.
 */
export function PreviewStage() {
  const width = useVideoEditorStore((s) => s.width)
  const height = useVideoEditorStore((s) => s.height)
  const tracks = useVideoEditorStore((s) => s.tracks)
  const playhead = useVideoEditorStore((s) => s.playhead)
  const playing = useVideoEditorStore((s) => s.playing)
  const duration = useVideoEditorStore((s) => s.duration())
  const hasContent = duration > 0
  const selection = useVideoEditorStore((s) => s.selection)
  const select = useVideoEditorStore((s) => s.select)
  const updateClip = useVideoEditorStore((s) => s.updateClip)

  const stageRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  // The one scale factor mapping project pixels (width x height) to on-screen preview pixels.
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [textDrag, setTextDrag] = useState<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null)
  const [textDragPos, setTextDragPos] = useState<{ x: number; y: number } | null>(null)
  const videoRefs = useRef(new Map<string, HTMLVideoElement>())
  const audioRefs = useRef(new Map<string, HTMLAudioElement>())
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const warnedRef = useRef(new Set<string>())
  /** Clip ids with a play() promise currently in flight — never seek or re-play these until it settles. */
  const pendingPlayRef = useRef(new Set<string>())

  // Every non-hidden video track with an active clip at the playhead, bottom-to-top in track order.
  const videoLayers = tracks.filter((t) => t.kind === 'video' && !t.hidden).flatMap((track) => {
    const c = activeClip(track, playhead)
    return c ? [{ clip: c, track }] : []
  })
  const textClips = tracks.filter((t) => t.kind === 'text' && !t.hidden).flatMap((t) => {
    const c = activeClip(t, playhead)
    return c ? [c] : []
  })
  const audioClips = tracks.filter((t) => t.kind === 'audio' && !t.muted).flatMap((t) => {
    const c = activeClip(t, playhead)
    return c ? [{ clip: c, track: t }] : []
  })

  /** The only place that calls play(). Ignores benign AbortError (interrupted by a normal, expected source/seek change). */
  function playOrHold(id: string, el: HTMLMediaElement) {
    if (!el.paused || pendingPlayRef.current.has(id)) return
    pendingPlayRef.current.add(id)
    el.play()
      .catch((e: Error) => {
        if (e.name === 'AbortError') return // expected: a newer load/seek superseded this request
        if (warnedRef.current.has(id)) return
        warnedRef.current.add(id)
        const message = e.name === 'NotAllowedError'
          ? 'Playback was blocked by the browser. Click Play again.'
          : e.name === 'NotSupportedError'
            ? 'This file could not be played by the browser.'
            : errorMessage(e)
        toast.error(`Could not play: ${message}`)
      })
      .finally(() => {
        pendingPlayRef.current.delete(id)
      })
  }

  /** The only place that sets src/currentTime/volume/muted and decides play vs. pause for one element. */
  function syncElement(id: string, el: HTMLMediaElement, assetUrl: string | undefined, start: number, trimIn: number, volume: number, muted: boolean) {
    const isNewClip = el.src !== assetUrl
    if (isNewClip) {
      el.src = assetUrl ?? ''
      warnedRef.current.delete(id)
    }
    el.muted = muted || volume <= 0
    el.volume = Math.max(0, Math.min(1, volume))
    const target = playhead - start + trimIn
    const pending = pendingPlayRef.current.has(id)
    // Never reassign currentTime while a play() request for this element is still in flight — that alone
    // is what produces "interrupted by a new load request".
    if (!pending) {
      const threshold = playing ? 0.75 : 0.05
      if (isNewClip || Math.abs(el.currentTime - target) > threshold) el.currentTime = target
    }
    if (playing) playOrHold(id, el)
    else if (!el.paused) el.pause()
  }

  // Playback clock: advances playhead with real time, independent of any single media element.
  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }
    const tick = (ts: number) => {
      const s = useVideoEditorStore.getState()
      const dt = lastTsRef.current == null ? 0 : (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      const duration = s.duration()
      const next = s.playhead + dt
      if (duration > 0 && next >= duration) {
        // Clips are active on [start, start+duration) — landing exactly on the end leaves nothing active
        // and the preview goes blank. Hold one frame back so the last frame stays visible, like any video player.
        s.setPlayhead(Math.max(0, duration - 1 / Math.max(1, s.fps)))
        s.setPlaying(false)
        return
      }
      s.setPlayhead(next)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [playing])

  // Keep every active video layer aligned to its clip under the playhead.
  useEffect(() => {
    for (const { clip, track } of videoLayers) {
      if (clip.kind !== 'video') continue
      const el = videoRefs.current.get(clip.id)
      if (!el) continue
      syncElement(clip.id, el, clip.assetUrl, clip.start, clip.trimIn, clip.volume, !!track.muted || !!clip.muted)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoLayers.map((v) => `${v.clip.id}:${v.clip.assetUrl}`).join(','), playhead, playing])

  // Keep active audio-track elements aligned the same way.
  useEffect(() => {
    for (const { clip: c, track } of audioClips) {
      const el = audioRefs.current.get(c.id)
      if (!el) continue
      syncElement(c.id, el, c.assetUrl, c.start, c.trimIn, c.volume, track.muted || !!c.muted)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioClips.map((a) => `${a.clip.id}:${a.clip.assetUrl}`).join(','), playhead, playing])

  // Measure the available viewport so the canvas can be sized to exact pixels at the right aspect
  // ratio — CSS aspect-ratio alone doesn't resolve reliably for a flex/grid item whose only content
  // is absolutely positioned (no intrinsic size), so we compute the scale factor ourselves instead.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => setViewportSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitScale = viewportSize.w > 0 && viewportSize.h > 0
    ? Math.min(viewportSize.w / width, viewportSize.h / height)
    : 0
  // Manual zoom is a multiplier on top of the fit-to-screen scale — it only changes the on-screen
  // preview size, never the project's actual width/height (those stay the single source of truth
  // for export). 1 = fit to screen, which is also the default and the "Fit to Screen" reset target.
  const scale = fitScale * zoom
  const frameW = Math.max(1, Math.round(width * scale))
  const frameH = Math.max(1, Math.round(height * scale))

  return (
    <div className="video-stage" ref={stageRef}>
      <div className="video-stage__toolbar">
        <CanvasSettings />
        <div className="video-zoom">
          <IconButton icon="zoomOut" label="Zoom out" iconSize={14} onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} />
          <button className="video-zoom__value" onClick={() => setZoom(1)} title="Fit to screen">{Math.round(zoom * 100)}%</button>
          <IconButton icon="zoomIn" label="Zoom in" iconSize={14} onClick={() => setZoom((z) => Math.min(4, z + 0.25))} />
        </div>
      </div>
      <div className="video-stage__viewport" ref={viewportRef}>
        <div className={`video-stage__frame ${videoLayers.length === 0 ? 'video-stage__frame--empty' : ''}`} style={{ width: frameW, height: frameH }}>
          {videoLayers.length === 0 && (
            <div className="video-stage__empty">{hasContent ? 'Nothing at the playhead' : 'Add media to start editing'}</div>
          )}
          {videoLayers.map(({ clip }, i) =>
            clip.kind === 'video' ? (
              <video
                key={clip.id}
                ref={(el) => { if (el) videoRefs.current.set(clip.id, el); else videoRefs.current.delete(clip.id) }}
                className="video-stage__media"
                style={{ zIndex: i }}
                playsInline
              />
            ) : (
              <img key={clip.id} className="video-stage__media" style={{ zIndex: i }} src={clip.assetUrl} alt="" />
            ),
          )}
          {textClips.map((c) => {
            const isSelected = selection.length === 1 && selection[0] === c.id
            const isEditing = editingTextId === c.id
            const live = textDrag?.id === c.id && textDragPos ? textDragPos : { x: c.x ?? 0.5, y: c.y ?? 0.85 }
            const commonStyle = {
              left: `${live.x * 100}%`,
              top: `${live.y * 100}%`,
              // Font size is stored in project pixels (also what export's drawtext uses) — scale it down
              // to match the preview's current on-screen size, same as the canvas frame itself, so the
              // text stays visually correct whether the preview is fit-to-screen or zoomed.
              fontSize: Math.max(1, (c.fontSize ?? 48) * scale),
              fontFamily: textFontCss(c.fontFamily),
              color: c.color ?? '#ffffff',
              fontWeight: c.bold ? 700 : 400,
              fontStyle: c.italic ? 'italic' : 'normal',
              textAlign: c.textAlign ?? 'center',
              opacity: c.opacity ?? 1,
              backgroundColor: c.highlightColor && c.highlightColor !== 'transparent' ? c.highlightColor : 'transparent',
              letterSpacing: c.letterSpacing ? `${c.letterSpacing * scale}px` : undefined,
              lineHeight: c.lineHeight ?? 'normal',
            } as const
            if (isEditing) {
              return (
                <textarea
                  key={c.id}
                  autoFocus
                  className="video-stage__text video-stage__text--editing"
                  style={commonStyle}
                  defaultValue={c.text ?? ''}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.currentTarget.blur(); setEditingTextId(null) }
                    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
                  }}
                  onBlur={(e) => {
                    updateClip(c.id, { text: e.target.value })
                    setEditingTextId(null)
                  }}
                />
              )
            }
            return (
              <div
                key={c.id}
                className={`video-stage__text ${isSelected ? 'is-selected' : ''}`}
                style={commonStyle}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  select([c.id])
                  if (c.locked) return
                  setTextDrag({ id: c.id, startClientX: e.clientX, startClientY: e.clientY, startX: live.x, startY: live.y })
                  e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                  if (textDrag?.id !== c.id || frameW <= 0 || frameH <= 0) return
                  const dx = (e.clientX - textDrag.startClientX) / frameW
                  const dy = (e.clientY - textDrag.startClientY) / frameH
                  setTextDragPos({
                    x: Math.max(0, Math.min(1, textDrag.startX + dx)),
                    y: Math.max(0, Math.min(1, textDrag.startY + dy)),
                  })
                }}
                onPointerUp={() => {
                  if (textDrag?.id === c.id && textDragPos) updateClip(c.id, { x: textDragPos.x, y: textDragPos.y })
                  setTextDrag(null)
                  setTextDragPos(null)
                }}
                onDoubleClick={(e) => { e.stopPropagation(); if (!c.locked) setEditingTextId(c.id) }}
              >
                {c.text}
              </div>
            )
          })}
          {audioClips.map(({ clip: c }) => (
            <audio key={c.id} ref={(el) => { if (el) audioRefs.current.set(c.id, el); else audioRefs.current.delete(c.id) }} />
          ))}
        </div>
      </div>
      <div className="video-stage__controls">
        <IconButton
          icon="stop"
          label="Stop"
          disabled={!hasContent}
          onClick={() => {
            useVideoEditorStore.getState().setPlaying(false)
            useVideoEditorStore.getState().setPlayhead(0)
          }}
        />
        <IconButton
          icon={playing ? 'pause' : 'play'}
          label={playing ? 'Pause' : 'Play'}
          disabled={!hasContent}
          onClick={() => {
            const s = useVideoEditorStore.getState()
            const d = s.duration()
            if (!s.playing && d > 0 && s.playhead >= d - 1 / s.fps) s.setPlayhead(0)
            s.setPlaying(!s.playing)
          }}
        />
        <IconButton
          icon="restart"
          label="Restart from the beginning"
          disabled={!hasContent}
          onClick={() => {
            useVideoEditorStore.getState().setPlayhead(0)
            useVideoEditorStore.getState().setPlaying(true)
          }}
        />
        <span className="video-stage__time">{fmt(playhead)} / {fmt(useVideoEditorStore.getState().duration())}</span>
      </div>
    </div>
  )
}
