import type { ReactNode } from 'react'
import { useVideoEditorStore } from '@/stores/videoEditorStore'
import { TextField, SelectField } from '@/components/ui/Fields'
import { NumField } from '@/components/editor/inspector/controls'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/Button'
import { TEXT_FONTS } from '@/models/textFonts'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="video-props__section">
      <p className="video-props__section-title">{title}</p>
      {children}
    </div>
  )
}

export function VideoPropertiesPanel() {
  const selection = useVideoEditorStore((s) => s.selection)
  const tracks = useVideoEditorStore((s) => s.tracks)
  const updateClip = useVideoEditorStore((s) => s.updateClip)
  const clip = selection.length === 1 ? tracks.flatMap((t) => t.clips).find((c) => c.id === selection[0]) : undefined

  if (!clip) {
    return (
      <div className="video-panel video-props__empty">
        <Icon name="settings" size={28} />
        <p className="video-props__empty-title">No clip selected</p>
        <p className="field__hint">Select a clip on the timeline, or add media from the library, to edit its properties here.</p>
      </div>
    )
  }

  const maxDuration = clip.sourceDuration != null ? Math.max(0.2, clip.sourceDuration - clip.trimIn) : 100000
  const maxTrimIn = clip.sourceDuration != null ? Math.max(0, clip.sourceDuration - 0.2) : 100000
  const kindLabel = clip.kind === 'text' ? 'Text' : clip.kind === 'audio' ? 'Audio clip' : clip.kind === 'image' ? 'Image clip' : 'Video clip'

  return (
    <div className={`video-panel video-props ${clip.locked ? 'is-locked' : ''}`}>
      <Section title="Clip">
        <h3 className="video-props__kind">
          {kindLabel}
          {clip.locked && (
            <span className="video-props__locked-badge">
              <Icon name="lock" size={12} /> Locked
            </span>
          )}
        </h3>
        {clip.kind !== 'text' && clip.assetUrl && (
          <p className="field__hint" style={{ wordBreak: 'break-all' }}>{clip.assetUrl.split('/').pop()}</p>
        )}
        {clip.kind === 'text' && (
          <TextField label="Text" value={clip.text ?? ''} onChange={(e) => updateClip(clip.id, { text: e.target.value })} />
        )}
      </Section>

      {clip.kind === 'text' && (
        <Section title="Style">
          <SelectField
            label="Font"
            value={clip.fontFamily ?? TEXT_FONTS[0]!.id}
            onChange={(e) => updateClip(clip.id, { fontFamily: e.target.value })}
            style={{ fontFamily: TEXT_FONTS.find((f) => f.id === (clip.fontFamily ?? TEXT_FONTS[0]!.id))?.css }}
          >
            {TEXT_FONTS.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.label}</option>
            ))}
          </SelectField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <NumField label="Font size" ariaLabel="Font size (px)" value={clip.fontSize ?? 48} min={8} max={400} onChange={(v) => updateClip(clip.id, { fontSize: v })} />
            <div className="field">
              <label className="field__label" htmlFor="text-color">Colour</label>
              <input id="text-color" type="color" value={clip.color ?? '#ffffff'} onChange={(e) => updateClip(clip.id, { color: e.target.value })} style={{ width: '100%', height: 32, padding: 2 }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <IconButton icon="bold" label="Bold" active={!!clip.bold} onClick={() => updateClip(clip.id, { bold: !clip.bold })} />
            <IconButton icon="italic" label="Italic" active={!!clip.italic} onClick={() => updateClip(clip.id, { italic: !clip.italic })} />
            <span style={{ width: 1, background: 'var(--v-border)', margin: '0 4px' }} />
            <IconButton icon="alignLeft" label="Align left" active={(clip.textAlign ?? 'center') === 'left'} onClick={() => updateClip(clip.id, { textAlign: 'left' })} />
            <IconButton icon="alignCenterH" label="Align centre" active={(clip.textAlign ?? 'center') === 'center'} onClick={() => updateClip(clip.id, { textAlign: 'center' })} />
            <IconButton icon="alignRight" label="Align right" active={(clip.textAlign ?? 'center') === 'right'} onClick={() => updateClip(clip.id, { textAlign: 'right' })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="field">
              <label className="field__label" htmlFor="text-highlight">Highlight</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  id="text-highlight"
                  type="color"
                  value={clip.highlightColor && clip.highlightColor !== 'transparent' ? clip.highlightColor : '#000000'}
                  onChange={(e) => updateClip(clip.id, { highlightColor: e.target.value })}
                  style={{ width: '100%', height: 32, padding: 2 }}
                />
                <IconButton
                  icon="close"
                  label="Remove highlight"
                  active={!clip.highlightColor || clip.highlightColor === 'transparent'}
                  onClick={() => updateClip(clip.id, { highlightColor: 'transparent' })}
                />
              </div>
            </div>
            <NumField label="Letter spacing" ariaLabel="Letter spacing (px)" value={clip.letterSpacing ?? 0} min={-10} max={100} onChange={(v) => updateClip(clip.id, { letterSpacing: v })} />
          </div>
          <NumField label="Line height" ariaLabel="Line height (multiple of font size)" value={clip.lineHeight ?? 1.2} min={0.5} max={3} step={0.05} onChange={(v) => updateClip(clip.id, { lineHeight: v })} />
          <div className="field video-props__volume">
            <label className="field__label" htmlFor="text-opacity" style={{ width: 54, flex: 'none' }}>Opacity</label>
            <input id="text-opacity" type="range" min={0} max={1} step={0.05} value={clip.opacity ?? 1} onChange={(e) => updateClip(clip.id, { opacity: Number(e.target.value) })} />
            <span className="video-props__volume-value">{Math.round((clip.opacity ?? 1) * 100)}%</span>
          </div>
          <p className="field__hint">Drag the text directly on the canvas to reposition it. Double-click it to edit.</p>
        </Section>
      )}

      <Section title="Timing">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <NumField label="Start" ariaLabel="Timeline start (seconds)" value={clip.start} min={0} onChange={(v) => updateClip(clip.id, { start: v })} />
          <NumField label="Duration" ariaLabel="Duration (seconds)" value={clip.duration} min={0.2} max={maxDuration} onChange={(v) => updateClip(clip.id, { duration: v })} />
        </div>
      </Section>

      {clip.kind !== 'text' && clip.kind !== 'image' && (
        <Section title="Trim">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <NumField
              label="Trim in"
              ariaLabel="Source in-point (seconds)"
              value={clip.trimIn}
              min={0}
              max={maxTrimIn}
              onChange={(v) => updateClip(clip.id, { trimIn: v, duration: Math.min(clip.duration, clip.sourceDuration != null ? clip.sourceDuration - v : clip.duration) })}
            />
            {clip.sourceDuration != null && (
              <NumField label="Source length" ariaLabel="Full source media length (seconds)" value={clip.sourceDuration} min={0.2} onChange={() => undefined} />
            )}
          </div>
        </Section>
      )}

      {clip.kind !== 'text' && clip.kind !== 'image' && (
        <Section title="Volume">
          <div className="field video-props__volume">
            <input id="clip-volume" type="range" min={0} max={1} step={0.05} value={clip.volume} onChange={(e) => updateClip(clip.id, { volume: Number(e.target.value) })} aria-label="Volume" />
            <span className="video-props__volume-value">{Math.round(clip.volume * 100)}%</span>
          </div>
        </Section>
      )}
    </div>
  )
}
