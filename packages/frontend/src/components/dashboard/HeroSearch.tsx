import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineSearch, HiOutlineClock, HiOutlineTrendingUp, HiOutlineTemplate, HiOutlineX } from 'react-icons/hi';
import { SearchSuggestion } from '../../types';
import { useProjectStore } from '../../stores/projectStore';
import { projectAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const POPULAR_SEARCHES = [
  'Instagram story', 'Business presentation', 'Resume template', 'YouTube thumbnail',
  'Logo design', 'Social media post', 'Flyer', 'Certificate',
];

// The animated placeholder types out `Search "<phrase>"...` — reusing
// POPULAR_SEARCHES so the two stay in sync instead of maintaining two lists.
const TYPING_PHRASES = POPULAR_SEARCHES.map((s) => `Search "${s}"...`);

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
  const [typedText, setTypedText] = useState('');

  // Typewriter loop for the empty-state placeholder — a self-perpetuating
  // recursive setTimeout (not setInterval) so typing/deleting speed and the
  // pause-at-full-phrase can each use their own delay. Pauses entirely once the
  // user focuses or types, so it never fights with real input.
  useEffect(() => {
    if (isFocused || query) return;
    let phraseIdx = 0;
    let charIdx = 0;
    let deleting = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = () => {
      const phrase = TYPING_PHRASES[phraseIdx];
      if (!deleting) {
        charIdx++;
        setTypedText(phrase.slice(0, charIdx));
        if (charIdx === phrase.length) {
          timeoutId = setTimeout(() => { deleting = true; tick(); }, 1400);
          return;
        }
        timeoutId = setTimeout(tick, 55);
      } else {
        charIdx--;
        setTypedText(phrase.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % TYPING_PHRASES.length;
          timeoutId = setTimeout(tick, 400);
          return;
        }
        timeoutId = setTimeout(tick, 28);
      }
    };
    timeoutId = setTimeout(tick, 400);
    return () => clearTimeout(timeoutId);
  }, [isFocused, query]);

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

    // Filter first, *then* take the first 3 matches — slicing before filtering
    // (the previous order) only ever checked the first 3 items in the whole
    // list, so anything past that could never match no matter what you typed.
    projects
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((p) => results.push({ id: p.id, text: p.name, type: 'project', thumbnail: p.thumbnail }));

    templates
      .filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((t) => results.push({ id: t.id, text: t.name, type: 'template', thumbnail: t.thumbnail }));

    return results;
  };

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    const updated = [searchQuery, ...recentSearches.filter((s) => s !== searchQuery)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('designhub-recent-searches', JSON.stringify(updated));
    setIsFocused(false);
  };

  // Clicking a result previously only saved it to "recent searches" and closed
  // the dropdown — it never actually opened the project or template, so a
  // search that *did* find something still looked like nothing happened.
  const handleSuggestionClick = async (s: SearchSuggestion) => {
    handleSearch(s.text);
    if (s.type === 'project') {
      navigate(`/editor/${s.id}`);
      return;
    }
    const template = templates.find((t) => t.id === s.id);
    const page = (template as any)?.data?.pages?.[0];
    if (!page) { toast.error('Failed to open template'); return; }
    try {
      const { data } = await projectAPI.create({
        name: template!.name,
        canvasData: [{
          id: `page-${Date.now()}`, name: 'Page 1',
          elements: page.elements || [], backgroundColor: page.backgroundColor || '#FFFFFF',
          width: page.width || 1920, height: page.height || 1080,
        }],
      });
      navigate(`/editor/${data.id}`);
    } catch {
      toast.error('Failed to create design');
    }
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
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !query.trim()) return;
            // The dropdown only ever shows the top 3 matches — Enter takes you to
            // the full Templates page (with this search applied) to see everything,
            // previously it just saved to "recent searches" and did nothing else.
            handleSearch(query);
            navigate(`/templates?search=${encodeURIComponent(query)}`);
          }}
          placeholder=""
          className="w-full pl-14 pr-24 py-4.5 text-lg bg-white dark:bg-[#1e1e30] rounded-2xl border-2 border-gray-200 dark:border-gray-700 focus:outline-none focus:border-[#7B2FBE] focus:ring-4 focus:ring-[#7B2FBE]/10 text-gray-900 dark:text-white placeholder-gray-400 shadow-lg shadow-gray-200/50 dark:shadow-black/20 transition-all"
        />
        {/* Typewriter placeholder overlay — a real <input placeholder> can't show a
            blinking caret or animate, so this sits on top of the (intentionally
            empty) native placeholder and disappears the instant the user focuses
            or types, handing control straight back to the real input. */}
        {!isFocused && !query && (
          <div className="absolute left-14 top-1/2 -translate-y-1/2 flex items-center text-lg text-gray-400 pointer-events-none select-none">
            <span>{typedText}</span>
            <span className="ml-0.5 w-[2px] h-6 bg-gray-400 animate-pulse" />
          </div>
        )}
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
                  onClick={() => handleSuggestionClick(s)}
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

          {/* Previously silent when nothing matched — looked identical to the
              search being broken, since nothing else in the dropdown said so. */}
          {query.trim() && suggestions.length === 0 && (
            <div className="p-4 text-center border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm text-gray-400">No matches for "{query}"</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Try a different word, or browse all templates</p>
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
