import { useState, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { HiOutlineSearch, HiOutlineRefresh } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useEditorStore } from '../../stores/editorStore';

export default function ElementsLibrary() {
  const { addElement } = useEditorStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [icons, setIcons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState('all');

  const collections = ['all', 'shapes', 'arrows', 'lines', 'stickers', 'frames', 'grids', 'badges', 'buttons', 'decorative'];

  const localIcons = [
    { id: 'star', name: 'Star', category: 'stickers' }, { id: 'heart', name: 'Heart', category: 'stickers' },
    { id: 'check-circle', name: 'Check Circle', category: 'buttons' }, { id: 'x-circle', name: 'Close', category: 'buttons' },
    { id: 'arrow-right', name: 'Arrow Right', category: 'arrows' }, { id: 'arrow-left', name: 'Arrow Left', category: 'arrows' },
    { id: 'home', name: 'Home', category: 'decorative' }, { id: 'user', name: 'User', category: 'decorative' },
    { id: 'settings', name: 'Settings', category: 'decorative' }, { id: 'search', name: 'Search', category: 'decorative' },
    { id: 'trash', name: 'Trash', category: 'buttons' }, { id: 'mail', name: 'Mail', category: 'decorative' },
    { id: 'phone', name: 'Phone', category: 'decorative' }, { id: 'calendar', name: 'Calendar', category: 'decorative' },
    { id: 'camera', name: 'Camera', category: 'decorative' }, { id: 'cloud', name: 'Cloud', category: 'decorative' },
    { id: 'download', name: 'Download', category: 'buttons' }, { id: 'upload', name: 'Upload', category: 'buttons' },
    { id: 'share', name: 'Share', category: 'buttons' }, { id: 'bookmark', name: 'Bookmark', category: 'decorative' },
    { id: 'globe', name: 'Globe', category: 'decorative' }, { id: 'lock', name: 'Lock', category: 'decorative' },
    { id: 'eye', name: 'Eye', category: 'decorative' }, { id: 'edit', name: 'Edit', category: 'buttons' },
    { id: 'copy', name: 'Copy', category: 'buttons' }, { id: 'zap', name: 'Zap', category: 'stickers' },
    { id: 'shield', name: 'Shield', category: 'decorative' }, { id: 'award', name: 'Award', category: 'badges' },
    { id: 'coffee', name: 'Coffee', category: 'decorative' }, { id: 'sun', name: 'Sun', category: 'decorative' },
  ];

  useEffect(() => {
    if (searchQuery) searchIcons();
    else setIcons(localIcons);
  }, [searchQuery, selectedCollection]);

  const searchIcons = async () => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.iconify.io/search?query=${encodeURIComponent(searchQuery)}&limit=30`);
      const data = await res.json();
      const results = (data.icons || []).map((id: string) => {
        const [provider, name] = id.includes(':') ? id.split(':') : ['lucide', id];
        return { id, name: name.replace(/-/g, ' '), provider, category: 'all' };
      });
      setIcons(results.length > 0 ? results : localIcons.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())));
    } catch { setIcons(localIcons.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()))); }
    setLoading(false);
  };

  const filteredIcons = selectedCollection === 'all' ? icons : icons.filter(i => i.category === selectedCollection);

  const handleInsert = (icon: any) => {
    addElement({ type: 'shape', width: 80, height: 80, data: { type: 'shape', shapeType: 'rectangle', fill: '#7B2FBE', stroke: 'transparent', strokeWidth: 0, cornerRadius: 8 } });
    toast.success(`Added: ${icon.name}`);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search icons (star, heart, home)..." className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white" />
        <HiOutlineSearch size={16} className="absolute left-3 top-2.5 text-gray-400" />
      </div>
      <div className="flex flex-wrap gap-1">
        {collections.map((c) => (
          <button key={c} onClick={() => setSelectedCollection(c)} className={cn("px-2 py-0.5 rounded-full text-[10px] transition-colors", selectedCollection === c ? 'bg-canva-purple text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500')}>
            {c.charAt(0).toUpperCase() + c.slice(1)}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="text-center py-6"><div className="w-5 h-5 border-2 border-canva-purple border-t-transparent rounded-full animate-spin mx-auto" /></div>
      ) : filteredIcons.length > 0 ? (
        <div className="grid grid-cols-5 gap-1.5 max-h-[40vh] overflow-y-auto">
          {filteredIcons.map((icon) => (
            <button key={icon.id} onClick={() => handleInsert(icon)} className="aspect-square bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center hover:bg-canva-purple/10 hover:ring-1 hover:ring-canva-purple transition-all p-1" title={icon.name}>
              <span className="text-[9px] text-gray-500 text-center leading-tight">{icon.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-gray-400 text-sm">Search for icons</div>
      )}
    </div>
  );
}
