import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { HiOutlinePlay, HiOutlineX } from 'react-icons/hi';
import { projectAPI } from '../../utils/api';

// Bundled locally (public/sample-video.mp4) rather than fetched from an external host —
// the Google demo bucket used earlier now returns AccessDenied for anonymous requests,
// which is why the video never loaded and the editor sat on its "not ready" placeholder
// (a black-looking rect) forever. A same-origin file has no such dependency and no CORS
// concerns for the canvas-sampling <video> element that reads it.
const SAMPLE_VIDEO_URL = '/sample-video.mp4';

interface VideoFormat {
  label: string;
  width: number;
  height: number;
  gradient: string;
}

const VIDEO_FORMATS: VideoFormat[] = [
  { label: 'Landscape Video', width: 1920, height: 1080, gradient: 'from-fuchsia-500 to-purple-600' },
  { label: 'Instagram Reel', width: 1080, height: 1920, gradient: 'from-pink-500 to-rose-600' },
  { label: 'Mobile Video', width: 1080, height: 1920, gradient: 'from-purple-500 to-indigo-600' },
  { label: 'Facebook Video', width: 1280, height: 720, gradient: 'from-blue-600 to-blue-400' },
  { label: 'TikTok Video', width: 1080, height: 1920, gradient: 'from-rose-500 to-red-600' },
  { label: 'YouTube Video', width: 1920, height: 1080, gradient: 'from-red-600 to-red-400' },
  { label: 'YouTube Video Ad', width: 1920, height: 1080, gradient: 'from-red-500 to-orange-500' },
  { label: 'Video Collage (Square)', width: 1080, height: 1080, gradient: 'from-violet-500 to-fuchsia-600' },
];

export default function VideoSuggestionsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  if (!open) return null;

  const handlePick = async (format: VideoFormat) => {
    const pages = [{
      id: `page-${Date.now()}`,
      name: 'Page 1',
      elements: [{
        id: `el-${Date.now()}`,
        type: 'video' as const, x: 0, y: 0, width: format.width, height: format.height,
        rotation: 0, opacity: 1, visible: true, locked: false, zIndex: 0, name: 'Video',
        data: { type: 'video' as const, src: SAMPLE_VIDEO_URL, autoplay: true, loop: true, muted: true, startTime: 0, endTime: 0 },
      }],
      backgroundColor: '#000000',
      width: format.width, height: format.height,
    }];
    try {
      const { data } = await projectAPI.create({ name: `Untitled ${format.label}`, canvasData: pages });
      toast.success(`Created ${format.label}`);
      onClose();
      navigate(`/editor/${data.id}`);
    } catch {
      toast.error('Failed to create design');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto p-6 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Videos</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <HiOutlineX size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Pick a video format to start with — it opens straight into the editor with a sample clip already playing.</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-5 items-start">
          {VIDEO_FORMATS.map((format) => (
            <button
              key={format.label}
              onClick={() => handlePick(format)}
              className="flex flex-col items-center gap-2 group w-full"
            >
              {/* Card shape mirrors the format's real aspect ratio (portrait for
                  Reel/TikTok/Mobile, wide for Landscape/Facebook/YouTube, square
                  for the collage) instead of forcing every tile into a square. */}
              <div
                style={{ aspectRatio: `${format.width} / ${format.height}` }}
                className={`w-full rounded-xl bg-gradient-to-br ${format.gradient} flex items-center justify-center shadow-md group-hover:shadow-lg group-hover:scale-105 active:scale-95 transition-all duration-200`}
              >
                <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center flex-shrink-0">
                  <HiOutlinePlay size={16} className="text-white translate-x-0.5" />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center leading-tight">{format.label}</span>
              <span className="text-[9px] text-gray-400">{format.width}×{format.height}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
