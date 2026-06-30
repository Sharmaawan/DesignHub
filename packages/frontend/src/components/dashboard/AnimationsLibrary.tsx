import { useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { HiOutlineSearch, HiOutlineRefresh } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useEditorStore } from '../../stores/editorStore';

export default function AnimationsLibrary() {
  const { addElement } = useEditorStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [animations, setAnimations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<'all' | 'lottie' | 'gif'>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const categories = ['all', 'business', 'nature', 'people', 'technology', 'animals', 'food', 'travel', 'sports', 'abstract'];

  useEffect(() => {
    if (searchQuery) searchAnimations();
  }, [searchQuery, selectedType, page]);

  const searchAnimations = async () => {
    setLoading(true);
    try {
      let url = `https://api.lottiefiles.com/v2/vectors?query=${encodeURIComponent(searchQuery)}&page=${page}&limit=20`;
      if (selectedType !== 'all') url += `&type=${selectedType}`;
      const res = await fetch(url, { headers: { 'X-API-KEY': import.meta.env.VITE_LOTTIEFILES_API_KEY || 'demo' } });
      const data = await res.json();
      const items = (data.data || []).map((item: any) => ({
        id: item.id, url: item.mp4_url || item.gif_url || item.preview, thumb: item.preview || item.cover,
        title: item.name, type: item.format?.includes('lottie') ? 'lottie' : 'gif', category: item.category,
      }));
      page === 1 ? setAnimations(items) : setAnimations(prev => [...prev, ...items]);
      setHasMore(data.data?.length > 0);
    } catch { setAnimations([]); }
    setLoading(false);
  };

  const handleInsert = (anim: any) => {
    const src = anim.url;
    if (!src) return;
    addElement({ type: 'image', width: 200, height: 200, data: { type: 'image', src, objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 } });
    toast.success('Animation added');
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} placeholder="Search animations..." className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white" />
        <HiOutlineSearch size={16} className="absolute left-3 top-2.5 text-gray-400" />
      </div>
      <div className="flex gap-1">
        {(['all', 'lottie', 'gif'] as const).map((t) => (
          <button key={t} onClick={() => { setSelectedType(t); setPage(1); }} className={cn("px-3 py-1 rounded-lg text-[10px] font-medium transition-colors", selectedType === t ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-center py-6"><div className="w-5 h-5 border-2 border-canva-purple border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : animations.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
          {animations.map((anim) => (
            <button key={anim.id} onClick={() => handleInsert(anim)} className="rounded-xl overflow-hidden hover:ring-2 hover:ring-canva-purple transition-all relative group">
              <img src={anim.thumb} alt={anim.title || 'Animation'} className="w-full aspect-square object-cover" />
              <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded">{anim.type}</div>
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-white text-xs font-medium bg-canva-purple/80 px-2 py-1 rounded">Add</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-400 text-sm">Search for Lottie animations</div>
      )}
      {hasMore && !loading && animations.length > 0 && (
        <button onClick={() => setPage(p => p + 1)} className="w-full py-2 text-xs text-canva-purple hover:bg-canva-purple/10 rounded-lg transition-colors">
          <HiOutlineRefresh className="inline w-3 h-3 mr-1" /> Load More
        </button>
      )}
    </div>
  );
}
