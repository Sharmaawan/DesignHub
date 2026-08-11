import { useState, useEffect } from 'react';
import { HiOutlineX, HiOutlineDownload, HiOutlineCheck, HiOutlinePhotograph, HiOutlineDocumentText, HiOutlineFilm, HiOutlineCode } from 'react-icons/hi';
import { useEditorStore } from '../../stores/editorStore';
import { exportPageAsMp4, ExportResolution, ExportFps } from '../../lib/videoExport';
import { capturePageAsDataUrl } from '../../lib/pageSnapshot';
import { Page, VideoData, AudioData } from '../../types';
import toast from 'react-hot-toast';

// Best-effort duration for a clip being auto-placed onto the timeline at export
// time: prefer what's already known on the element's own data (set when it was
// originally added, see LeftSidebar.tsx's addVideoToCanvas), and only fall back to
// probing the source live for older elements that predate that fix.
async function resolveClipDurationMs(src: string, knownStart: number, knownEnd: number, kind: 'video' | 'audio'): Promise<number> {
  if (knownEnd > knownStart) return Math.round((knownEnd - knownStart) * 1000);
  return new Promise((resolve) => {
    const el = document.createElement(kind);
    el.preload = 'metadata';
    el.src = src;
    const done = (ms: number) => { el.src = ''; resolve(ms); };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration * 1000) : 5000);
    el.onerror = () => done(5000);
    setTimeout(() => done(5000), 8000);
  });
}

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
}

type ExportFormat = 'png' | 'jpg' | 'pdf' | 'svg' | 'pptx' | 'mp4';

const FORMATS: { id: ExportFormat; label: string; icon: string; desc: string; ext: string }[] = [
  { id: 'png', label: 'PNG', icon: '🖼️', desc: 'High quality image with transparency', ext: '.png' },
  { id: 'jpg', label: 'JPG', icon: '📷', desc: 'Compressed image, smaller file size', ext: '.jpg' },
  { id: 'pdf', label: 'PDF', icon: '📄', desc: 'Document format, best for printing', ext: '.pdf' },
  { id: 'svg', label: 'SVG', icon: '✏️', desc: 'Vector format, scalable to any size', ext: '.svg' },
  { id: 'pptx', label: 'PPTX', icon: '📊', desc: 'PowerPoint presentation format', ext: '.pptx' },
  { id: 'mp4', label: 'MP4', icon: '🎬', desc: 'Video, with audio and animations', ext: '.mp4' },
];

const VIDEO_RESOLUTIONS: { label: string; value: ExportResolution }[] = [
  { label: '720p', value: '720p' },
  { label: '1080p', value: '1080p' },
  { label: '4K', value: '4k' },
];

const VIDEO_FPS_OPTIONS: { label: string; value: ExportFps }[] = [
  { label: '30 fps', value: 30 },
  { label: '60 fps', value: 60 },
];

const RESOLUTIONS = [
  { label: '1x (Standard)', value: 1 },
  { label: '2x (High DPI)', value: 2 },
  { label: '3x (Ultra HD)', value: 3 },
];

const QUALITY_OPTIONS = [
  { label: 'Maximum', value: 100 },
  { label: 'High', value: 85 },
  { label: 'Medium', value: 60 },
  { label: 'Low', value: 30 },
];

export default function ExportModal({ open, onClose }: ExportModalProps) {
  const { pages, currentPageIndex, project, addTrack, setPageDuration, updateElement } = useEditorStore();
  const currentPage = pages[currentPageIndex];
  // A design with any video element must export as a real MP4, not a static image —
  // exporting it as PNG/JPG would just capture whatever single frame happened to be
  // showing, silently discarding the video entirely.
  const hasVideo = !!currentPage?.elements.some((el) => el.type === 'video');

  const [format, setFormat] = useState<ExportFormat>('png');
  const [resolution, setResolution] = useState(2);
  const [quality, setQuality] = useState(85);
  const [transparent, setTransparent] = useState(false);
  const [selectedPages, setSelectedPages] = useState<number[]>([currentPageIndex]);
  const [videoResolution, setVideoResolution] = useState<ExportResolution>('1080p');
  const [videoFps, setVideoFps] = useState<ExportFps>(30);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phaseLabel, setPhaseLabel] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setExporting(false);
      setProgress(0);
      setPhaseLabel('');
      setDone(false);
      setSelectedPages([currentPageIndex]);
      // Auto-select MP4 the instant a video-containing page is opened for export —
      // matches "the export format should automatically be MP4" exactly, rather than
      // leaving PNG selected and letting the user discover the mismatch themselves.
      if (hasVideo) setFormat('mp4');
      else if (format === 'mp4') setFormat('png');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentPageIndex, hasVideo]);

  if (!open) return null;

  const togglePage = (index: number) => {
    setSelectedPages((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  // Normally every video is auto-placed onto a track the moment it's added (see
  // LeftSidebar.tsx's addVideoToCanvas) and this is a no-op. This only does real work
  // for pages that predate that fix — a video sitting on the canvas with no trackId
  // at all — auto-building a real timeline for it live, in the actual project (so it
  // shows up correctly in the Timeline panel afterward too), instead of blocking
  // export behind a manual setup step the user was never asked to do in the first
  // place.
  const ensurePageHasTimeline = async (pageIndex: number): Promise<Page> => {
    const page = useEditorStore.getState().pages[pageIndex];
    if (page.duration && page.duration > 0) return page;

    const unplaced = page.elements.filter((el) => !el.trackId && (el.type === 'video' || el.type === 'audio'));
    if (unplaced.length === 0) {
      // No media to build a timeline around at all — nothing sensible to auto-generate.
      throw new Error('This page has no video timeline set up yet — add a video and it will be placed on the timeline automatically.');
    }

    for (const el of unplaced) {
      const kind = el.type as 'video' | 'audio';
      const data = el.data as VideoData | AudioData;
      const trackId = useEditorStore.getState().pages[pageIndex].tracks?.find((t) => t.type === kind)?.id
        || addTrack(kind);
      const trackClips = useEditorStore.getState().pages[pageIndex].elements.filter((e) => e.trackId === trackId);
      const timelineStart = trackClips.reduce((max, c) => Math.max(max, c.timelineEnd ?? 0), 0);
      const clipMs = await resolveClipDurationMs(data.src, data.startTime || 0, (data as any).endTime || 0, kind);
      const timelineEnd = timelineStart + clipMs;
      updateElement(el.id, { trackId, timelineStart, timelineEnd });
    }

    const finalDuration = Math.max(...useEditorStore.getState().pages[pageIndex].elements.map((e) => e.timelineEnd ?? 0));
    setPageDuration(pageIndex, finalDuration);
    return useEditorStore.getState().pages[pageIndex];
  };

  const handleExportVideo = async () => {
    if (!currentPage) return;
    setExporting(true);
    setProgress(0);
    setDone(false);
    try {
      setPhaseLabel('Preparing…');
      const readyPage = await ensurePageHasTimeline(currentPageIndex);
      const blob = await exportPageAsMp4(readyPage, {
        resolution: videoResolution,
        fps: videoFps,
        onProgress: ({ phase, pct }) => {
          setProgress(pct);
          setPhaseLabel(
            phase === 'preparing' ? 'Preparing…' :
            phase === 'recording' ? 'Rendering timeline…' :
            'Encoding MP4…'
          );
        },
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `${(project?.name || 'design').replace(/[^\w\- ]+/g, '')}.mp4`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      setDone(true);
      toast.success('Exported as MP4!');
    } catch (err: any) {
      toast.error(err?.message || 'Video export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleExportImages = async () => {
    const targetPages = selectedPages.length > 0 ? selectedPages : [currentPageIndex];
    const baseName = (project?.name || 'design').replace(/[^\w\- ]+/g, '') || 'design';
    const ext = FORMATS.find((f) => f.id === format)?.ext || '.png';

    try {
      // Render every selected page off-screen (not just whichever one happens to be
      // on screen right now) so exporting page 3 while viewing page 1 — or exporting
      // several pages at once — actually captures the right content for each.
      const shots: { name: string; dataUrl: string }[] = [];
      for (let i = 0; i < targetPages.length; i++) {
        const pageIndex = targetPages[i];
        const page = pages[pageIndex];
        if (!page) continue;
        const dataUrl = await capturePageAsDataUrl(page, {
          format: format === 'jpg' ? 'jpeg' : 'png',
          quality: quality / 100,
          scale: resolution,
        });
        shots.push({ name: `${baseName}-page${pageIndex + 1}${ext}`, dataUrl });
        setProgress(Math.round(((i + 1) / targetPages.length) * 100));
      }

      if (shots.length === 0) return;

      if (shots.length === 1) {
        const link = document.createElement('a');
        link.download = shots[0].name;
        link.href = shots[0].dataUrl;
        link.click();
      } else {
        // Multiple pages selected — bundle into one zip instead of firing off several
        // simultaneous browser downloads (which many browsers throttle/block past the
        // first one or two anyway).
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        shots.forEach((s) => {
          const base64 = s.dataUrl.split(',')[1];
          zip.file(s.name, base64, { base64: true });
        });
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `${baseName}-export.zip`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`Exported ${shots.length} page${shots.length !== 1 ? 's' : ''} as ${format.toUpperCase()}!`);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error(err?.message || 'Export failed');
    }
  };

  const handleExport = async () => {
    if (format === 'mp4' && hasVideo) {
      await handleExportVideo();
      return;
    }

    setExporting(true);
    setProgress(0);
    setDone(false);

    if (format === 'png' || format === 'jpg') {
      await handleExportImages();
    } else {
      // PDF/SVG/PPTX generation isn't implemented yet — rather than silently produce
      // a 0-byte "success," say so plainly instead of faking a progress bar.
      toast.error(`${format.toUpperCase()} export isn't available yet — try PNG, JPG, or MP4.`);
      setExporting(false);
      return;
    }

    setDone(true);
    setExporting(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Export design</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><HiOutlineX size={18} /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Format Selection — a video-containing page can only export as MP4 (any
              other format would just discard the video, keeping the rest of the
              picker around would silently produce a broken export), so the whole
              grid collapses to a single explanatory MP4 tile instead. */}
          {hasVideo ? (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-3">Format</label>
              <div className="p-3 rounded-xl border-2 border-canva-purple bg-canva-purple/5 flex items-center gap-3">
                <span className="text-xl">🎬</span>
                <div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white block">MP4</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    This page has video — it will export as an MP4 with audio, not a static image.
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-3">Format</label>
              <div className="grid grid-cols-3 gap-2">
                {FORMATS.filter((f) => f.id !== 'mp4').map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      format === f.id
                        ? 'border-canva-purple bg-canva-purple/5'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className="text-xl block mb-1">{f.icon}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white block">{f.label}</span>
                    <span className="text-[10px] text-gray-400 leading-tight block mt-0.5">{f.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Video export settings */}
          {hasVideo && (
            <>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Resolution</label>
                <div className="flex gap-2">
                  {VIDEO_RESOLUTIONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setVideoResolution(r.value)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                        videoResolution === r.value
                          ? 'border-canva-purple bg-canva-purple/5 text-canva-purple'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Frame rate</label>
                <div className="flex gap-2">
                  {VIDEO_FPS_OPTIONS.map((f) => (
                    <button
                      key={f.value}
                      onClick={() => setVideoFps(f.value)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                        videoFps === f.value
                          ? 'border-canva-purple bg-canva-purple/5 text-canva-purple'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              {!currentPage?.duration && (
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs">
                  This page's timeline hasn't been set up yet — exporting will place your video on the timeline and set the scene duration automatically.
                </div>
              )}
            </>
          )}

          {/* Resolution (for image formats) */}
          {!hasVideo && (format === 'png' || format === 'jpg') && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Resolution</label>
              <div className="flex gap-2">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setResolution(r.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      resolution === r.value
                        ? 'border-canva-purple bg-canva-purple/5 text-canva-purple'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality (for lossy formats) */}
          {!hasVideo && (format === 'jpg' || format === 'pdf') && (
            <div>
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Quality</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="flex-1 accent-canva-purple"
                />
                <span className="text-sm text-gray-500 w-12 text-right">{quality}%</span>
              </div>
              <div className="flex justify-between mt-1">
                {QUALITY_OPTIONS.map((q) => (
                  <button key={q.value} onClick={() => setQuality(q.value)} className="text-[10px] text-gray-400 hover:text-canva-purple">
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transparent background */}
          {!hasVideo && format === 'png' && (
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">Transparent background</span>
              <button
                onClick={() => setTransparent(!transparent)}
                className={`w-10 h-6 rounded-full transition-colors duration-200 relative cursor-pointer ${transparent ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${transparent ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>
          )}

          {/* Pages Selection — video export is scoped to the single current-page
              timeline scene, not a multi-page batch, so this doesn't apply. */}
          {!hasVideo && (
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">Pages to export</label>
            <div className="space-y-1.5">
              <button
                onClick={() => setSelectedPages(pages.map((_, i) => i))}
                className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                  selectedPages.length === pages.length ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-gray-700'
                }`}
              >
                Select all
              </button>
              <div className="flex flex-wrap gap-2 mt-2">
                {pages.map((page, index) => (
                  <button
                    key={page.id}
                    onClick={() => togglePage(index)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                      selectedPages.includes(index)
                        ? 'border-canva-purple bg-canva-purple/5 text-canva-purple'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500'
                    }`}
                  >
                    {selectedPages.includes(index) && <HiOutlineCheck size={14} />}
                    <span className="text-sm">Page {index + 1}</span>
                    <span className="text-[10px] text-gray-400">{page.width}x{page.height}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* Export Progress */}
          {exporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">{phaseLabel || 'Exporting...'}</span>
                <span className="text-canva-purple font-medium">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-canva-purple to-canva-blue rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Done */}
          {done && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl text-green-700 dark:text-green-400 text-sm">
              <HiOutlineCheck size={18} /> Export complete! Check your downloads.
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {hasVideo
              ? `MP4 · ${videoResolution} · ${videoFps}fps`
              : `${selectedPages.length} page${selectedPages.length !== 1 ? 's' : ''} · ${FORMATS.find((f) => f.id === format)?.label} · ${resolution}x`}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={handleExport}
              disabled={exporting || (!hasVideo && selectedPages.length === 0)}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiOutlineDownload size={16} />
              {exporting ? (phaseLabel || 'Exporting...') : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
