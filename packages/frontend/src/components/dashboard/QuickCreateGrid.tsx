import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlinePencil, HiOutlinePresentationChartBar, HiOutlineCamera, HiOutlineDeviceMobile, HiOutlineThumbUp, HiOutlinePlay, HiOutlineDotsHorizontal } from 'react-icons/hi';
import { projectAPI } from '../../utils/api';
import toast from 'react-hot-toast';

interface QuickCreateItem {
  id: string;
  label: string;
  dimensions: string;
  icon: any;
  // A solid gradient pair for the icon tile (not a pale tint) — the cards
  // were reading as flat/dull with a plain white body and a barely-there
  // pastel icon square, so the color now lives in a proper solid-filled
  // icon badge (white glyph on top) plus a faint matching wash on the card
  // itself, rather than in one more saturated gradient tile like the old
  // rainbow row this replaced.
  gradient: string;
  tint: string;
  width?: number;
  height?: number;
}

// A short, curated set — not the full 20+ format list (that lives in the
// "Custom size" / "More" flows below) — clean single-purpose cards instead
// of the old horizontally-scrolling rainbow gradient tiles.
const ITEMS: QuickCreateItem[] = [
  { id: 'presentation', label: 'Presentation', dimensions: '16:9', icon: HiOutlinePresentationChartBar, gradient: 'from-blue-500 to-cyan-400', tint: '#EFF6FF', width: 1920, height: 1080 },
  { id: 'instagram-post', label: 'Instagram Post', dimensions: '1080 × 1080', icon: HiOutlineCamera, gradient: 'from-fuchsia-500 to-pink-500', tint: '#FDF2F8', width: 1080, height: 1080 },
  { id: 'instagram-story', label: 'Instagram Story', dimensions: '1080 × 1920', icon: HiOutlineDeviceMobile, gradient: 'from-purple-500 to-rose-500', tint: '#FDF2F8', width: 1080, height: 1920 },
  { id: 'facebook-post', label: 'Facebook Post', dimensions: '1200 × 630', icon: HiOutlineThumbUp, gradient: 'from-blue-600 to-sky-400', tint: '#EFF6FF', width: 1200, height: 630 },
  { id: 'youtube-thumbnail', label: 'YouTube Thumbnail', dimensions: '1280 × 720', icon: HiOutlinePlay, gradient: 'from-red-600 to-orange-400', tint: '#FEF2F2', width: 1280, height: 720 },
];

export default function QuickCreateGrid() {
  const navigate = useNavigate();
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customW, setCustomW] = useState('1920');
  const [customH, setCustomH] = useState('1080');

  const createDesign = async (name: string, width: number, height: number) => {
    const pages = [{ id: `page-${Date.now()}`, name: 'Page 1', elements: [], backgroundColor: '#FFFFFF', width, height }];
    try {
      const { data } = await projectAPI.create({ name, canvasData: pages });
      navigate(`/editor/${data.id}`);
    } catch {
      toast.error('Failed to create design');
    }
  };

  const handleCreateCustom = () => {
    const w = Math.round(parseFloat(customW)) || 1920;
    const h = Math.round(parseFloat(customH)) || 1080;
    if (w < 100 || h < 100) { toast.error('Minimum size is 100 × 100 px'); return; }
    if (w > 8000 || h > 8000) { toast.error('Maximum size is 8000 × 8000 px'); return; }
    setShowCustomModal(false);
    createDesign(`Custom ${w}×${h}`, w, h);
  };

  // Tint colors are light-mode-only values (a pale wash behind each card) —
  // applied as inline style rather than a class so each item can carry its
  // own color, but that means dark mode needs its own flat dark card
  // background instead, or the pale tint would clash with a dark theme.
  const cardClass = 'group flex flex-col items-center justify-center gap-2.5 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 dark:!bg-[#1e1e30] hover:border-[#7B2FBE] hover:-translate-y-0.5 hover:shadow-md transition-all text-center animate-slide-up';
  const iconClass = 'w-11 h-11 rounded-xl flex items-center justify-center shadow-sm transition-transform duration-200 group-hover:scale-110';

  return (
    <div>
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCustomModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Custom size</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Enter exact width and height in pixels.</p>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Width</label>
                <input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} min={1}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 focus:border-[#7B2FBE]" />
              </div>
              <div className="text-gray-400 font-bold mt-5">×</div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Height</label>
                <input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} min={1}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 focus:border-[#7B2FBE]" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCustomModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateCustom}
                className="flex-1 py-2.5 rounded-xl bg-[#7B2FBE] hover:bg-[#6025A0] text-white text-sm font-semibold transition-colors">
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Quick create</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Choose a size and start designing instantly</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          onClick={() => setShowCustomModal(true)}
          className={cardClass}
          style={{ backgroundColor: '#F3E8FF', animationDelay: '0ms', animationFillMode: 'backwards' }}
        >
          <div className={`${iconClass} bg-gradient-to-br from-[#7B2FBE] to-[#9B4DCA]`}>
            <HiOutlinePencil size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Custom size</p>
            <p className="text-[11px] text-gray-500">Enter width × height</p>
          </div>
        </button>

        {ITEMS.map((item, i) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => createDesign(item.label, item.width!, item.height!)}
              className={cardClass}
              style={{ backgroundColor: item.tint, animationDelay: `${(i + 1) * 40}ms`, animationFillMode: 'backwards' }}
            >
              <div className={`${iconClass} bg-gradient-to-br ${item.gradient}`}>
                <Icon size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{item.label}</p>
                <p className="text-[11px] text-gray-500">{item.dimensions}</p>
              </div>
            </button>
          );
        })}

        <button
          onClick={() => navigate('/templates')}
          className={cardClass}
          style={{ backgroundColor: '#F8F9FC', animationDelay: `${(ITEMS.length + 1) * 40}ms`, animationFillMode: 'backwards' }}
        >
          <div className={`${iconClass} bg-gradient-to-br from-gray-500 to-gray-700`}>
            <HiOutlineDotsHorizontal size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">More</p>
            <p className="text-[11px] text-gray-400">Browse all formats</p>
          </div>
        </button>
      </div>
    </div>
  );
}
