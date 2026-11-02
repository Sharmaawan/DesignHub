import type { ChartKind, FrameData, ShapeKind } from '@/models/design'
import { contentApi } from '@/services/api/contentApi'
import { apiBase } from '@/services/api/http'
import { loadImage } from '@/services/render/imageCache'
import { selectActiveKit, useBrandStore } from '@/stores/brandStore'
import { useEditorStore } from '@/stores/editorStore'
import { errorMessage, toast } from '@/stores/toastStore'
import { createAudio, createChart, createFrame, createIcon, createImage, createShape, createTable, createText, createVideo, type Origin, type TextPreset } from '@/editor/model/defaults'
import { serializeBackground } from '@/models/design'
import { insertElements, updateElements } from './elementActions'
import { updatePage } from './pageActions'

export type AssetPayload =
  | { kind: 'image'; url: string; width?: number; height?: number; name?: string }
  | { kind: 'video'; url: string; width?: number; height?: number; duration?: number }
  | { kind: 'audio'; url: string; title: string }
  | { kind: 'shape'; shape: ShapeKind }
  | { kind: 'text'; preset: TextPreset }
  | { kind: 'icon'; svg: string; name: string }
  | { kind: 'chart'; chart: ChartKind }
  | { kind: 'table' }
  | { kind: 'frame'; frame: FrameData['frame'] }

export const DRAG_MIME = 'application/x-designhub'

const store = () => useEditorStore.getState()

function origin(point?: { x: number; y: number }): Origin {
  const s = store()
  return point ? { cx: point.x, cy: point.y } : { cx: s.width / 2, cy: s.height / 2 }
}

function palette(): string[] {
  const kit = selectActiveKit(useBrandStore.getState())
  const colors = kit?.colors.map((c) => c.hex) ?? []
  return colors.length >= 3 ? colors : ['#FF5A36', '#FFB547', '#151515', '#0C8A6A', '#E0A100', '#B833E0']
}

function isOurs(url: string) {
  return url.startsWith(apiBase) || url.startsWith('data:') || url.startsWith('blob:')
}

/** External pictures are copied into our own storage so exports are never blocked by another site's CORS rules. */
async function hostImage(url: string, name?: string): Promise<{ url: string; width: number; height: number }> {
  if (!isOurs(url)) {
    try {
      const res = await fetch(url, { mode: 'cors' })
      if (res.ok) {
        const blob = await res.blob()
        if (blob.type.startsWith('image/')) {
          const file = await contentApi.upload(blob, name ?? 'photo')
          const img = await loadImage(file.url)
          return { url: file.url, width: file.width ?? img.naturalWidth, height: file.height ?? img.naturalHeight }
        }
      }
    } catch {
      /* fall back to hotlinking below */
    }
  }
  const img = await loadImage(url)
  return { url, width: img.naturalWidth || 800, height: img.naturalHeight || 800 }
}

function frameAt(point?: { x: number; y: number }): string | null {
  if (!point) return null
  const s = store()
  const ids = [...(s.pageElementIds[s.currentPageId] ?? [])].reverse()
  for (const id of ids) {
    const e = s.elements[id]
    if (e?.type === 'frame' && !e.data.hidden && point.x >= e.data.x && point.x <= e.data.x + e.data.width && point.y >= e.data.y && point.y <= e.data.y + e.data.height) return id
  }
  return null
}

export async function insertAsset(payload: AssetPayload, point?: { x: number; y: number }): Promise<void> {
  const o = origin(point)
  const s = store()
  const maxImage = Math.max(s.width, s.height) * 0.6
  switch (payload.kind) {
    case 'shape':
      return insertElements([createShape(o, payload.shape, palette()[0])])
    case 'text':
      return insertElements([createText(o, payload.preset)])
    case 'icon':
      return insertElements([createIcon(o, payload.svg, '#151515', 220, payload.name)])
    case 'chart':
      return insertElements([createChart(o, payload.chart, palette())])
    case 'table':
      return insertElements([createTable(o)])
    case 'frame':
      return insertElements([createFrame(o, payload.frame)])
    case 'audio':
      return insertElements([createAudio(o, payload.url, payload.title)])
    case 'video': {
      const w = payload.width ?? 1280
      const h = payload.height ?? 720
      return insertElements([createVideo(o, payload.url, w, h, payload.duration ?? 0, maxImage)])
    }
    case 'image': {
      const frameId = frameAt(point)
      try {
        const hosted = payload.width && payload.height && isOurs(payload.url) ? { url: payload.url, width: payload.width, height: payload.height } : await hostImage(payload.url, payload.name)
        if (frameId) {
          updateElements([frameId], { src: hosted.url, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 })
          // updateElements (unlike insertElements) has no selection side effect, so without this the
          // frame's image/crop/filter controls never appear after an AI-generated picture fills it —
          // the inspector panel stays on whatever was selected before, or nothing.
          store().select([frameId], { exact: true })
          return
        }
        insertElements([createImage(o, hosted.url, hosted.width, hosted.height, maxImage)])
      } catch (e) {
        toast.error(`That image could not be added. ${errorMessage(e)}`)
      }
    }
  }
}

export async function setPageBackgroundImage(url: string): Promise<void> {
  try {
    const hosted = await hostImage(url)
    updatePage(store().currentPageId, { background: serializeBackground({ type: 'image', src: hosted.url, fit: 'cover' }) })
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function videoMeta(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.onloadedmetadata = () => resolve({ width: v.videoWidth || 1280, height: v.videoHeight || 720, duration: v.duration || 0 })
    v.onerror = () => reject(new Error('The video could not be read'))
    v.src = url
  })
}

/** Uploads local files and drops them on the page according to their type. */
export async function uploadAndInsert(files: File[], point?: { x: number; y: number }): Promise<void> {
  for (const file of files) {
    const toastLabel = file.name.length > 28 ? `${file.name.slice(0, 25)}…` : file.name
    try {
      toast.info(`Uploading ${toastLabel}`)
      const asset = await contentApi.upload(file)
      if (asset.kind === 'image') await insertAsset({ kind: 'image', url: asset.url, width: asset.width, height: asset.height }, point)
      else if (asset.kind === 'video') await insertAsset({ kind: 'video', url: asset.url, ...(await videoMeta(asset.url)) }, point)
      else if (asset.kind === 'audio') await insertAsset({ kind: 'audio', url: asset.url, title: asset.fileName.replace(/\.[^.]+$/, '') }, point)
      else toast.error(`${file.name} was uploaded, but cannot be placed on a page`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
}
