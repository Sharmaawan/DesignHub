export interface VideoClip {
  id: string
  kind: 'video' | 'image' | 'audio' | 'text'
  /** Seconds, where this clip starts on the timeline. */
  start: number
  /** Seconds, how long this clip plays on the timeline. */
  duration: number
  /** Seconds into the source media where playback begins (ignored for text). */
  trimIn: number
  /** Full duration of the source media, in seconds (ignored for text). Bounds how far trimIn/duration can go. */
  sourceDuration?: number
  assetUrl?: string
  /** User-assigned layer name (Layers panel "Rename"). Falls back to the asset filename/text when unset. */
  name?: string
  volume: number
  muted?: boolean
  /** Per-layer visibility — distinct from the track-level `hidden` flag; excluded from preview and export. */
  hidden?: boolean
  /** Per-layer lock — blocks move/trim/resize/style edits in the timeline, canvas and inspector. */
  locked?: boolean
  text?: string
  fontSize?: number
  fontFamily?: string
  color?: string
  bold?: boolean
  italic?: boolean
  textAlign?: 'left' | 'center' | 'right'
  /** Background/highlight colour drawn behind the text. Omit or 'transparent' for none. */
  highlightColor?: string
  /** Extra space between letters, in px at the clip's fontSize. */
  letterSpacing?: number
  /** Line height as a multiple of fontSize (e.g. 1.2). */
  lineHeight?: number
  /** 0–1, fraction of the project canvas opacity. */
  opacity?: number
  /** 0–1, fraction of the canvas width/height — the text's center point. Defaults to bottom-center. */
  x?: number
  y?: number
}

export interface VideoTrack {
  id: string
  kind: 'video' | 'audio' | 'text'
  name: string
  locked: boolean
  muted: boolean
  hidden: boolean
  clips: VideoClip[]
}

export interface VideoTimeline {
  tracks: VideoTrack[]
}

export interface VideoProjectSummary {
  id: number
  title: string
  width: number
  height: number
  fps: number
  durationSeconds: number
  createdAt: string
  updatedAt: string
}

export interface VideoProject extends VideoProjectSummary {
  timeline: VideoTimeline
}
