import { useEffect, useRef } from 'react'
import { Group, Image as KImage, Rect } from 'react-konva'
import Konva from 'konva'
import type { ImageData } from '@/models/design'
import { useLoadedImage } from '../hooks'

interface Props {
  data: ImageData
}

export function ImageBody({ data: d }: Props) {
  const img = useLoadedImage(d.src)
  const ref = useRef<Konva.Image>(null)
  const f = d.filters
  const hasFilters = !!f && (f.brightness !== 0 || f.contrast !== 0 || f.saturation !== 0 || f.blur > 0 || f.grayscale)

  // Konva's cache() rasterizes the node to an offscreen canvas — that's the expensive part, and it only
  // needs redoing when the underlying pixels change (image swapped, cropped, resized, or filters turned
  // on/off). It does NOT need redoing when an already-on filter's VALUE changes (dragging the brightness
  // slider, say) — Konva reapplies the active filters to the existing cached bitmap on every draw using
  // whatever the current filter values are. The previous code re-ran the full cache() on every slider
  // tick regardless, which is why adjusting filters on a real (non-tiny) photo — especially with several
  // images selected at once — could feel like it wasn't responding: each tick was paying for a full
  // re-rasterization of every selected image before anything visibly updated.
  useEffect(() => {
    const node = ref.current
    if (!node || !img) return
    if (hasFilters) node.cache({ pixelRatio: Math.min(2, window.devicePixelRatio || 1) })
    else node.clearCache()
    node.getLayer()?.batchDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, hasFilters, d.width, d.height, d.crop?.x, d.crop?.y, d.crop?.width, d.crop?.height])

  useEffect(() => {
    const node = ref.current
    if (!node || !img) return
    if (!hasFilters || !f) {
      node.filters([])
    } else {
      const list: (typeof Konva.Filters.Brighten)[] = []
      if (f.brightness !== 0) list.push(Konva.Filters.Brighten)
      if (f.contrast !== 0) list.push(Konva.Filters.Contrast)
      if (f.saturation !== 0) list.push(Konva.Filters.HSL)
      if (f.blur > 0) list.push(Konva.Filters.Blur)
      if (f.grayscale) list.push(Konva.Filters.Grayscale)
      node.filters(list)
      node.brightness(f.brightness / 100)
      node.contrast(f.contrast)
      node.saturation(f.saturation / 50)
      node.blurRadius(f.blur)
    }
    node.getLayer()?.batchDraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, hasFilters, f?.brightness, f?.contrast, f?.saturation, f?.blur, f?.grayscale])

  const radius = d.cornerRadius ?? 0
  const clip = radius > 0 ? (ctx: Konva.Context) => roundRect(ctx, d.width, d.height, radius) : undefined

  if (!img) return <Rect width={d.width} height={d.height} fill="#E4E2DC" cornerRadius={radius} />
  return (
    <Group clipFunc={clip}>
      <KImage
        ref={ref}
        image={img}
        x={d.flipX ? d.width : 0}
        y={d.flipY ? d.height : 0}
        scaleX={d.flipX ? -1 : 1}
        scaleY={d.flipY ? -1 : 1}
        width={d.width}
        height={d.height}
        crop={d.crop}
      />
      {d.stroke && (d.strokeWidth ?? 0) > 0 && (
        <Rect width={d.width} height={d.height} stroke={d.stroke} strokeWidth={d.strokeWidth} cornerRadius={radius} listening={false} />
      )}
    </Group>
  )
}

export function roundRect(ctx: Konva.Context, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(rr, 0)
  ctx.arcTo(w, 0, w, h, rr)
  ctx.arcTo(w, h, 0, h, rr)
  ctx.arcTo(0, h, 0, 0, rr)
  ctx.arcTo(0, 0, w, 0, rr)
  ctx.closePath()
}
