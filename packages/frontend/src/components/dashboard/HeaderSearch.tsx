import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineSearch, HiOutlineClock, HiOutlineTemplate, HiOutlineX } from 'react-icons/hi';
import { SearchSuggestion } from '../../types';
import { useProjectStore } from '../../stores/projectStore';
import { projectAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// Compact header search — same search source and click-through behavior as
// HeroSearch (which now only lives inside the hero's own flow), just a
// smaller field with a lighter dropdown suited to sitting in the top bar
// rather than as the page's centerpiece.
export default function HeaderSearch() {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
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
    projects
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((p) => results.push({ id: p.id, text: p.name, type: 'project', thumbnail: p.thumbnail }));
    templates
      .filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
      .slice(0, 4)
      .forEach((t) => results.push({ id: t.id, text: t.name, type: 'template', thumbnail: t.thumbnail }));
    return results;
  };

  const handleSuggestionClick = async (s: SearchSuggestion) => {
    setIsFocused(false);
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

  const suggestions = getSearchSuggestions();
  const showDropdown = isFocused && query.trim().length > 0;

  return (
    <div className="relative w-full max-w-md">
      <HiOutlineSearch size={17} className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' || !query.trim()) return;
          navigate(`/templates?search=${encodeURIComponent(query)}`);
          setIsFocused(false);
        }}
        placeholder="Search templates, designs, or your projects..."
        className="w-full pl-9 sm:pl-10 pr-8 sm:pr-16 py-2.5 text-sm bg-[#F8F9FC] dark:bg-gray-800 rounded-xl border border-transparent focus:outline-none focus:border-[#7B2FBE] focus:bg-white dark:focus:bg-gray-900 focus:ring-4 focus:ring-[#7B2FBE]/10 text-gray-900 dark:text-white placeholder-gray-400 transition-all"
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {query && (
          <button onClick={() => setQuery('')} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
            <HiOutlineX size={14} />
          </button>
        )}
        {!query && (
          <kbd className="hidden sm:flex items-center px-1.5 py-0.5 text-[10px] font-mono text-gray-400 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
            Ctrl K
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1e1e30] rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          {suggestions.length > 0 ? (
            <div className="p-2">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleSuggestionClick(s)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  {s.type === 'project' ? (
                    <HiOutlineClock size={15} className="text-gray-400 flex-shrink-0" />
                  ) : (
                    <HiOutlineTemplate size={15} className="text-[#7B2FBE] flex-shrink-0" />
                  )}
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{s.text}</span>
                  <span className="text-[10px] text-gray-400 ml-auto capitalize flex-shrink-0">{s.type}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center">
              <p className="text-sm text-gray-400">No matches for "{query}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
