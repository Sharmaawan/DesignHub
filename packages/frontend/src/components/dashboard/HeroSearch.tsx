import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineSearch, HiOutlineClock, HiOutlineTrendingUp, HiOutlineTemplate, HiOutlineX } from 'react-icons/hi';
import { SearchSuggestion } from '../../types';
import { useProjectStore } from '../../stores/projectStore';

const POPULAR_SEARCHES = [
  'Instagram story', 'Business presentation', 'Resume template', 'YouTube thumbnail',
  'Logo design', 'Social media post', 'Flyer', 'Certificate',
];

const KEYBOARD_SHORTCUTS = [
  { keys: 'Ctrl + K', action: 'Quick search' },
  { keys: 'Ctrl + N', action: 'New design' },
  { keys: 'Ctrl + S', action: 'Save design' },
  { keys: 'Ctrl + Z', action: 'Undo' },
];

export default function HeroSearch() {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(
    JSON.parse(localStorage.getItem('designhub-recent-searches') || '[]')
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { projects, templates } = useProjectStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getSearchSuggestions = (): SearchSuggestion[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const results: SearchSuggestion[] = [];

    projects.slice(0, 3).forEach((p) => {
      if (p.name.toLowerCase().includes(q)) {
        results.push({ id: p.id, text: p.name, type: 'project', thumbnail: p.thumbnail });
      }
    });

    templates.slice(0, 3).forEach((t) => {
      if (t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) {
        results.push({ id: t.id, text: t.name, type: 'template', thumbnail: t.thumbnail });
      }
    });

    return results;
  };

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const updated = [searchQuery, ...recentSearches.filter((s) => s !== searchQuery)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('designhub-recent-searches', JSON.stringify(updated));
    setIsFocused(false);
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem('designhub-recent-searches');
  };

  const suggestions = getSearchSuggestions();
  const showDropdown = isFocused;

  return (
    <div className="w-full max-w-2xl mx-auto relative">
      <div className={`relative transition-all duration-300 ${isFocused ? 'scale-[1.02]' : ''}`}>
        <HiOutlineSearch size={22} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(query); }}
          placeholder="What will you design today?"
          className="w-full pl-14 pr-24 py-4.5 text-lg bg-white dark:bg-[#1e1e30] rounded-2xl border-2 border-gray-200 dark:border-gray-700 focus:outline-none focus:border-[#7B2FBE] focus:ring-4 focus:ring-[#7B2FBE]/10 text-gray-900 dark:text-white placeholder-gray-400 shadow-lg shadow-gray-200/50 dark:shadow-black/20 transition-all"
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {query && (
            <button onClick={() => setQuery('')} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
              <HiOutlineX size={16} />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            Ctrl K
          </kbd>
        </div>
      </div>

      {/* Search dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1e1e30] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          {/* Search suggestions */}
          {suggestions.length > 0 && (
            <div className="p-3 border-b border-gray-100 dark:border-gray-800">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Results</h4>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { handleSearch(s.text); setIsFocused(false); }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  {s.type === 'project' ? (
                    <HiOutlineClock size={16} className="text-gray-400" />
                  ) : (
                    <HiOutlineTemplate size={16} className="text-[#7B2FBE]" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300">{s.text}</span>
                  <span className="text-[10px] text-gray-400 ml-auto capitalize">{s.type}</span>
                </button>
              ))}
            </div>
          )}

          {/* Recent searches */}
          {recentSearches.length > 0 && !query && (
            <div className="p-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between px-2 mb-2">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent</h4>
                <button onClick={clearRecentSearches} className="text-[10px] text-[#7B2FBE] hover:underline">Clear</button>
              </div>
              {recentSearches.map((s, i) => (
                <button
                  key={i}
                  onClick={() => { handleSearch(s); setIsFocused(false); }}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <HiOutlineClock size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{s}</span>
                </button>
              ))}
            </div>
          )}

          {/* Popular templates */}
          {!query && (
            <div className="p-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Popular Searches</h4>
              <div className="flex flex-wrap gap-2 px-2">
                {POPULAR_SEARCHES.map((term) => (
                  <button
                    key={term}
                    onClick={() => { setQuery(term); handleSearch(term); }}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 rounded-full text-gray-600 dark:text-gray-400 hover:bg-[#7B2FBE]/10 hover:text-[#7B2FBE] transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Keyboard shortcuts */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-4 px-2">
              {KEYBOARD_SHORTCUTS.map((sc) => (
                <div key={sc.keys} className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-gray-100 dark:bg-gray-800 rounded text-gray-400 border border-gray-200 dark:border-gray-700">{sc.keys}</kbd>
                  <span className="text-[10px] text-gray-400">{sc.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
