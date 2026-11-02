import { create } from 'zustand'
import type { VideoClip, VideoProject, VideoTrack } from '@/models/video'
import { videoProjectApi } from '@/services/api/videoProjectApi'

const uid = () => Math.random().toString(36).slice(2, 10)
const MAX_HISTORY = 50

function trackEnd(track: VideoTrack): number {
  return track.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0)
}

interface VideoEditorState {
  loaded: boolean
  projectId: number | null
  title: string
  width: number
  height: number
  fps: number
  tracks: VideoTrack[]
  selection: string[]
  playhead: number
  playing: boolean
  saving: boolean
  dirty: boolean
  undoStack: VideoTrack[][]
  redoStack: VideoTrack[][]

  reset: () => void
  load: (project: VideoProject) => void
  setTitle: (title: string) => void
  setCanvasSize: (width: number, height: number) => void
  setPlayhead: (t: number) => void
  setPlaying: (playing: boolean) => void
  select: (ids: string[]) => void
  addTrack: (kind: VideoTrack['kind']) => string
  removeTrack: (id: string) => void
  addClip: (trackId: string, clip: Omit<VideoClip, 'id'>) => string
  updateClip: (id: string, patch: Partial<VideoClip>) => void
  /** Same shape as updateClip, but writes straight to state with no undo-stack entry and no `dirty` flag —
   * for live visual feedback while a drag/trim is in progress (e.g. precision-trim mode). The caller is
   * responsible for a single real updateClip() once the interaction commits (Apply), or restoring the
   * original values via another previewPatch() call on Cancel/Escape. */
  previewClip: (id: string, patch: Partial<VideoClip>) => void
  moveClip: (id: string, start: number, trackId?: string) => void
  splitClipAt: (id: string, time: number) => void
  duplicateClip: (id: string) => void
  toggleMute: (id: string) => void
  removeClip: (id: string) => void
  /** Re-stacks the track that owns `id` relative to other tracks of the same kind, without touching any
   * clip's start/duration — this is what "Layers" reordering, bring-to-front, send-to-back map to, since
   * visual stacking in this editor is a track-order property (see PreviewStage/videoExport), not a per-clip one. */
  reorderLayer: (id: string, to: 'front' | 'back' | 'forward' | 'backward' | number) => void
  undo: () => void
  redo: () => void
  duration: () => number
  save: () => Promise<void>
}

export const useVideoEditorStore = create<VideoEditorState>((set, get) => {
  function projectDuration(tracks: VideoTrack[]): number {
    return tracks.reduce((max, t) => Math.max(max, trackEnd(t)), 0)
  }

  /** Snapshots the current tracks onto the undo stack before a mutating change, and clears redo.
   * Also re-clamps the playhead: removing/trimming clips can shrink the duration below where the
   * playhead currently sits, which otherwise leaves it stranded past the end (e.g. "0:03.2 / 0:00.0"). */
  function withHistory(mutate: (tracks: VideoTrack[]) => VideoTrack[]) {
    const s = get()
    const nextUndo = [...s.undoStack, s.tracks].slice(-MAX_HISTORY)
    const nextTracks = mutate(s.tracks)
    const d = projectDuration(nextTracks)
    set({ tracks: nextTracks, dirty: true, undoStack: nextUndo, redoStack: [], playhead: Math.min(s.playhead, d) })
  }

  return {
    loaded: false,
    projectId: null,
    title: '',
    width: 1080,
    height: 1920,
    fps: 30,
    tracks: [],
    selection: [],
    playhead: 0,
    playing: false,
    saving: false,
    dirty: false,
    undoStack: [],
    redoStack: [],

    reset: () => set({
      loaded: false, projectId: null, title: '', tracks: [], selection: [], playhead: 0, playing: false, saving: false, dirty: false,
      undoStack: [], redoStack: [],
    }),

    load: (project) => set({
      loaded: true,
      projectId: project.id,
      title: project.title,
      width: project.width,
      height: project.height,
      fps: project.fps,
      tracks: project.timeline.tracks,
      selection: [],
      playhead: 0,
      playing: false,
      dirty: false,
      undoStack: [],
      redoStack: [],
    }),

    setTitle: (title) => set({ title, dirty: true }),
    // Canvas size only affects framing/scaling at render time (see PreviewStage's object-fit: contain and
    // the ffmpeg scale+pad export filters) — it never touches clip start/duration/trimIn, so the timeline
    // and all existing clips are untouched by a resize.
    setCanvasSize: (width, height) => set({ width, height, dirty: true }),
    // Clamp to the project's actual duration — the ruler draws fixed-width ticks regardless of content,
    // so without this a click past the last clip (or past an empty timeline) strands the playhead beyond
    // the end, producing an inconsistent "playhead > duration" display.
    setPlayhead: (t) => set((s) => ({ playhead: Math.max(0, Math.min(t, projectDuration(s.tracks))) })),
    setPlaying: (playing) => set({ playing }),
    select: (ids) => set({ selection: ids }),

    addTrack: (kind) => {
      const id = uid()
      const name = kind === 'video' ? `Video ${get().tracks.filter((t) => t.kind === 'video').length + 1}`
        : kind === 'audio' ? `Audio ${get().tracks.filter((t) => t.kind === 'audio').length + 1}`
          : `Text ${get().tracks.filter((t) => t.kind === 'text').length + 1}`
      withHistory((tracks) => [...tracks, { id, kind, name, locked: false, muted: false, hidden: false, clips: [] }])
      return id
    },

    removeTrack: (id) => {
      const track = get().tracks.find((t) => t.id === id)
      if (!track) return
      if (track.clips.length > 0 && !window.confirm(`"${track.name}" has ${track.clips.length} clip(s) on it. Remove the track and all its clips?`)) return
      withHistory((tracks) => tracks.filter((t) => t.id !== id))
      set((s) => ({ selection: s.selection.filter((sid) => !track.clips.some((c) => c.id === sid)) }))
    },

    addClip: (trackId, clip) => {
      const id = uid()
      withHistory((tracks) => tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, { ...clip, id }] } : t)))
      return id
    },

    // A locked clip only accepts a patch that changes its own `locked` flag (i.e. unlocking it) — every
    // other field (position, size, trim, style, text...) is a no-op while locked, per the Layers "Lock" contract.
    updateClip: (id, patch) => {
      const clip = get().tracks.flatMap((t) => t.clips).find((c) => c.id === id)
      if (clip?.locked && !('locked' in patch)) return
      withHistory((tracks) => tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })))
    },

    previewClip: (id, patch) => {
      const clip = get().tracks.flatMap((t) => t.clips).find((c) => c.id === id)
      if (clip?.locked && !('locked' in patch)) return
      set((s) => ({ tracks: s.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) })) }))
    },

    moveClip: (id, start, trackId) => {
      const s = get()
      const sourceTrack = s.tracks.find((t) => t.clips.some((c) => c.id === id))
      const clip = sourceTrack?.clips.find((c) => c.id === id)
      if (!sourceTrack || !clip || clip.locked) return
      const destId = trackId ?? sourceTrack.id
      const moved: VideoClip = { ...clip, start: Math.max(0, start) }
      withHistory((tracks) => tracks.map((t) => {
        if (t.id === sourceTrack.id && t.id !== destId) return { ...t, clips: t.clips.filter((c) => c.id !== id) }
        if (t.id === destId) return { ...t, clips: [...t.clips.filter((c) => c.id !== id), moved] }
        return t
      }))
    },

    splitClipAt: (id, time) => withHistory((tracks) => tracks.map((t) => ({
      ...t,
      clips: t.clips.flatMap((c) => {
        if (c.id !== id || c.locked || time <= c.start || time >= c.start + c.duration) return [c]
        const firstDuration = time - c.start
        const secondDuration = c.duration - firstDuration
        const first: VideoClip = { ...c, duration: firstDuration }
        const second: VideoClip = {
          ...c, id: uid(), start: time, duration: secondDuration,
          trimIn: c.kind === 'text' ? c.trimIn : c.trimIn + firstDuration,
        }
        return [first, second]
      }),
    }))),

    duplicateClip: (id) => {
      const s = get()
      const track = s.tracks.find((t) => t.clips.some((c) => c.id === id))
      const clip = track?.clips.find((c) => c.id === id)
      if (!track || !clip || clip.locked) return
      const end = trackEnd(track)
      const copy: VideoClip = { ...clip, id: uid(), start: Math.max(end, clip.start + clip.duration) }
      withHistory((tracks) => tracks.map((t) => (t.id === track.id ? { ...t, clips: [...t.clips, copy] } : t)))
      set({ selection: [copy.id] })
    },

    toggleMute: (id) => withHistory((tracks) => tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => (c.id === id ? { ...c, muted: !c.muted } : c)),
    }))),

    removeClip: (id) => {
      const clip = get().tracks.flatMap((t) => t.clips).find((c) => c.id === id)
      if (clip?.locked) return
      withHistory((tracks) => tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== id) })))
      set((s) => ({ selection: s.selection.filter((sid) => sid !== id) }))
    },

    reorderLayer: (id, to) => {
      const s = get()
      const track = s.tracks.find((t) => t.clips.some((c) => c.id === id))
      if (!track) return
      const sameKind = s.tracks.filter((t) => t.kind === track.kind)
      const idx = sameKind.indexOf(track)
      let targetIdx = idx
      if (typeof to === 'number') targetIdx = Math.max(0, Math.min(sameKind.length - 1, to))
      else if (to === 'front') targetIdx = sameKind.length - 1
      else if (to === 'back') targetIdx = 0
      else if (to === 'forward') targetIdx = Math.min(sameKind.length - 1, idx + 1)
      else targetIdx = Math.max(0, idx - 1)
      if (targetIdx === idx) return
      const reorderedKind = [...sameKind]
      reorderedKind.splice(idx, 1)
      reorderedKind.splice(targetIdx, 0, track)
      // Splice the reordered same-kind tracks back into their original slots within the full tracks
      // array, so other-kind tracks (e.g. audio sitting between two video tracks) keep their position.
      let cursor = 0
      withHistory((tracks) => tracks.map((t) => (t.kind === track.kind ? reorderedKind[cursor++]! : t)))
    },

    undo: () => {
      const s = get()
      const prev = s.undoStack[s.undoStack.length - 1]
      if (!prev) return
      set({
        tracks: prev,
        undoStack: s.undoStack.slice(0, -1),
        redoStack: [...s.redoStack, s.tracks].slice(-MAX_HISTORY),
        dirty: true,
        playhead: Math.min(s.playhead, projectDuration(prev)),
      })
    },

    redo: () => {
      const s = get()
      const next = s.redoStack[s.redoStack.length - 1]
      if (!next) return
      set({
        tracks: next,
        redoStack: s.redoStack.slice(0, -1),
        undoStack: [...s.undoStack, s.tracks].slice(-MAX_HISTORY),
        dirty: true,
        playhead: Math.min(s.playhead, projectDuration(next)),
      })
    },

    duration: () => projectDuration(get().tracks),

    save: async () => {
      const s = get()
      if (!s.projectId) return
      set({ saving: true })
      try {
        await videoProjectApi.save(s.projectId, {
          title: s.title,
          timeline: { tracks: s.tracks },
          durationSeconds: s.duration(),
          width: s.width,
          height: s.height,
        })
        set({ dirty: false })
      } finally {
        set({ saving: false })
      }
    },
  }
})
