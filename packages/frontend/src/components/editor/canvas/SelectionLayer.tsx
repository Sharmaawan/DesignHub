import { useEffect, useRef } from 'react'
import { Layer, Line, Rect, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { TextData } from '@/models/design'
import { updateElements } from '@/editor/actions/elementActions'
import { useEditorStore } from '@/stores/editorStore'
import { useToken } from '@/stores/themeStore'
import type { Guides } from './snapping'

interface Props {
  stage: () => Konva.Stage | null
  guides: Guides
  zoom: number
  pageW: number
  pageH: number
  marquee: { x: number; y: number; width: number; height: number } | null
}

const MIN = 8

export function SelectionLayer({ stage, guides, zoom, pageW, pageH, marquee }: Props) {
  const trRef = useRef<Konva.Transformer>(null)
  const selection = useEditorStore((s) => s.selection)
  const elements = useEditorStore((s) => s.elements)
  const anchorRef = useRef<string | null>(null)

  const single = selection.length === 1 ? elements[selection[0]!] : undefined
  const onlyLines = !!single && single.type === 'shape' && (single.data.shape === 'line' || single.data.shape === 'arrow')
  const isText = !!single && single.type === 'text'
  const isImageLike = !!single && (single.type === 'image' || single.type === 'video' || single.type === 'icon' || single.type === 'frame')
  const groupIds = selection.map((id) => elements[id]?.data.groupId)
  const isGrouped = groupIds.length > 1 && groupIds[0] !== undefined && groupIds.every((id) => id === groupIds[0])

  useEffect(() => {
    const tr = trRef.current
    const st = stage()
    if (!tr || !st) return
    const nodes = selection
      .filter((id) => !elements[id]?.data.locked)
      .map((id) => st.findOne<Konva.Group>(`#${CSS.escape(id)}`))
      .filter((n): n is Konva.Group => !!n)
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selection, elements, stage])

  function onTransformEnd() {
    const tr = trRef.current
    const st = stage()
    if (!tr || !st) return
    const anchor = anchorRef.current
    const corner = !!anchor && /top|bottom/.test(anchor) && /left|right/.test(anchor)
    const patches = new Map<string, Record<string, number>>()
    for (const node of tr.nodes()) {
      const id = node.id()
      const el = useEditorStore.getState().elements[id]
      if (!el) continue
      const sx = node.scaleX()
      const sy = node.scaleY()
      const d = el.data
      let width = Math.max(MIN, d.width * Math.abs(sx))
      let height = el.type === 'text' ? d.height : Math.max(el.type === 'shape' && (el.data.shape === 'line' || el.data.shape === 'arrow') ? 0 : MIN, d.height * Math.abs(sy))
      const patch: Record<string, number> = {}
      if (el.type === 'text') {
        const t = el.data as TextData
        if (corner) {
          patch.fontSize = Math.max(6, Math.round(t.fontSize * Math.abs(sx) * 10) / 10)
        }
        width = Math.max(40, width)
        height = d.height * (corner ? Math.abs(sx) : 1)
      }
      const cx = node.x()
      const cy = node.y()
      patches.set(id, { ...patch, width: round(width), height: round(height), x: round(cx - width / 2), y: round(cy - height / 2), rotation: round(node.rotation()) })
      node.scaleX(1)
      node.scaleY(1)
    }
    updateElements([...patches.keys()], (el) => patches.get(el.id) ?? {})
  }

  // Fallback must match the real --brand purple (styles/tokens.css) — an orange fallback here was
  // briefly visible (wrong-colored selection outline) whenever this read raced the stylesheet/theme
  // applying --brand to the document, e.g. on first paint before editor.css/tokens.css take effect.
  const accent = useToken('--brand', '#5b4fe5')
  const sw = 1.5 / zoom
  return (
    <Layer>
      {guides.vertical.map((x) => (
        <Line key={`v${x}`} points={[x, -4000, x, pageH + 4000]} stroke="#FFB547" strokeWidth={sw} listening={false} />
      ))}
      {guides.horizontal.map((y) => (
        <Line key={`h${y}`} points={[-4000, y, pageW + 4000, y]} stroke="#FFB547" strokeWidth={sw} listening={false} />
      ))}
      {marquee && <Rect {...marquee} fill="rgba(255,90,54,0.12)" stroke={accent} strokeWidth={sw} listening={false} />}
      <Transformer
        ref={trRef}
        rotateEnabled
        rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
        rotationSnapTolerance={4}
        keepRatio={isImageLike || isGrouped}
        flipEnabled={false}
        enabledAnchors={
          onlyLines
            ? ['middle-left', 'middle-right']
            : isText
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
              : isImageLike
                ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                : undefined
        }
        anchorSize={9 / Math.max(zoom, 0.35)}
        anchorCornerRadius={2}
        anchorStroke={accent}
        anchorFill="#ffffff"
        anchorStrokeWidth={1.5 / Math.max(zoom, 0.35)}
        borderStroke={accent}
        borderStrokeWidth={1.5 / Math.max(zoom, 0.35)}
        rotateAnchorOffset={28 / Math.max(zoom, 0.35)}
        padding={0}
        boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < MIN || Math.abs(newBox.height) < (onlyLines ? 0 : MIN) ? oldBox : newBox)}
        onTransformStart={() => {
          anchorRef.current = trRef.current?.getActiveAnchor() ?? null
        }}
        onTransformEnd={onTransformEnd}
      />
    </Layer>
  )
}

const round = (v: number) => Math.round(v * 100) / 100
