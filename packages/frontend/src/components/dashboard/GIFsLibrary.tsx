import { useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { HiOutlineSearch, HiOutlineRefresh } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useEditorStore } from '../../stores/editorStore';

export default function GIFsLibrary() {
  const { addElement } = useEditorStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const tags = ['all', 'trending', 'funny', 'cute', 'nature', 'anime', 'gaming', 'music', 'sports'];

  useEffect(() => {
    if (searchQuery) searchGifs();
  }, [searchQuery, selectedTag, page]);

  const searchGifs = async () => {
    setLoading(true);
    try {
      let url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(searchQuery)}&key=${import.meta.env.VITE_TENOR_API_KEY || 'demo'}&limit=20&media_filter=gif&position=${(page - 1) * 20}`;
      if (selectedTag !== 'all') url += `&tag=${selectedTag}`;
      const res = await fetch(url);
      const data = await res.json();
      page === 1 ? setGifs(data.results || []) : setGifs(prev => [...prev, ...(data.results || [])]);
      setHasMore(data.results?.length > 0);
    } catch { setGifs([]); }
    setLoading(false);
  };

  const handleInsert = (gif: any) => {
    const src = gif.media?.[0]?.gif?.url || gif.url;
    if (!src) return;
    addElement({ type: 'image', width: 200, height: 200, data: { type: 'image', src, objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 } });
    toast.success('GIF added');
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }} placeholder="Search GIFs..." className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white" />
        <HiOutlineSearch size={16} className="absolute left-3 top-2.5 text-gray-400" />
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map((t) => (
          <button key={t} onClick={() => { setSelectedTag(t); setPage(1); }} className={cn("px-2 py-0.5 rounded-full text-[10px] transition-colors", selectedTag === t ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-center py-6"><div className="w-5 h-5 border-2 border-canva-purple border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : gifs.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
          {gifs.map((gif) => (
            <button key={gif.id} onClick={() => handleInsert(gif)} className="rounded-xl overflow-hidden hover:ring-2 hover:ring-canva-purple transition-all relative group">
              <img src={gif.media?.[0]?.tinygif?.url || gif.media?.[0]?.gif?.url} alt={gif.title || 'GIF'} className="w-full aspect-square object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-white text-xs font-medium bg-canva-purple/80 px-2 py-1 rounded">Add</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-400 text-sm">Search for free GIFs</div>
      )}
      {hasMore && !loading && gifs.length > 0 && (
        <button onClick={() => setPage(p => p + 1)} className="w-full py-2 text-xs text-canva-purple hover:bg-canva-purple/10 rounded-lg transition-colors">
          <HiOutlineRefresh className="inline w-3 h-3 mr-1" /> Load More
        </button>
      )}
    </div>
  );
}
