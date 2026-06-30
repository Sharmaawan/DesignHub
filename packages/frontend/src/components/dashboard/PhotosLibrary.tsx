import { useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { HiOutlineSearch, HiOutlineX, HiOutlineRefresh, HiOutlinePhotograph, HiOutlineVideoCamera } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useEditorStore } from '../../stores/editorStore';

export default function PhotosLibrary() {
  const { addElement } = useEditorStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'photos' | 'videos'>('photos');
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const categories = ['all', 'nature', 'people', 'business', 'technology', 'architecture', 'animals', 'travel', 'food', 'sports'];

  useEffect(() => {
    if (searchQuery) searchAssets();
  }, [searchQuery, activeTab, selectedCategory, page]);

  const searchAssets = async () => {
    setLoading(true);
    try {
      const endpoint = activeTab === 'photos' ? 'search' : 'videos/search';
      const res = await fetch(`https://api.pexels.com/v1/${endpoint}?query=${encodeURIComponent(searchQuery)}&page=${page}&per_page=20`, {
        headers: { 'Authorization': import.meta.env.VITE_PEXELS_API_KEY || 'demo' }
      });
      const data = await res.json();
      const items = activeTab === 'photos' ? (data.photos || []) : (data.videos || []);
      page === 1 ? setPhotos(items) : setPhotos(prev => [...prev, ...items]);
      setHasMore(items.length >= 20);
    } catch { setPhotos([]); }
    setLoading(false);
  };

  const handleInsert = (item: any) => {
    const src = activeTab === 'photos' ? item.src?.medium : item.video_files?.[0]?.link;
    if (!src) return;
    const h = activeTab === 'photos' ? 300 * (item.height / item.width) : 200;
    addElement({ type: 'image', width: 300, height: h, data: { type: 'image', src, objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 } });
    toast.success('Added to canvas');
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button onClick={() => { setActiveTab('photos'); setPhotos([]); }} className={cn("flex-1 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'photos' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500')}>
          <HiOutlinePhotograph className="inline w-3 h-3 mr-1" /> Photos
        </button>
        <button onClick={() => { setActiveTab('videos'); setPhotos([]); }} className={cn("flex-1 py-1.5 text-xs font-medium rounded-md transition-colors", activeTab === 'videos' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500')}>
          <HiOutlineVideoCamera className="inline w-3 h-3 mr-1" /> Videos
        </button>
      </div>
      <div className="relative">
        <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} placeholder={`Search ${activeTab}...`} className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white" />
        <HiOutlineSearch size={16} className="absolute left-3 top-2.5 text-gray-400" />
      </div>
      <div className="flex flex-wrap gap-1">
        {categories.map((c) => (
          <button key={c} onClick={() => { setSelectedCategory(c); setPage(1); }} className={cn("px-2 py-0.5 rounded-full text-[10px] transition-colors", selectedCategory === c ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-center py-6"><div className="w-5 h-5 border-2 border-canva-purple border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
          {photos.map((item) => (
            <button key={item.id} onClick={() => handleInsert(item)} className="rounded-xl overflow-hidden hover:ring-2 hover:ring-canva-purple transition-all relative group">
              <img src={activeTab === 'photos' ? item.src?.tiny : item.image} alt="Stock" className="w-full aspect-square object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-white text-xs font-medium bg-canva-purple/80 px-2 py-1 rounded">Add</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-400 text-sm">Search for free stock {activeTab}</div>
      )}
      {hasMore && !loading && photos.length > 0 && (
        <button onClick={() => setPage(p => p + 1)} className="w-full py-2 text-xs text-canva-purple hover:bg-canva-purple/10 rounded-lg transition-colors">
          <HiOutlineRefresh className="inline w-3 h-3 mr-1" /> Load More
        </button>
      )}
    </div>
  );
}
