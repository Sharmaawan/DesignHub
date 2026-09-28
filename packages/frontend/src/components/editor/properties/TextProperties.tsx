import { useEditorStore } from '../../../stores/editorStore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineExclamationCircle, HiOutlineChevronDown, HiOutlineSearch,
  HiOutlineArrowUp, HiOutlineArrowDown, HiOutlineChevronDoubleUp, HiOutlineChevronDoubleDown,
} from 'react-icons/hi';
import { FONT_LIST, FONT_CATEGORIES, getRecentFonts, addRecentFont } from '../../../utils/fontList';

function CollapsibleSection({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-3 text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide"
      >
        {title}
        <HiOutlineChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pb-4 space-y-3">{children}</div>}
    </div>
  );
}

function FontPicker({ value, onChange }: { value: string; onChange: (font: string) => void }) {
  const [openPopover, setOpenPopover] = useState(false);
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState<string[]>(() => getRecentFonts());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenPopover(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = useMemo(
    () => FONT_LIST.filter((f) => f.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  );

  const pick = (name: string) => {
    onChange(name);
    addRecentFont(name);
    setRecent(getRecentFonts());
    setOpenPopover(false);
    setSearch('');
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpenPopover((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
      >
        <span style={{ fontFamily: value }}>{value}</span>
        <HiOutlineChevronDown size={14} className="text-gray-400 flex-shrink-0" />
      </button>

      {openPopover && (
        <div className="absolute z-20 mt-1 w-full max-h-80 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl">
          <div className="sticky top-0 bg-white dark:bg-gray-800 p-2 border-b border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
            <HiOutlineSearch size={13} className="text-gray-400 flex-shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fonts…"
              className="flex-1 bg-transparent text-xs text-gray-700 dark:text-gray-300 placeholder-gray-400 outline-none"
            />
          </div>

          {!search && recent.length > 0 && (
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">Recently used</p>
              {recent.map((name) => (
                <button
                  key={name}
                  onClick={() => pick(name)}
                  style={{ fontFamily: name }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${name === value ? 'text-canva-purple' : 'text-gray-800 dark:text-gray-200'}`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {search ? (
            <div className="p-1">
              {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-3">No fonts match "{search}"</p>}
              {filtered.map((f) => (
                <button
                  key={f.name}
                  onClick={() => pick(f.name)}
                  style={{ fontFamily: f.name }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${f.name === value ? 'text-canva-purple' : 'text-gray-800 dark:text-gray-200'}`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          ) : (
            FONT_CATEGORIES.map((cat) => (
              <div key={cat} className="p-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1 px-1">{cat}</p>
                {FONT_LIST.filter((f) => f.category === cat).map((f) => (
                  <button
                    key={f.name}
                    onClick={() => pick(f.name)}
                    style={{ fontFamily: f.name }}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${f.name === value ? 'text-canva-purple' : 'text-gray-800 dark:text-gray-200'}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function contrastOutline(hex: string): string {
  const c = (hex || '#000000').replace('#', '');
  if (c.length !== 6) return '#000000';
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (r * 299 + g * 587 + b * 114) / 1000;
  return lum > 140 ? '#000000' : '#FFFFFF';
}

export default function TextProperties() {
  const { selectedElementIds, pages, currentPageIndex, updateElement, bringForward, sendBackward, bringToFront, sendToBack } = useEditorStore();

  const currentPage = pages[currentPageIndex];
  const element = currentPage?.elements.find((el) => el.id === selectedElementIds[0]);

  if (!element || element.type !== 'text') {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <HiOutlineExclamationCircle size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No text element selected</p>
      </div>
    );
  }

  const textData = element.data as any;

  const handleTextChange = useCallback((field: string, value: any) => {
    updateElement(element.id, {
      data: { ...textData, [field]: value },
    });
  }, [element, textData, updateElement]);

  const handleContentChange = useCallback((newText: string) => {
    updateElement(element.id, {
      data: { ...textData, content: newText },
    });
  }, [element, textData, updateElement]);

  // Shadow/Lift use the element's own top-level `shadow` (already rendered for
  // every element type via commonProps in EditorCanvas.tsx) — Outline/Hollow
  // use ShapeData-style fields already wired into AnimatedTextElement's Konva
  // Text node (`outline`, and the new `hollow` flag). Switching effects clears
  // whichever of the two mechanisms isn't being used, so they never fight.
  const currentEffect: 'none' | 'shadow' | 'lift' | 'outline' | 'hollow' =
    element.shadow ? (element.shadow.blur >= 15 ? 'lift' : 'shadow')
    : textData.hollow ? 'hollow'
    : textData.outline ? 'outline'
    : 'none';

  const applyEffect = (effect: typeof currentEffect) => {
    const presets: Record<typeof currentEffect, { shadow: any; outline: any; hollow: boolean }> = {
      none: { shadow: undefined, outline: undefined, hollow: false },
      shadow: { shadow: { color: '#000000', blur: 6, offsetX: 3, offsetY: 3, opacity: 0.35 }, outline: undefined, hollow: false },
      lift: { shadow: { color: '#000000', blur: 20, offsetX: 0, offsetY: 10, opacity: 0.25 }, outline: undefined, hollow: false },
      outline: { shadow: undefined, outline: { color: contrastOutline(textData.color), width: Math.max(1, Math.round((textData.fontSize || 24) * 0.04)) }, hollow: false },
      hollow: { shadow: undefined, outline: { color: textData.color, width: Math.max(1, Math.round((textData.fontSize || 24) * 0.05)) }, hollow: true },
    };
    const p = presets[effect];
    updateElement(element.id, {
      shadow: p.shadow,
      data: { ...element.data, outline: p.outline, hollow: p.hollow },
    } as any);
  };

  const weightOptions = [
    { label: 'Regular', value: 400 },
    { label: 'Medium', value: 500 },
    { label: 'SemiBold', value: 600 },
    { label: 'Bold', value: 700 },
  ];

  return (
    <div className="px-4">
      {/* Content — always visible, not tucked in a collapsed section */}
      <div className="py-3 border-b border-gray-100 dark:border-gray-800">
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Text</label>
        <textarea
          value={textData.content || ''}
          onChange={(e) => handleContentChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple outline-none resize-none"
          rows={3}
        />
      </div>

      <CollapsibleSection title="Typography" defaultOpen>
        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Font Family</label>
          <FontPicker value={textData.fontFamily || 'Inter'} onChange={(v) => handleTextChange('fontFamily', v)} />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Size</label>
            <input
              type="number"
              value={textData.fontSize || 24}
              onChange={(e) => handleTextChange('fontSize', parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
              min={8} max={400}
            />
          </div>
          <div className="flex-shrink-0 flex flex-col justify-end pb-0.5">
            <button
              onClick={() => handleTextChange('fontStyle', textData.fontStyle === 'italic' ? 'normal' : 'italic')}
              title="Italic"
              className={`h-9 px-3 rounded-lg border text-sm italic font-medium transition-colors ${textData.fontStyle === 'italic' ? 'border-canva-purple bg-canva-purple/10 text-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              I
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Style</label>
          <div className="grid grid-cols-4 gap-1">
            {weightOptions.map((w) => (
              <button
                key={w.value}
                onClick={() => handleTextChange('fontWeight', w.value)}
                className={`px-1 py-2 text-[11px] rounded-lg border transition-colors ${textData.fontWeight === w.value ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Color">
        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Text Color</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={textData.color || '#000000'}
              onChange={(e) => handleTextChange('color', e.target.value)}
              className="h-10 w-10 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
            />
            <input
              type="text"
              value={textData.color || '#000000'}
              onChange={(e) => handleTextChange('color', e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-canva-purple/30 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Highlight</label>
          {textData.highlightColor ? (
            <div className="flex gap-2">
              <input
                type="color"
                value={textData.highlightColor}
                onChange={(e) => handleTextChange('highlightColor', e.target.value)}
                className="h-10 w-10 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
              />
              <button
                onClick={() => handleTextChange('highlightColor', undefined)}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Remove highlight
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleTextChange('highlightColor', '#FFF59D')}
              className="w-full h-9 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-500 dark:text-gray-400 hover:border-canva-purple hover:text-canva-purple transition-colors"
            >
              + Add highlight
            </button>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Alignment & Spacing">
        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Alignment</label>
          <div className="grid grid-cols-4 gap-1">
            {(['left', 'center', 'right', 'justify'] as const).map((a) => (
              <button
                key={a}
                onClick={() => handleTextChange('textAlign', a)}
                className={`px-1 py-2 text-[11px] rounded-lg border capitalize transition-colors ${textData.textAlign === a ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Line Height</label>
            <input
              type="number"
              value={textData.lineHeight ?? 1.2}
              onChange={(e) => handleTextChange('lineHeight', parseFloat(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
              min={0.5} max={3} step={0.1}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Letter Spacing</label>
            <input
              type="number"
              value={textData.letterSpacing ?? 0}
              onChange={(e) => handleTextChange('letterSpacing', parseFloat(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
              min={-5} max={20} step={0.1}
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Effects">
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { key: 'none', label: 'None' },
            { key: 'shadow', label: 'Shadow' },
            { key: 'lift', label: 'Lift' },
            { key: 'outline', label: 'Outline' },
            { key: 'hollow', label: 'Hollow' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => applyEffect(opt.key)}
              className={`h-9 rounded-lg border text-xs font-medium transition-colors ${currentEffect === opt.key ? 'border-canva-purple bg-canva-purple/10 text-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Position">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">X</label>
            <input
              type="number"
              value={Math.round(element.x)}
              onChange={(e) => updateElement(element.id, { x: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Y</label>
            <input
              type="number"
              value={Math.round(element.y)}
              onChange={(e) => updateElement(element.id, { y: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
            />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Layer">
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => bringForward(element.id)} className="h-9 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            <HiOutlineArrowUp size={13} /> Forward
          </button>
          <button onClick={() => sendBackward(element.id)} className="h-9 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            <HiOutlineArrowDown size={13} /> Backward
          </button>
          <button onClick={() => bringToFront(element.id)} className="h-9 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            <HiOutlineChevronDoubleUp size={13} /> To Front
          </button>
          <button onClick={() => sendToBack(element.id)} className="h-9 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
            <HiOutlineChevronDoubleDown size={13} /> To Back
          </button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Opacity">
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={(element.opacity ?? 1) * 100}
            onChange={(e) => updateElement(element.id, { opacity: parseInt(e.target.value) / 100 })}
            className="flex-1"
            min={0} max={100}
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">{Math.round((element.opacity ?? 1) * 100)}%</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Advanced">
        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Case</label>
          <div className="grid grid-cols-4 gap-1">
            {([
              { key: 'none', label: 'Aa' },
              { key: 'uppercase', label: 'AA' },
              { key: 'lowercase', label: 'aa' },
              { key: 'capitalize', label: 'Aa Bb' },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleTextChange('textTransform', opt.key)}
                className={`px-1 py-2 text-[11px] rounded-lg border transition-colors ${(textData.textTransform || 'none') === opt.key ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">Decoration</label>
          <div className="grid grid-cols-3 gap-1">
            {([
              { key: 'none', label: 'None' },
              { key: 'underline', label: 'Underline' },
              { key: 'line-through', label: 'Strikethrough' },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleTextChange('textDecoration', opt.key)}
                className={`px-1 py-2 text-[11px] rounded-lg border transition-colors ${(textData.textDecoration || 'none') === opt.key ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
