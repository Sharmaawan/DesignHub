import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { videoProjectApi } from '@/services/api/videoProjectApi'
import { useVideoEditorStore } from '@/stores/videoEditorStore'
import { errorMessage, toast } from '@/stores/toastStore'
import { Spinner } from '@/components/ui/Feedback'
import { VideoToolbar } from '@/components/video/VideoToolbar'
import { MediaBin } from '@/components/video/MediaBin'
import { PreviewStage } from '@/components/video/PreviewStage'
import { Timeline } from '@/components/video/Timeline'
import { VideoPropertiesPanel } from '@/components/video/VideoPropertiesPanel'
import { VideoLayersPanel } from '@/components/video/VideoLayersPanel'
import './video.css'

export default function VideoEditorActivity() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const id = Number(projectId)
  const loaded = useVideoEditorStore((s) => s.loaded && s.projectId === id)
  const reset = useVideoEditorStore((s) => s.reset)
  const load = useVideoEditorStore((s) => s.load)
  const dirty = useVideoEditorStore((s) => s.dirty)
  const save = useVideoEditorStore((s) => s.save)
  const [rightTab, setRightTab] = useState<'properties' | 'layers'>('properties')

  useEffect(() => {
    if (!Number.isSafeInteger(id) || id <= 0) {
      navigate('/')
      return
    }
    reset()
    void videoProjectApi.get(id).then(load).catch((e) => {
      toast.error(errorMessage(e))
      navigate('/')
    })
  }, [id, reset, load, navigate])

  // Autosave: debounce 2s after the last change.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!loaded || !dirty) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void save().catch((e) => toast.error(errorMessage(e))), 2000)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [loaded, dirty, save])

  if (!loaded) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Spinner size={26} />
      </div>
    )
  }

  return (
    <div className="video-editor">
      <VideoToolbar />
      <div className="video-editor__body">
        <aside className="video-editor__left">
          <MediaBin />
        </aside>
        <div className="video-editor__center">
          <PreviewStage />
        </div>
        <aside className="video-editor__right">
          <div className="video-right-toggle" role="tablist" aria-label="Right sidebar">
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'properties'}
              className={`video-right-toggle__btn ${rightTab === 'properties' ? 'is-active' : ''}`}
              onClick={() => setRightTab('properties')}
            >
              Properties
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'layers'}
              className={`video-right-toggle__btn ${rightTab === 'layers' ? 'is-active' : ''}`}
              onClick={() => setRightTab('layers')}
            >
              Layers
            </button>
          </div>
          {rightTab === 'properties' ? <VideoPropertiesPanel /> : <VideoLayersPanel />}
        </aside>
      </div>
      <Timeline />
    </div>
  )
}
