import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static') as string | null

export interface ExportClip {
  id: string
  kind: 'video' | 'image' | 'audio' | 'text'
  start: number
  duration: number
  trimIn: number
  assetUrl?: string
  volume: number
  muted?: boolean
  hidden?: boolean
  locked?: boolean
  text?: string
  fontSize?: number
  fontFamily?: string
  color?: string
  bold?: boolean
  italic?: boolean
  textAlign?: 'left' | 'center' | 'right'
  highlightColor?: string
  letterSpacing?: number
  lineHeight?: number
  opacity?: number
  x?: number
  y?: number
}

export interface ExportTrack {
  kind: 'video' | 'audio' | 'text'
  muted: boolean
  hidden: boolean
  clips: ExportClip[]
}

export interface ExportInput {
  width: number
  height: number
  fps: number
  tracks: ExportTrack[]
}

export interface ExportJob {
  status: 'queued' | 'rendering' | 'done' | 'error'
  progress: number
  error?: string
  outputPath?: string
}

const jobs = new Map<string, ExportJob>()
const MAX_DURATION_SECONDS = 600

export function getExportJob(jobId: string): ExportJob | undefined {
  return jobs.get(jobId)
}

function projectDuration(input: ExportInput): number {
  return input.tracks.reduce((max, t) => Math.max(max, ...t.clips.map((c) => c.start + c.duration), 0), 0)
}

/** Replicates the editor preview's "first clip covering this instant" rule so export matches what was seen. */
function segmentsForTrack(clips: ExportClip[], duration: number): { start: number; end: number; clip: ExportClip | null }[] {
  const bounds = new Set<number>([0, duration])
  for (const c of clips) {
    bounds.add(Math.max(0, Math.min(duration, c.start)))
    bounds.add(Math.max(0, Math.min(duration, c.start + c.duration)))
  }
  const sorted = [...bounds].sort((a, b) => a - b)
  const raw: { start: number; end: number; clip: ExportClip | null }[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i]!
    const end = sorted[i + 1]!
    if (end - start < 0.01) continue
    const mid = (start + end) / 2
    const clip = clips.find((c) => mid >= c.start && mid < c.start + c.duration) ?? null
    raw.push({ start, end, clip })
  }
  const merged: typeof raw = []
  for (const seg of raw) {
    const last = merged[merged.length - 1]
    if (last && last.clip?.id === seg.clip?.id) last.end = seg.end
    else merged.push({ ...seg })
  }
  return merged
}

// Must stay in sync with the font ids offered in packages/frontend/src/models/textFonts.ts — otherwise
// a font chosen in the editor silently falls back to the default in the exported video.
const FONT_DIR = process.env.EXPORT_FONT_DIR ?? 'C:/Windows/Fonts'
const FONT_TABLE: Record<string, { regular: string; bold?: string; italic?: string; boldItalic?: string }> = {
  arial: { regular: 'arial.ttf', bold: 'arialbd.ttf', italic: 'ariali.ttf', boldItalic: 'arialbi.ttf' },
  georgia: { regular: 'georgia.ttf', bold: 'georgiab.ttf', italic: 'georgiai.ttf', boldItalic: 'georgiaz.ttf' },
  times: { regular: 'times.ttf', bold: 'timesbd.ttf', italic: 'timesi.ttf', boldItalic: 'timesbi.ttf' },
  courier: { regular: 'cour.ttf', bold: 'courbd.ttf', italic: 'couri.ttf', boldItalic: 'courbi.ttf' },
  verdana: { regular: 'verdana.ttf', bold: 'verdanab.ttf', italic: 'verdanai.ttf', boldItalic: 'verdanaz.ttf' },
  comic: { regular: 'comic.ttf', bold: 'comicbd.ttf', italic: 'comici.ttf', boldItalic: 'comicz.ttf' },
  impact: { regular: 'impact.ttf' },
  trebuchet: { regular: 'trebuc.ttf', bold: 'trebucbd.ttf', italic: 'trebucit.ttf', boldItalic: 'trebucbi.ttf' },
}
const fontResolveCache = new Map<string, string | undefined>()

/** Resolves a text clip's requested font/weight/style to an actual installed font file, falling back
 * through bold-italic → bold/italic → regular → the configured default → undefined (no fontfile arg,
 * ffmpeg's own default) as each more-specific file turns out to be missing on this server. */
function resolveFontFile(familyId: string | undefined, bold: boolean, italic: boolean): string | undefined {
  const key = `${familyId ?? 'arial'}|${bold}|${italic}`
  if (fontResolveCache.has(key)) return fontResolveCache.get(key)
  const entry = FONT_TABLE[familyId ?? 'arial'] ?? FONT_TABLE.arial!
  const candidates = [
    bold && italic ? entry.boldItalic : undefined,
    bold ? entry.bold : undefined,
    italic ? entry.italic : undefined,
    entry.regular,
  ].filter((f): f is string => !!f)
  let resolved: string | undefined
  for (const file of candidates) {
    const full = path.join(FONT_DIR, file)
    if (existsSync(full)) { resolved = full; break }
  }
  if (!resolved) {
    const fallback = process.env.EXPORT_FONT_FILE ?? path.join(FONT_DIR, 'arial.ttf')
    if (existsSync(fallback)) resolved = fallback
  }
  fontResolveCache.set(key, resolved)
  return resolved
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/\r?\n/g, ' ')
}

function run(bin: string, args: string[], onProgress?: (frac: number) => void, totalSeconds = 1): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args)
    let stderr = ''
    child.stdout.on('data', (buf: Buffer) => {
      const text = buf.toString()
      const match = text.match(/out_time_ms=(\d+)/)
      if (match && onProgress) onProgress(Math.min(1, Number(match[1]) / 1e6 / totalSeconds))
    })
    child.stderr.on('data', (buf: Buffer) => { stderr += buf.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`))
    })
  })
}

const audioStreamCache = new Map<string, Promise<boolean>>()

/** Whether a source file has an audio stream. A clip from a video with no audio track (e.g. a silent
 * screen recording) must not try to reference a [N:a] stream in the filter graph — that fails the
 * entire export ("matches no streams"), not just that one clip's audio. No ffprobe binary is bundled,
 * so this probes with plain ffmpeg (which still prints stream info to stderr before erroring on the
 * missing output). */
function probeHasAudio(ffmpegBin: string, filePath: string): Promise<boolean> {
  const cached = audioStreamCache.get(filePath)
  if (cached) return cached
  const promise = new Promise<boolean>((resolve) => {
    const child = spawn(ffmpegBin, ['-i', filePath, '-hide_banner'])
    let stderr = ''
    child.stderr.on('data', (buf: Buffer) => { stderr += buf.toString() })
    child.on('error', () => resolve(false))
    child.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(stderr)))
  })
  audioStreamCache.set(filePath, promise)
  return promise
}

async function renderVideoProject(
  outputPath: string,
  input: ExportInput,
  resolveAssetPath: (url: string) => string,
  onProgress: (frac: number) => void,
) {
  if (!ffmpegPath) throw new Error('The ffmpeg binary could not be located on this server.')
  const { width, height, fps } = input
  const duration = projectDuration(input)
  if (duration <= 0) throw new Error('Add at least one clip to the timeline before exporting.')
  if (duration > MAX_DURATION_SECONDS) throw new Error(`Videos longer than ${MAX_DURATION_SECONDS / 60} minutes are not supported yet.`)

  const videoTracks = input.tracks.filter((t) => t.kind === 'video' && !t.hidden)

  const args: string[] = []
  const audioLabels: string[] = []
  let inputIndex = 0
  const filters: string[] = []

  // Bottom layer: the first video track, concatenated across its full duration (gaps filled with black).
  const baseTrack = videoTracks[0]
  const baseSegments = baseTrack ? segmentsForTrack(baseTrack.clips.filter((c) => !c.hidden), duration) : [{ start: 0, end: duration, clip: null }]
  const baseLabels: string[] = []
  for (const seg of baseSegments) {
    const segDuration = Math.max(0.05, seg.end - seg.start)
    const label = `v${inputIndex}`
    if (!seg.clip) {
      args.push('-f', 'lavfi', '-t', segDuration.toFixed(3), '-i', `color=c=black:s=${width}x${height}:r=${fps}`)
      filters.push(`[${inputIndex}:v]fps=${fps},format=yuv420p[${label}]`)
    } else if (seg.clip.kind === 'image') {
      args.push('-loop', '1', '-t', segDuration.toFixed(3), '-i', resolveAssetPath(seg.clip.assetUrl ?? ''))
      filters.push(`[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[${label}]`)
    } else {
      const trimIn = seg.clip.trimIn + (seg.start - seg.clip.start)
      args.push('-ss', trimIn.toFixed(3), '-t', segDuration.toFixed(3), '-i', resolveAssetPath(seg.clip.assetUrl ?? ''))
      filters.push(`[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p[${label}]`)
      if (!baseTrack?.muted && !seg.clip.muted && seg.clip.volume > 0 && await probeHasAudio(ffmpegPath, resolveAssetPath(seg.clip.assetUrl ?? ''))) {
        const alabel = `a${inputIndex}`
        const delayMs = Math.round(seg.start * 1000)
        filters.push(`[${inputIndex}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${seg.clip.volume}[${alabel}]`)
        audioLabels.push(alabel)
      }
    }
    baseLabels.push(`[${label}]`)
    inputIndex++
  }
  filters.push(`${baseLabels.join('')}concat=n=${baseLabels.length}:v=1:a=0[layer0]`)
  let compositeOut = 'layer0'

  // Additional video tracks stack on top, each clip only visible during its own time window (overlay's `enable`),
  // so gaps on an upper track let the layer beneath show through instead of going black.
  for (let trackIdx = 1; trackIdx < videoTracks.length; trackIdx++) {
    const track = videoTracks[trackIdx]!
    for (const clip of track.clips) {
      if (clip.hidden) continue
      const segDuration = Math.max(0.05, clip.duration)
      const label = `v${inputIndex}`
      if (clip.kind === 'image') {
        args.push('-loop', '1', '-t', segDuration.toFixed(3), '-i', resolveAssetPath(clip.assetUrl ?? ''))
      } else if (clip.kind === 'video') {
        args.push('-ss', clip.trimIn.toFixed(3), '-t', segDuration.toFixed(3), '-i', resolveAssetPath(clip.assetUrl ?? ''))
        if (!track.muted && !clip.muted && clip.volume > 0 && await probeHasAudio(ffmpegPath, resolveAssetPath(clip.assetUrl ?? ''))) {
          const alabel = `a${inputIndex}`
          const delayMs = Math.round(clip.start * 1000)
          filters.push(`[${inputIndex}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${clip.volume}[${alabel}]`)
          audioLabels.push(alabel)
        }
      } else {
        continue
      }
      filters.push(`[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps},format=yuv420p,setpts=PTS+${clip.start}/TB[${label}]`)
      const next = `layer${trackIdx}_${inputIndex}`
      filters.push(`[${compositeOut}][${label}]overlay=enable='between(t,${clip.start},${clip.start + clip.duration})'[${next}]`)
      compositeOut = next
      inputIndex++
    }
  }

  for (const track of input.tracks) {
    if (track.kind !== 'audio' || track.muted) continue
    for (const clip of track.clips) {
      if (clip.hidden || clip.volume <= 0 || clip.muted || !clip.assetUrl) continue
      args.push('-ss', clip.trimIn.toFixed(3), '-t', clip.duration.toFixed(3), '-i', resolveAssetPath(clip.assetUrl))
      const alabel = `a${inputIndex}`
      const delayMs = Math.round(clip.start * 1000)
      filters.push(`[${inputIndex}:a]asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs},volume=${clip.volume}[${alabel}]`)
      audioLabels.push(alabel)
      inputIndex++
    }
  }

  let videoOut = compositeOut
  let textIndex = 0
  for (const track of input.tracks) {
    if (track.kind !== 'text' || track.hidden) continue
    for (const clip of track.clips) {
      if (clip.hidden || !clip.text?.trim()) continue
      const next = `txt${textIndex++}`
      const fontFile = resolveFontFile(clip.fontFamily, !!clip.bold, !!clip.italic)
      // ffmpeg's filtergraph parser treats backslash as its own escape character, so a raw Windows path
      // from path.join() (C:\Windows\Fonts\...) gets silently mangled — \W, \F, \i etc. are consumed as
      // escape sequences and the backslashes vanish, leaving an invalid concatenated path. ffmpeg accepts
      // forward slashes in Windows paths just fine, so normalize to those before escaping the colon.
      const fontArg = fontFile ? `fontfile='${fontFile.replace(/\\/g, '/').replace(/:/g, '\\:')}':` : ''
      const colorHex = (clip.color ?? '#ffffff').replace('#', '0x')
      const opacity = Math.max(0, Math.min(1, clip.opacity ?? 1))
      // x/y are the editor's fractional center point of the text, same coordinate the preview uses —
      // drawtext positions by the box's top-left, so offset by half the rendered text size to match.
      const cx = Math.max(0, Math.min(1, clip.x ?? 0.5))
      const cy = Math.max(0, Math.min(1, clip.y ?? 0.85))
      // Real bold/italic font files are used above when available (resolveFontFile). If the requested
      // weight/style has no matching file on this server, fall back to a thin matching-color border as
      // an honest approximation of bold rather than silently ignoring it — italic has no such fallback.
      const boldFallback = clip.bold && !fontFile?.toLowerCase().includes('bd') && !fontFile?.toLowerCase().includes('bold')
      const boldArg = boldFallback ? `:borderw=2:bordercolor=${colorHex}@${opacity.toFixed(2)}` : ''
      const fontSize = Math.round(clip.fontSize ?? 48)
      const highlightArg =
        clip.highlightColor && clip.highlightColor !== 'transparent'
          ? `:box=1:boxcolor=${clip.highlightColor.replace('#', '0x')}@${opacity.toFixed(2)}:boxborderw=6`
          : ''
      // drawtext has no letter-spacing knob; line_spacing is its closest analogue to our lineHeight
      // multiplier, applied as extra pixels inserted between wrapped/explicit lines.
      const lineSpacingArg = clip.lineHeight != null ? `:line_spacing=${Math.round((clip.lineHeight - 1) * fontSize)}` : ''
      filters.push(
        `[${videoOut}]drawtext=${fontArg}text='${escapeDrawtext(clip.text)}':fontsize=${fontSize}:fontcolor=${colorHex}@${opacity.toFixed(2)}${boldArg}${highlightArg}${lineSpacingArg}:x=(w*${cx.toFixed(4)})-text_w/2:y=(h*${cy.toFixed(4)})-text_h/2:enable='between(t,${clip.start},${clip.start + clip.duration})'[${next}]`,
      )
      videoOut = next
    }
  }

  if (audioLabels.length === 0) {
    args.push('-f', 'lavfi', '-t', duration.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100')
    filters.push(`[${inputIndex}:a]anull[outa]`)
    inputIndex++
  } else if (audioLabels.length === 1) {
    filters.push(`[${audioLabels[0]}]anull[outa]`)
  } else {
    filters.push(`${audioLabels.map((l) => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0[outa]`)
  }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', `[${videoOut}]`,
    '-map', '[outa]',
    '-t', duration.toFixed(3),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    '-y', outputPath,
  )

  await run(ffmpegPath, args, onProgress, duration)
}

export function startExportJob(input: ExportInput, resolveAssetPath: (url: string) => string): string {
  const jobId = randomBytes(12).toString('hex')
  jobs.set(jobId, { status: 'queued', progress: 0 })
  const tmpDir = path.join(os.tmpdir(), 'designhub-video-export')
  const outputPath = path.join(tmpDir, `${jobId}.mp4`)
  void (async () => {
    try {
      await mkdir(tmpDir, { recursive: true })
      jobs.set(jobId, { status: 'rendering', progress: 0 })
      await renderVideoProject(outputPath, input, resolveAssetPath, (progress) => {
        jobs.set(jobId, { status: 'rendering', progress })
      })
      jobs.set(jobId, { status: 'done', progress: 1, outputPath })
    } catch (error) {
      jobs.set(jobId, { status: 'error', progress: 0, error: (error as Error).message })
    }
  })()
  return jobId
}

export async function readExportOutput(jobId: string): Promise<Buffer> {
  const job = jobs.get(jobId)
  if (!job?.outputPath) throw new Error('Export output not found.')
  return readFile(job.outputPath)
}

export async function cleanupExportJob(jobId: string) {
  const job = jobs.get(jobId)
  if (job?.outputPath) await unlink(job.outputPath).catch(() => undefined)
  jobs.delete(jobId)
}
