import { useMemo, useState } from 'react'
import type { VideoClip, VideoTrack } from '@/models/video'
import { useVideoEditorStore } from '@/stores/videoEditorStore'
import { IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Menu } from '@/components/ui/Menu'
import type { IconName } from '@/components/ui/iconPaths'

interface Entry {
  clip: VideoClip
  track: VideoTrack
}

function isGif(url: string | undefined): boolean {
  return !!url && /\.gif(\?|$)/i.test(url)
}

function kindIcon(clip: VideoClip): IconName {
  if (clip.kind === 'video') return 'video'
  if (clip.kind === 'audio') return 'audio'
  if (clip.kind === 'text') return 'text'
  return isGif(clip.assetUrl) ? 'gif' : 'image'
}

function layerName(clip: VideoClip): string {
  if (clip.name) return clip.name
  if (clip.kind === 'text') return clip.text?.trim() || 'Text'
  if (clip.assetUrl) {
    const file = decodeURIComponent(clip.assetUrl.split('/').pop() ?? '')
    return file || (clip.kind === 'audio' ? 'Audio' : clip.kind === 'image' ? 'Image' : 'Video')
  }
  return clip.kind === 'audio' ? 'Audio' : clip.kind === 'image' ? 'Image' : 'Video'
}

function Thumb({ clip }: { clip: VideoClip }) {
  if (clip.kind === 'video' && clip.assetUrl) {
    return <video className="video-layer__thumb" src={clip.assetUrl} muted preload="metadata" />
  }
  if (clip.kind === 'image' && clip.assetUrl) {
    return <img className="video-layer__thumb" src={clip.assetUrl} alt="" />
  }
  if (clip.kind === 'text') {
    return (
      <div className="video-layer__thumb video-layer__thumb--text" style={{ color: clip.color ?? '#fff', fontFamily: clip.fontFamily }}>
        {(clip.text || 'T').trim().slice(0, 2)}
      </div>
    )
  }
  return (
    <div className="video-layer__thumb video-layer__thumb--icon">
      <Icon name={kindIcon(clip)} size={16} />
    </div>
  )
}

/** Canva-style Layers panel: every timeline clip, across every track, as one orderable card. Visual
 * stacking in this editor is a track-order property (see PreviewStage/videoExport), so "reorder a
 * layer" re-stacks the track that owns it relative to other tracks of the same kind — never touches
 * the clip's own start/duration, per the spec. */
export function VideoLayersPanel() {
  const tracks = useVideoEditorStore((s) => s.tracks)
  const selection = useVideoEditorStore((s) => s.selection)
  const select = useVideoEditorStore((s) => s.select)
  const playhead = useVideoEditorStore((s) => s.playhead)
  const updateClip = useVideoEditorStore((s) => s.updateClip)
  const removeClip = useVideoEditorStore((s) => s.removeClip)
  const duplicateClip = useVideoEditorStore((s) => s.duplicateClip)
  const reorderLayer = useVideoEditorStore((s) => s.reorderLayer)
  const [tab, setTab] = useState<'all' | 'overlapping'>('all')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  // Reverse track order (later track = drawn on top, see PreviewStage) so the topmost layer lists first,
  // matching every other layers-panel convention (Canva, Figma, Premiere).
  const entries: Entry[] = useMemo(
    () => [...tracks].reverse().flatMap((track) => [...track.clips].sort((a, b) => a.start - b.start).map((clip) => ({ clip, track }))),
    [tracks],
  )

  const reference = selection.length === 1 ? entries.find((e) => e.clip.id === selection[0])?.clip : undefined
  const refStart = reference ? reference.start : playhead
  const refEnd = reference ? reference.start + reference.duration : playhead
  const visible = tab === 'all' ? entries : entries.filter((e) => e.clip.start < refEnd && e.clip.start + e.clip.duration > refStart)

  function trackKindIndex(trackId: string, kind: VideoTrack['kind']): number {
    return tracks.filter((t) => t.kind === kind).findIndex((t) => t.id === trackId)
  }

  function onDrop(target: Entry) {
    if (!dragId) return
    const source = entries.find((e) => e.clip.id === dragId)
    setDragId(null)
    setOverId(null)
    if (!source || source.clip.id === target.clip.id || source.track.kind !== target.track.kind) return
    if (source.track.id === target.track.id) return // same track: nothing to re-stack, clips there don't overlay each other
    reorderLayer(source.clip.id, trackKindIndex(target.track.id, target.track.kind))
  }

  return (
    <div className="video-panel video-layers">
      <div className="video-layers__tabs" role="tablist" aria-label="Layer filter">
        <button type="button" role="tab" aria-selected={tab === 'all'} className={`video-layers__tab ${tab === 'all' ? 'is-active' : ''}`} onClick={() => setTab('all')}>
          All Layers
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overlapping'}
          className={`video-layers__tab ${tab === 'overlapping' ? 'is-active' : ''}`}
          onClick={() => setTab('overlapping')}
        >
          Overlapping Layers
        </button>
      </div>
      <div className="video-layers__list">
        {visible.length === 0 && <p className="field__hint" style={{ padding: 16 }}>{tab === 'overlapping' ? 'Nothing overlaps here.' : 'Add media, text or audio to see layers.'}</p>}
        {visible.map((entry) => {
          const { clip } = entry
          const isSelected = selection.includes(clip.id)
          return (
            <div
              key={clip.id}
              className={`video-layer ${isSelected ? 'is-selected' : ''} ${overId === clip.id ? 'is-drop-target' : ''}`}
              draggable
              onClick={() => select([clip.id])}
              onDragStart={() => setDragId(clip.id)}
              onDragOver={(e) => { e.preventDefault(); if (overId !== clip.id) setOverId(clip.id) }}
              onDragLeave={() => setOverId((cur) => (cur === clip.id ? null : cur))}
              onDrop={(e) => { e.preventDefault(); onDrop(entry) }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
            >
              <span className="video-layer__handle" title="Drag to reorder">
                <Icon name="more" size={14} />
              </span>
              <Thumb clip={clip} />
              <span className="video-layer__meta">
                <span className="video-layer__name">
                  <Icon name={kindIcon(clip)} size={13} />
                  {layerName(clip)}
                </span>
              </span>
              <IconButton
                icon={clip.hidden ? 'eyeOff' : 'eye'}
                label={clip.hidden ? 'Show layer' : 'Hide layer'}
                size="sm"
                onClick={(e) => { e.stopPropagation(); updateClip(clip.id, { hidden: !clip.hidden }) }}
              />
              <IconButton
                icon={clip.locked ? 'lock' : 'unlock'}
                label={clip.locked ? 'Unlock layer' : 'Lock layer'}
                size="sm"
                active={!!clip.locked}
                onClick={(e) => { e.stopPropagation(); updateClip(clip.id, { locked: !clip.locked }) }}
              />
              <Menu
                align="end"
                trigger={<IconButton icon="more" label="More actions" size="sm" />}
                items={[
                  {
                    label: 'Rename',
                    icon: 'text',
                    onSelect: () => {
                      const next = window.prompt('Layer name', layerName(clip))
                      if (next && next.trim()) updateClip(clip.id, { name: next.trim() })
                    },
                  },
                  { label: 'Duplicate', icon: 'copy', onSelect: () => duplicateClip(clip.id) },
                  { label: clip.locked ? 'Unlock' : 'Lock', icon: clip.locked ? 'unlock' : 'lock', onSelect: () => updateClip(clip.id, { locked: !clip.locked }) },
                  { label: clip.hidden ? 'Show' : 'Hide', icon: clip.hidden ? 'eye' : 'eyeOff', onSelect: () => updateClip(clip.id, { hidden: !clip.hidden }) },
                  'separator',
                  { label: 'Bring to front', icon: 'chevronUp', disabled: clip.locked, onSelect: () => reorderLayer(clip.id, 'front') },
                  { label: 'Move forward', icon: 'chevronUp', disabled: clip.locked, onSelect: () => reorderLayer(clip.id, 'forward') },
                  { label: 'Move backward', icon: 'chevronDown', disabled: clip.locked, onSelect: () => reorderLayer(clip.id, 'backward') },
                  { label: 'Send to back', icon: 'chevronDown', disabled: clip.locked, onSelect: () => reorderLayer(clip.id, 'back') },
                  'separator',
                  { label: 'Delete', icon: 'trash', danger: true, disabled: clip.locked, onSelect: () => removeClip(clip.id) },
                ]}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
