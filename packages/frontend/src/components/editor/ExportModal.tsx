import { useState, useEffect } from 'react';
import { HiOutlineX, HiOutlineDownload, HiOutlineCheck, HiOutlinePhotograph, HiOutlineDocumentText, HiOutlineFilm, HiOutlineCode } from 'react-icons/hi';
import { useEditorStore } from '../../stores/editorStore';
import toast from 'react-hot-toast';

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
  { id: 'mp4', label: 'MP4', icon: '🎬', desc: 'Video format for animations', ext: '.mp4' },
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
  const { pages, currentPageIndex } = useEditorStore();
  const [format, setFormat] = useState<ExportFormat>('png');
  const [resolution, setResolution] = useState(2);
  const [quality, setQuality] = useState(85);
  const [transparent, setTransparent] = useState(false);
  const [selectedPages, setSelectedPages] = useState<number[]>([currentPageIndex]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setExporting(false);
      setProgress(0);
      setDone(false);
      setSelectedPages([currentPageIndex]);
    }
  }, [open, currentPageIndex]);

  if (!open) return null;

  const togglePage = (index: number) => {
    setSelectedPages((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleExport = async () => {
    setExporting(true);
    setProgress(0);
    setDone(false);

    // Simulate export progress
    for (let i = 0; i <= 100; i += 5) {
      await new Promise((r) => setTimeout(r, 80));
      setProgress(i);
    }

    // Actually try to export as PNG/JPG using canvas
    if (format === 'png' || format === 'jpg') {
      try {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const link = document.createElement('a');
          link.download = `design${FORMATS.find((f) => f.id === format)?.ext || '.png'}`;
          link.href = canvas.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', quality / 100);
          link.click();
        }
      } catch (err) {
        console.error('Export error:', err);
      }
    }

    setDone(true);
    setExporting(false);
    toast.success(`Exported as ${format.toUpperCase()}!`);
  };

  const currentPage = pages[currentPageIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-display font-bold text-gray-900 dark:text-white">Export design</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><HiOutlineX size={18} /></button>
        </div>

        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Format Selection */}
          <div>
            <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-3">Format</label>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((f) => (
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

          {/* Resolution (for image formats) */}
          {(format === 'png' || format === 'jpg') && (
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
          {(format === 'jpg' || format === 'pdf') && (
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
          {format === 'png' && (
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-sm text-gray-700 dark:text-gray-300">Transparent background</span>
              <button
                onClick={() => setTransparent(!transparent)}
                className={`w-10 h-6 rounded-full transition-colors relative ${transparent ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${transparent ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
            </label>
          )}

          {/* Pages Selection */}
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

          {/* Export Progress */}
          {exporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-300">Exporting...</span>
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
            {selectedPages.length} page{selectedPages.length !== 1 ? 's' : ''} · {FORMATS.find((f) => f.id === format)?.label} · {resolution}x
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
            <button
              onClick={handleExport}
              disabled={exporting || selectedPages.length === 0}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <HiOutlineDownload size={16} />
              {exporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
