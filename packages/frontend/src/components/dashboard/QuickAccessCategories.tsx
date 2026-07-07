import { useRef, useState, useEffect } from 'react';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { projectAPI } from '../../utils/api';
import toast from 'react-hot-toast';

interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
  gradient: string;
  width?: number;
  height?: number;
}

const CATEGORIES: Category[] = [
  { id: 'templates', label: 'Templates', icon: '🎨', color: '#7B2FBE', gradient: 'from-purple-500 to-indigo-600' },
  { id: 'magic-ai', label: 'Magic AI', icon: '✨', color: '#F59E0B', gradient: 'from-amber-400 to-orange-500' },
  { id: 'presentation', label: 'Presentation', icon: '📊', color: '#3B82F6', gradient: 'from-blue-500 to-cyan-500', width: 1920, height: 1080 },
  { id: 'instagram-post', label: 'Instagram Post', icon: '📷', color: '#C13584', gradient: 'from-fuchsia-500 to-pink-600', width: 1080, height: 1080 },
  { id: 'instagram-story', label: 'Instagram Story', icon: '📱', color: '#E1306C', gradient: 'from-purple-500 to-pink-500', width: 1080, height: 1920 },
  { id: 'facebook-post', label: 'Facebook Post', icon: '👍', color: '#1877F2', gradient: 'from-blue-600 to-blue-400', width: 1200, height: 630 },
  { id: 'facebook-story', label: 'Facebook Story', icon: '📱', color: '#1877F2', gradient: 'from-blue-600 to-indigo-500', width: 1080, height: 1920 },
  { id: 'youtube-thumbnail', label: 'YouTube Thumbnail', icon: '▶️', color: '#FF0000', gradient: 'from-red-600 to-red-400', width: 1280, height: 720 },
  { id: 'twitter-post', label: 'Twitter/X Post', icon: '🐦', color: '#111827', gradient: 'from-gray-700 to-gray-900', width: 1600, height: 900 },
  { id: 'linkedin-banner', label: 'LinkedIn Banner', icon: '💼', color: '#0A66C2', gradient: 'from-blue-700 to-sky-600', width: 1584, height: 396 },
  { id: 'video', label: 'Video', icon: '🎬', color: '#EF4444', gradient: 'from-red-500 to-pink-500', width: 1920, height: 1080 },
  { id: 'poster', label: 'Poster', icon: '🖼️', color: '#7C3AED', gradient: 'from-violet-600 to-purple-500', width: 2480, height: 3508 },
  { id: 'business-card', label: 'Business Card', icon: '💳', color: '#2563EB', gradient: 'from-blue-500 to-indigo-500', width: 1050, height: 600 },
  { id: 'logo', label: 'Logo', icon: '🏷️', color: '#111827', gradient: 'from-gray-800 to-gray-600', width: 500, height: 500 },
  { id: 'invitation-card', label: 'Invitation Card', icon: '💌', color: '#DB2777', gradient: 'from-rose-500 to-pink-500', width: 1080, height: 1350 },
  { id: 'resume-cv', label: 'Resume/CV', icon: '📝', color: '#0F766E', gradient: 'from-teal-600 to-emerald-500', width: 2480, height: 3508 },
  { id: 'print-shop', label: 'Print Shop', icon: '🖨️', color: '#10B981', gradient: 'from-emerald-500 to-teal-500' },
  { id: 'documents', label: 'Documents', icon: '📄', color: '#6366F1', gradient: 'from-indigo-500 to-blue-500', width: 816, height: 1056 },
  { id: 'whiteboard', label: 'Whiteboard', icon: '📋', color: '#8B5CF6', gradient: 'from-violet-500 to-purple-500', width: 1920, height: 1080 },
  { id: 'spreadsheet', label: 'Spreadsheet', icon: '📈', color: '#14B8A6', gradient: 'from-teal-500 to-cyan-500', width: 1200, height: 800 },
  { id: 'website', label: 'Website', icon: '🌐', color: '#F97316', gradient: 'from-orange-400 to-red-500', width: 1440, height: 900 },
  { id: 'custom', label: 'Custom Size', icon: '✏️', color: '#64748B', gradient: 'from-slate-500 to-gray-600' },
  { id: 'upload', label: 'Upload', icon: '📤', color: '#0EA5E9', gradient: 'from-sky-400 to-blue-500' },
];

export default function QuickAccessCategories() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customW, setCustomW] = useState('1920');
  const [customH, setCustomH] = useState('1080');
  const [customUnit, setCustomUnit] = useState<'px' | 'mm' | 'in'>('px');
  const navigate = useNavigate();

  const UNIT_TO_PX: Record<string, number> = { px: 1, mm: 3.7795, in: 96 };

  const PRESET_SIZES = [
    { label: 'Presentation', w: 1920, h: 1080 },
    { label: 'Instagram Post', w: 1080, h: 1080 },
    { label: 'Instagram Story', w: 1080, h: 1920 },
    { label: 'A4 Portrait', w: 794, h: 1123 },
    { label: 'Business Card', w: 1050, h: 600 },
    { label: 'YouTube Thumbnail', w: 1280, h: 720 },
    { label: 'Twitter Header', w: 1500, h: 500 },
    { label: 'Facebook Cover', w: 1640, h: 624 },
  ];

  const checkScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 5);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
    }
    return () => { el?.removeEventListener('scroll', checkScroll); window.removeEventListener('resize', checkScroll); };
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -300 : 300, behavior: 'smooth' });
  };

  const handleCategoryClick = async (cat: Category) => {
    if (cat.id === 'templates') {
      navigate('/templates');
      return;
    }
    if (cat.id === 'magic-ai') {
      navigate('/ai');
      return;
    }
    if (cat.id === 'upload') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = async () => {
              const pages = [{
                id: `page-${Date.now()}`,
                name: 'Page 1',
                elements: [{
                  id: `el-${Date.now()}`,
                  type: 'image', x: 0, y: 0,
                  width: Math.min(img.width, 1920), height: Math.min(img.height, 1080),
                  rotation: 0, opacity: 1, visible: true, locked: false,
                  zIndex: 0, name: 'Uploaded Image',
                  data: { type: 'image', src: ev.target?.result as string, objectFit: 'contain', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
                }],
                backgroundColor: '#FFFFFF',
                width: Math.min(img.width, 1920), height: Math.min(img.height, 1080),
              }];
              try {
                const { data } = await projectAPI.create({ name: file.name.replace(/\.[^/.]+$/, ''), canvasData: pages });
                navigate(`/editor/${data.id}`);
              } catch {
                toast.error('Failed to create design');
              }
            };
            img.src = ev.target?.result as string;
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      return;
    }
    if (cat.id === 'custom') {
      setShowCustomModal(true);
      return;
    }
    if (cat.width && cat.height) {
      const pages = [{
        id: `page-${Date.now()}`,
        name: 'Page 1',
        elements: [],
        backgroundColor: '#FFFFFF',
        width: cat.width, height: cat.height,
      }];
      try {
        const { data } = await projectAPI.create({ name: `Untitled ${cat.label}`, canvasData: pages });
        toast.success(`Created ${cat.label}`);
        navigate(`/editor/${data.id}`);
      } catch {
        toast.error('Failed to create design');
      }
    }
  };

  const handleCreateCustom = async () => {
    const factor = UNIT_TO_PX[customUnit];
    const w = Math.round(parseFloat(customW) * factor) || 1920;
    const h = Math.round(parseFloat(customH) * factor) || 1080;
    if (w < 100 || h < 100) { toast.error('Minimum size is 100 × 100 px'); return; }
    if (w > 8000 || h > 8000) { toast.error('Maximum size is 8000 × 8000 px'); return; }
    const pages = [{ id: `page-${Date.now()}`, name: 'Page 1', elements: [], backgroundColor: '#FFFFFF', width: w, height: h }];
    try {
      const { data } = await projectAPI.create({ name: `Custom ${customW}×${customH}${customUnit}`, canvasData: pages });
      setShowCustomModal(false);
      toast.success(`Custom canvas ${w}×${h}px created`);
      navigate(`/editor/${data.id}`);
    } catch {
      toast.error('Failed to create design');
    }
  };

  return (
    <div className="relative">

      {/* Custom Size Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCustomModal(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 z-10" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Custom Size</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Set exact dimensions for your design canvas.</p>

            {/* Unit selector */}
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 mb-4 w-fit">
              {(['px', 'mm', 'in'] as const).map((u) => (
                <button key={u} onClick={() => setCustomUnit(u)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${customUnit === u ? 'bg-white dark:bg-gray-700 text-canva-purple shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                  {u}
                </button>
              ))}
            </div>

            {/* W × H inputs */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Width</label>
                <input type="number" value={customW} onChange={(e) => setCustomW(e.target.value)} min={1}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple" />
              </div>
              <div className="text-gray-400 font-bold mt-5">×</div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Height</label>
                <input type="number" value={customH} onChange={(e) => setCustomH(e.target.value)} min={1}
                  className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple" />
              </div>
            </div>

            {/* Preset sizes */}
            <div className="mb-5">
              <p className="text-xs text-gray-400 mb-2">Quick presets</p>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_SIZES.map((p) => (
                  <button key={p.label} onClick={() => { setCustomW(String(p.w)); setCustomH(String(p.h)); setCustomUnit('px'); }}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-canva-purple hover:bg-canva-purple/5 transition-all text-left">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{p.label}</span>
                    <span className="text-[10px] text-gray-400">{p.w}×{p.h}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button onClick={() => setShowCustomModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateCustom}
                className="flex-1 py-2.5 rounded-xl bg-canva-purple hover:bg-canva-purple/90 text-white text-sm font-semibold transition-colors">
                Create Design
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">What would you like to create?</h2>
        <div className="flex gap-1">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-500"
          >
            <HiOutlineChevronLeft size={18} />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-gray-500"
          >
            <HiOutlineChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth pb-2"
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryClick(cat)}
            className="flex-shrink-0 group"
          >
            <div className={`w-[120px] h-[120px] rounded-2xl bg-gradient-to-br ${cat.gradient} flex flex-col items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-200`}>
              <span className="text-3xl group-hover:scale-110 transition-transform">{cat.icon}</span>
              <span className="text-[11px] font-semibold text-white text-center leading-tight px-2">{cat.label}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
