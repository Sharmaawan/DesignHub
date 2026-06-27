import { useRef, useState, useEffect } from 'react';
import { HiOutlineChevronLeft, HiOutlineChevronRight } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../stores/editorStore';
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
  { id: 'social-media', label: 'Social Media', icon: '📱', color: '#EC4899', gradient: 'from-pink-500 to-rose-500', width: 1080, height: 1080 },
  { id: 'video', label: 'Video', icon: '🎬', color: '#EF4444', gradient: 'from-red-500 to-pink-500', width: 1920, height: 1080 },
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
  const navigate = useNavigate();
  const { setProject } = useEditorStore();

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

  const handleCategoryClick = (cat: Category) => {
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
            img.onload = () => {
              setProject({
                id: `proj-${Date.now()}`,
                name: file.name.replace(/\.[^/.]+$/, ''),
                pages: [{
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
                }],
                ownerId: '1', collaborators: [], isFavorite: false, isTemplate: false,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              });
              navigate('/editor');
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
      navigate('/?create=custom');
      return;
    }
    if (cat.width && cat.height) {
      setProject({
        id: `proj-${Date.now()}`,
        name: `Untitled ${cat.label}`,
        pages: [{
          id: `page-${Date.now()}`,
          name: 'Page 1',
          elements: [],
          backgroundColor: '#FFFFFF',
          width: cat.width, height: cat.height,
        }],
        ownerId: '1', collaborators: [], isFavorite: false, isTemplate: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      toast.success(`Created ${cat.label}`);
      navigate('/editor');
    }
  };

  return (
    <div className="relative">
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
