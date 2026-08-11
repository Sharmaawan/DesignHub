import { useState, useRef, useEffect, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement, TextData, ImageData, ShapeData, TableData, ChartData, IconData, VideoData, AudioData } from '../../types';
import { COLORS_PALETTE, FONT_FAMILIES, FONT_WEIGHT_MAP, FONT_WEIGHT_LABELS, GRADIENT_PRESETS } from '../../utils/cn';
import { hsvToHex, hexToHsv, isPlainHexColor, getDocumentColors, getPagePhotoSources, extractPhotoColors } from '../../utils/colorTools';
import { uploadAPI, BACKEND_ORIGIN as BACKEND } from '../../utils/api';
import {
  HiOutlineX, HiOutlineTrash, HiOutlineDuplicate, HiOutlineLockClosed,
  HiOutlineLockOpen, HiOutlineEye, HiOutlineEyeOff,
  HiOutlineArrowUp, HiOutlineArrowDown, HiOutlinePlus, HiOutlineMinus,
  HiOutlinePhotograph, HiOutlineAdjustments,
  HiOutlineArrowLeft, HiOutlineArrowRight,
  HiOutlineTemplate, HiOutlineCog, HiOutlineChevronDown, HiOutlineChevronUp,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

export default function RightSidebar() {
  const {
    pages, currentPageIndex, selectedElementIds, rightPanelOpen, setRightPanelOpen,
    updateElement, removeElements, duplicateElements, bringForward, sendBackward,
    bringToFront, sendToBack, lockElement, unlockElement, hideElement, showElement,
    pushHistory, setPageBackgroundColor, updatePage, duplicatePage, removePage,
    clearPageBackgroundImage,
    showGrid, showRulers, showGuides, snapEnabled, gridSize,
    toggleGrid, toggleRulers, toggleGuides, toggleSnap, setGridSize,
  } = useEditorStore();
  const [showColorSwatches, setShowColorSwatches] = useState(false);

  const page = pages[currentPageIndex];
  const selectedElements = page?.elements.filter((e) => selectedElementIds.includes(e.id)) || [];
  const element = selectedElements.length === 1 ? selectedElements[0] : null;

  // Closing via the X used to unmount this entirely with nothing left anywhere to
  // bring it back — selecting an existing element doesn't reopen it (only adding a
  // brand-new one does), so it stayed gone for the rest of the session. This narrow
  // strip is the one persistent, always-clickable way back in, same idea as the left
  // sidebar's icon rail staying up when its own panel collapses.
  if (!rightPanelOpen) {
    return (
      <button
        onClick={() => setRightPanelOpen(true)}
        title="Show design panel"
        className="w-6 flex-shrink-0 bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
      >
        <HiOutlineArrowLeft size={14} className="text-gray-400" />
      </button>
    );
  }

  // Nothing selected — the page's own background isn't a clickable canvas element (it's
  // a page property, not a shape), so clicking empty canvas can never "select" it. Show
  // its controls here instead, the same way Canva surfaces page-level properties when
  // nothing else is selected — otherwise there's no way to discover how to change it.
  if (!element) {
    return (
      <div className="w-72 bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white dark:bg-canva-dark-surface border-b border-gray-100 dark:border-gray-800 px-5 py-3.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Design</span>
          <button onClick={() => setRightPanelOpen(false)} className="toolbar-btn"><HiOutlineX size={16} /></button>
        </div>
        <div className="p-5 space-y-6">
          <p className="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
            Click any text, shape, or image on the canvas to edit it. Nothing selected right now, so here's the page itself:
          </p>
          {page && (
            <>
              {/* Quick page actions */}
              <div className="flex items-center gap-1.5">
                <button onClick={() => duplicatePage(currentPageIndex)} className="toolbar-btn flex-1 flex items-center justify-center gap-1.5 text-xs font-medium" title="Duplicate page">
                  <HiOutlineDuplicate size={14} /> Duplicate page
                </button>
                <button
                  onClick={() => { if (pages.length > 1) removePage(currentPageIndex); else toast.error("Can't delete the only page"); }}
                  className="toolbar-btn text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete page"
                >
                  <HiOutlineTrash size={14} />
                </button>
              </div>

              <Section title="Page">
                <label className="text-xs text-gray-500 mb-1 block">Page name</label>
                <input
                  type="text"
                  value={page.name}
                  onChange={(e) => updatePage(currentPageIndex, { name: e.target.value })}
                  onBlur={() => pushHistory()}
                  className="input-field text-sm"
                />
              </Section>

              <Section title="Page Size">
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput
                    label="W" value={Math.round(page.width)} min={100} max={8000}
                    onChange={(v) => { updatePage(currentPageIndex, { width: Math.max(100, v) }); pushHistory(); }}
                  />
                  <NumberInput
                    label="H" value={Math.round(page.height)} min={100} max={8000}
                    onChange={(v) => { updatePage(currentPageIndex, { height: Math.max(100, v) }); pushHistory(); }}
                  />
                </div>
              </Section>

              <Section title="Page Background">
                {page.backgroundImage && (
                  <div className="mb-3 flex items-center gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <img
                      src={page.backgroundImage.src}
                      alt="Background"
                      className="w-10 h-10 rounded object-cover flex-shrink-0"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 truncate">Background image</span>
                    <button
                      onClick={() => clearPageBackgroundImage(currentPageIndex)}
                      title="Remove background image"
                      className="toolbar-btn text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
                    >
                      <HiOutlineTrash size={14} />
                    </button>
                  </div>
                )}
                <ColorPicker
                  label="Background color"
                  value={/^#/.test(page.backgroundColor) ? page.backgroundColor : '#FFFFFF'}
                  onChange={(v) => setPageBackgroundColor(currentPageIndex, v)}
                />
                <button
                  onClick={() => setShowColorSwatches((s) => !s)}
                  className="mt-3 w-full flex items-center justify-between text-xs text-gray-500 hover:text-canva-purple transition-colors"
                >
                  <span>More colors &amp; gradients</span>
                  {showColorSwatches ? <HiOutlineChevronUp size={14} /> : <HiOutlineChevronDown size={14} />}
                </button>
                {showColorSwatches && (
                  <div className="mt-2">
                    <div className="grid grid-cols-9 gap-1.5">
                      {COLORS_PALETTE.map((color) => (
                        <button key={color} style={{ background: color }}
                          onClick={() => setPageBackgroundColor(currentPageIndex, color)}
                          className="w-6 h-6 rounded border border-gray-200 dark:border-gray-700 hover:scale-110 hover:ring-2 hover:ring-canva-purple transition-all" title={color} />
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {GRADIENT_PRESETS.map((g, i) => (
                        <button key={i} style={{ background: g }}
                          onClick={() => setPageBackgroundColor(currentPageIndex, g)}
                          className="h-9 rounded-lg hover:ring-2 hover:ring-canva-purple transition-all" />
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Canvas Settings">
                {[
                  { label: 'Show grid', on: showGrid, toggle: toggleGrid },
                  { label: 'Show rulers', on: showRulers, toggle: toggleRulers },
                  { label: 'Show guides', on: showGuides, toggle: toggleGuides },
                  { label: 'Snap to grid', on: snapEnabled, toggle: toggleSnap },
                ].map((s) => (
                  <label key={s.label} className="flex items-center justify-between py-2 cursor-pointer">
                    <span className="text-xs text-gray-600 dark:text-gray-400">{s.label}</span>
                    <button
                      onClick={s.toggle}
                      className={`w-9 h-5 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${s.on ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${s.on ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </label>
                ))}
                <div className="mt-3">
                  <NumberInput label="Grid size" value={gridSize} min={2} max={200} onChange={(v) => setGridSize(v)} />
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    );
  }

  const handleUpdate = (data: Partial<CanvasElement>) => {
    updateElement(element.id, data);
    pushHistory();
  };

  const handleDataUpdate = (data: Record<string, unknown>) => {
    updateElement(element.id, {
      data: { ...element.data, ...data } as any,
    });
    pushHistory();
  };

  return (
    <div className="w-72 bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border overflow-y-auto">
      <div className="sticky top-0 z-10 bg-white dark:bg-canva-dark-surface border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{element.type}</span>
          <span className="text-xs text-gray-400">Properties</span>
        </div>
        <button onClick={() => setRightPanelOpen(false)} className="toolbar-btn"><HiOutlineX size={16} /></button>
      </div>

      {/* Quick Actions */}
      <div className="p-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1">
          <button onClick={() => duplicateElements([element.id])} className="toolbar-btn flex-1 flex items-center justify-center gap-1 text-xs" title="Duplicate">
            <HiOutlineDuplicate size={14} /> Copy
          </button>
          <button
            onClick={() => element.locked ? unlockElement(element.id) : lockElement(element.id)}
            className="toolbar-btn" title={element.locked ? 'Unlock' : 'Lock'}
          >
            {element.locked ? <HiOutlineLockClosed size={14} /> : <HiOutlineLockOpen size={14} />}
          </button>
          <button
            onClick={() => element.visible ? hideElement(element.id) : showElement(element.id)}
            className="toolbar-btn" title={element.visible ? 'Hide' : 'Show'}
          >
            {element.visible ? <HiOutlineEye size={14} /> : <HiOutlineEyeOff size={14} />}
          </button>
          <button onClick={() => sendBackward(element.id)} className="toolbar-btn" title="Send backward">
            <HiOutlineArrowDown size={14} />
          </button>
          <button onClick={() => bringForward(element.id)} className="toolbar-btn" title="Bring forward">
            <HiOutlineArrowUp size={14} />
          </button>
          <button onClick={() => removeElements([element.id])} className="toolbar-btn text-red-500 hover:text-red-600" title="Delete">
            <HiOutlineTrash size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Position & Size */}
        <Section title="Position & Size">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="X" value={Math.round(element.x)} onChange={(v) => handleUpdate({ x: v })} />
            <NumberInput label="Y" value={Math.round(element.y)} onChange={(v) => handleUpdate({ y: v })} />
            <NumberInput label="W" value={Math.round(element.width)} onChange={(v) => handleUpdate({ width: Math.max(20, v) })} min={20} />
            <NumberInput label="H" value={Math.round(element.height)} onChange={(v) => handleUpdate({ height: Math.max(20, v) })} min={20} />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <NumberInput label="Rotate" value={Math.round(element.rotation)} onChange={(v) => handleUpdate({ rotation: v })} min={0} max={360} />
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Opacity</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(element.opacity * 100)}
                  onChange={(e) => handleUpdate({ opacity: Number(e.target.value) / 100 })}
                  className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-canva-purple"
                />
                <span className="text-xs text-gray-400 w-8 text-right">{Math.round(element.opacity * 100)}%</span>
              </div>
            </div>
          </div>
        </Section>

        {/* Text Properties */}
        {element.type === 'text' && <TextProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Image Properties */}
        {element.type === 'image' && <ImageProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Video Properties */}
        {element.type === 'video' && <VideoProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Audio Properties */}
        {element.type === 'audio' && <AudioProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Shape Properties */}
        {element.type === 'shape' && <ShapeProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Icon Properties */}
        {element.type === 'icon' && <IconProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Table Properties */}
        {element.type === 'table' && <TableProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Chart Properties */}
        {element.type === 'chart' && <ChartProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Shadow — general (hidden for text, handled in TextProperties) */}
        {element.type !== 'text' && (
          <Section title="Shadow">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!element.shadow}
                onChange={(e) => handleUpdate({
                  shadow: e.target.checked ? { color: '#000000', blur: 8, offsetX: 2, offsetY: 2, opacity: 0.3 } : undefined,
                })}
                className="w-4 h-4 rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Drop shadow</span>
            </label>
            {element.shadow && (
              <div className="space-y-2 mt-3 ml-6">
                <ColorPicker value={element.shadow.color} onChange={(v) => handleUpdate({ shadow: { ...element.shadow!, color: v } })} />
                <Slider label="Blur" value={element.shadow.blur} onChange={(v) => handleUpdate({ shadow: { ...element.shadow!, blur: v } })} min={0} max={100} />
                <div className="grid grid-cols-2 gap-2">
                  <NumberInput label="X" value={element.shadow.offsetX} onChange={(v) => handleUpdate({ shadow: { ...element.shadow!, offsetX: v } })} min={-50} max={50} />
                  <NumberInput label="Y" value={element.shadow.offsetY} onChange={(v) => handleUpdate({ shadow: { ...element.shadow!, offsetY: v } })} min={-50} max={50} />
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Layer Name */}
        <Section title="Layer">
          <input
            type="text"
            value={element.name}
            onChange={(e) => handleUpdate({ name: e.target.value })}
            className="input-field"
          />
        </Section>
      </div>
    </div>
  );
}

function TextProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as TextData;
  const availableWeights = FONT_WEIGHT_MAP[data.fontFamily] || [400, 700];
  const setElementAnimation = useEditorStore((s) => s.setElementAnimation);
  const pushHistory = useEditorStore((s) => s.pushHistory);
  const currentAnimation = element.animation || { type: 'none' as const, duration: 0.5, delay: 0 };

  return (
    <>
      <Section title="Text">
        <select
          value={data.fontFamily}
          onChange={(e) => handleDataUpdate({ fontFamily: e.target.value })}
          className="input-field mb-2"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Size" value={data.fontSize} onChange={(v) => handleDataUpdate({ fontSize: v })} min={8} max={400} />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Weight</label>
            <select
              value={data.fontWeight}
              onChange={(e) => handleDataUpdate({ fontWeight: Number(e.target.value) })}
              className="input-field"
            >
              {availableWeights.map((w) => (
                <option key={w} value={w}>{FONT_WEIGHT_LABELS[w] || w}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2">
          <button
            onClick={() => handleDataUpdate({ fontStyle: data.fontStyle === 'italic' ? 'normal' : 'italic' })}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-serif italic ${data.fontStyle === 'italic' ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            I
          </button>
          <button
            onClick={() => handleDataUpdate({ textDecoration: data.textDecoration === 'underline' ? 'none' : 'underline' })}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm underline ${data.textDecoration === 'underline' ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            U
          </button>
          <button
            onClick={() => handleDataUpdate({ textDecoration: data.textDecoration === 'line-through' ? 'none' : 'line-through' })}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center text-sm line-through ${data.textDecoration === 'line-through' ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            S
          </button>
          <div className="h-6 w-px bg-gray-200 dark:bg-gray-700 mx-1" />
          {(['left', 'center', 'right', 'justify'] as const).map((align) => (
            <button
              key={align}
              onClick={() => handleDataUpdate({ textAlign: align })}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] ${data.textAlign === align ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {align === 'left' ? '⫷' : align === 'center' ? '☰' : align === 'right' ? '⫸' : '☱'}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <Slider label="Line H" value={data.lineHeight} onChange={(v) => handleDataUpdate({ lineHeight: v })} min={0.5} max={3} step={0.1} />
          <Slider label="Spacing" value={data.letterSpacing} onChange={(v) => handleDataUpdate({ letterSpacing: v })} min={-5} max={20} />
        </div>
      </Section>
      <Section title="Typography">
        <label className="text-xs text-gray-500 mb-1 block">Text case</label>
        <div className="grid grid-cols-4 gap-1 mb-3">
          {([
            { v: 'none', label: 'Aa' },
            { v: 'uppercase', label: 'AA' },
            { v: 'lowercase', label: 'aa' },
            { v: 'capitalize', label: 'Aa Bb' },
          ] as const).map((opt) => (
            <button
              key={opt.v}
              onClick={() => handleDataUpdate({ textTransform: opt.v })}
              className={`h-8 rounded-lg border text-[10px] font-medium transition-colors ${(data.textTransform || 'none') === opt.v ? 'border-canva-purple bg-canva-purple/10 text-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!data.outline}
            onChange={(e) => handleDataUpdate({ outline: e.target.checked ? { color: '#000000', width: 2 } : undefined })}
            className="w-4 h-4 rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Text outline</span>
        </label>
        {data.outline && (
          <div className="space-y-2 mt-3 ml-6">
            <ColorPicker label="Color" value={data.outline.color} onChange={(v) => handleDataUpdate({ outline: { ...data.outline!, color: v } })} />
            <Slider label="Width" value={data.outline.width} onChange={(v) => handleDataUpdate({ outline: { ...data.outline!, width: v } })} min={0} max={20} />
          </div>
        )}
        <div className="mt-3">
          <Slider label="Curve" value={data.curvature || 0} onChange={(v) => handleDataUpdate({ curvature: v })} min={-100} max={100} />
          <p className="text-[10px] text-gray-400 mt-0.5">Bends text along an arc — positive arches up, negative dips down.</p>
        </div>
      </Section>
      <Section title="Text Color">
        <ColorPicker value={data.color} onChange={(v) => handleDataUpdate({ color: v })} />
      </Section>
      <Section title="Text Shadow">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!element.shadow}
            onChange={(e) => {
              if (e.target.checked) {
                useEditorStore.getState().updateElement(element.id, {
                  shadow: { color: '#000000', blur: 4, offsetX: 2, offsetY: 2, opacity: 0.5 },
                });
              } else {
                useEditorStore.getState().updateElement(element.id, { shadow: undefined });
              }
              useEditorStore.getState().pushHistory();
            }}
            className="w-4 h-4 rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Enable shadow</span>
        </label>
        {element.shadow && (
          <div className="space-y-2 mt-3 ml-6">
            <ColorPicker
              label="Color"
              value={element.shadow.color}
              onChange={(v) => {
                useEditorStore.getState().updateElement(element.id, { shadow: { ...element.shadow!, color: v } });
                useEditorStore.getState().pushHistory();
              }}
            />
            <Slider
              label="Blur"
              value={element.shadow.blur}
              onChange={(v) => {
                useEditorStore.getState().updateElement(element.id, { shadow: { ...element.shadow!, blur: v } });
                useEditorStore.getState().pushHistory();
              }}
              min={0} max={100}
            />
            <Slider
              label="Opacity"
              value={element.shadow.opacity ?? 0.5}
              onChange={(v) => {
                useEditorStore.getState().updateElement(element.id, { shadow: { ...element.shadow!, opacity: v } });
                useEditorStore.getState().pushHistory();
              }}
              min={0} max={1} step={0.05}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberInput
                label="X"
                value={element.shadow.offsetX}
                onChange={(v) => {
                  useEditorStore.getState().updateElement(element.id, { shadow: { ...element.shadow!, offsetX: v } });
                  useEditorStore.getState().pushHistory();
                }}
                min={-50} max={50}
              />
              <NumberInput
                label="Y"
                value={element.shadow.offsetY}
                onChange={(v) => {
                  useEditorStore.getState().updateElement(element.id, { shadow: { ...element.shadow!, offsetY: v } });
                  useEditorStore.getState().pushHistory();
                }}
                min={-50} max={50}
              />
            </div>
          </div>
        )}
      </Section>
      <Section title="Text Animation">
        <select
          value={currentAnimation.type}
          onChange={(e) => {
            setElementAnimation(element.id, { ...currentAnimation, type: e.target.value as any });
            pushHistory();
          }}
          className="input-field"
        >
          <option value="none">— No animation</option>
          <option value="typewriter">⌨️ Typewriter</option>
          <option value="fadeIn">🌅 Fade In</option>
          <option value="rise">⬆️ Rise</option>
          <option value="slide">➡️ Slide</option>
          <option value="bounce">⚡ Bounce</option>
          <option value="pop">💥 Pop</option>
          <option value="zoom">🔍 Zoom</option>
          <option value="rotate">🔄 Rotate</option>
          <option value="pulse">💓 Pulse</option>
        </select>
        {currentAnimation.type !== 'none' && (
          <p className="text-[10px] text-gray-400 mt-1">
            Plays when this scene loads. For duration/delay/direction, open "Animate" from the toolbar above the canvas.
          </p>
        )}
      </Section>
    </>
  );
}

function ImageProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as ImageData;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectRatios = [
    { label: 'Free', ratio: null },
    { label: '1:1', ratio: 1 },
    { label: '4:3', ratio: 4 / 3 },
    { label: '16:9', ratio: 16 / 9 },
    { label: '3:2', ratio: 3 / 2 },
    { label: '9:16', ratio: 9 / 16 },
  ];

  const roundedCorners = [
    { label: '0px', value: 0 },
    { label: '4px', value: 4 },
    { label: '8px', value: 8 },
    { label: '12px', value: 12 },
    { label: '16px', value: 16 },
    { label: '24px', value: 24 },
    { label: 'Circle', value: 9999 },
  ];

  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      handleDataUpdate({ src });
      toast.success('Image replaced!');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <>
      <Section title="Image Adjustments">
        <Slider label="Brightness" value={data.brightness} onChange={(v) => handleDataUpdate({ brightness: v })} min={0} max={200} />
        <Slider label="Contrast" value={data.contrast} onChange={(v) => handleDataUpdate({ contrast: v })} min={0} max={200} />
        <Slider label="Saturation" value={data.saturation} onChange={(v) => handleDataUpdate({ saturation: v })} min={0} max={200} />
        <Slider label="Hue" value={data.hue} onChange={(v) => handleDataUpdate({ hue: v })} min={0} max={360} />
        <Slider label="Blur" value={data.blur} onChange={(v) => handleDataUpdate({ blur: v })} min={0} max={20} />
        <NumberInput label="Radius" value={data.borderRadius} onChange={(v) => handleDataUpdate({ borderRadius: v })} min={0} max={500} />
        <div className="grid grid-cols-4 gap-1 mt-2">
          {[0, 8, 16, 999].map((r) => (
            <button
              key={r}
              onClick={() => handleDataUpdate({ borderRadius: r })}
              className={`h-8 rounded-lg border flex items-center justify-center ${data.borderRadius === r ? 'border-canva-purple bg-canva-purple/10' : 'border-gray-200 dark:border-gray-700'}`}
            >
              <div className="w-4 h-4 bg-gray-400" style={{ borderRadius: r }} />
            </button>
          ))}
        </div>
      </Section>

      {/* Image Editing */}
      <div className="h-px bg-gray-200 dark:bg-gray-700 my-4" />

      <Section title="Image Editing">
        <div className="mb-3">
          <FlipControls data={data} handleDataUpdate={handleDataUpdate} />
        </div>

        {/* Aspect Ratio */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">Aspect Ratio</label>
          <div className="grid grid-cols-6 gap-1">
            {aspectRatios.map((ar) => (
              <button
                key={ar.label}
                onClick={() => {
                  if (ar.ratio === null) return;
                  const maxDim = Math.max(element.width, element.height);
                  let newW: number;
                  let newH: number;
                  if (ar.ratio >= 1) {
                    newW = maxDim;
                    newH = Math.round(maxDim / ar.ratio);
                  } else {
                    newH = maxDim;
                    newW = Math.round(maxDim * ar.ratio);
                  }
                  useEditorStore.getState().updateElement(element.id, { width: newW, height: newH });
                  useEditorStore.getState().pushHistory();
                }}
                className={`h-8 rounded-lg border flex items-center justify-center text-[10px] font-medium transition-colors ${
                  ar.ratio === null
                    ? 'border-canva-purple bg-canva-purple/10 text-canva-purple'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>

        {/* Replace Image */}
        <div className="mb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleReplaceImage}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <HiOutlinePhotograph size={14} /> Replace Image
          </button>
        </div>

        {/* Crop — percentages of the source image; 0/0/100/100 is uncropped */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-gray-500 flex items-center gap-1"><HiOutlineAdjustments size={13} /> Crop</label>
            <button
              onClick={() => handleDataUpdate({ cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 })}
              className="text-[10px] text-gray-400 hover:text-canva-purple"
            >
              Reset
            </button>
          </div>
          <Slider label="Left" value={(data as any).cropX ?? 0} onChange={(v) => handleDataUpdate({ cropX: Math.min(v, 100 - ((data as any).cropWidth ?? 100)) })} min={0} max={99} />
          <Slider label="Top" value={(data as any).cropY ?? 0} onChange={(v) => handleDataUpdate({ cropY: Math.min(v, 100 - ((data as any).cropHeight ?? 100)) })} min={0} max={99} />
          <Slider label="Width" value={(data as any).cropWidth ?? 100} onChange={(v) => handleDataUpdate({ cropWidth: Math.min(v, 100 - ((data as any).cropX ?? 0)) })} min={1} max={100} />
          <Slider label="Height" value={(data as any).cropHeight ?? 100} onChange={(v) => handleDataUpdate({ cropHeight: Math.min(v, 100 - ((data as any).cropY ?? 0)) })} min={1} max={100} />
        </div>

        {/* Rounded Corners */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Rounded Corners</label>
          <div className="grid grid-cols-7 gap-1">
            {roundedCorners.map((rc) => (
              <button
                key={rc.label}
                onClick={() => handleDataUpdate({ borderRadius: rc.value })}
                className={`h-8 rounded-lg border flex items-center justify-center text-[10px] font-medium transition-colors ${
                  data.borderRadius === rc.value
                    ? 'border-canva-purple bg-canva-purple/10 text-canva-purple'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {rc.label}
              </button>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}

function VideoProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as VideoData;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleReplaceVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('video/')) { toast.error('Choose a video file'); return; }
    setUploading(true);
    try {
      const { data: uploaded } = await uploadAPI.upload(file);
      handleDataUpdate({ src: `${BACKEND}${uploaded.url}` });
      toast.success('Video replaced!');
    } catch {
      toast.error('Failed to upload video');
    } finally {
      setUploading(false);
    }
  };

  const toggleRow = (label: string, checked: boolean, onToggle: () => void) => (
    <label className="flex items-center justify-between py-1.5 cursor-pointer">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        onClick={onToggle}
        className={`w-9 h-5 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${checked ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </button>
    </label>
  );

  const playbackRates = [0.25, 0.5, 1, 1.5, 2];

  return (
    <>
      <Section title="Video">
        {toggleRow('Autoplay', data.autoplay ?? true, () => handleDataUpdate({ autoplay: !(data.autoplay ?? true) }))}
        {toggleRow('Loop', data.loop ?? true, () => handleDataUpdate({ loop: !(data.loop ?? true) }))}
        {toggleRow('Muted', data.muted ?? true, () => handleDataUpdate({ muted: !(data.muted ?? true) }))}
        {toggleRow('Reverse', data.reverse ?? false, () => handleDataUpdate({ reverse: !(data.reverse ?? false) }))}

        <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleReplaceVideo} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <HiOutlinePhotograph size={14} /> {uploading ? 'Uploading…' : 'Replace Video'}
        </button>
      </Section>

      <div className="h-px bg-gray-200 dark:bg-gray-700 my-4" />

      <Section title="Trim">
        <div className="flex items-center gap-2">
          <NumberInput
            label="In"
            value={data.startTime || 0}
            onChange={(v) => handleDataUpdate({ startTime: Math.max(0, Math.min(v, (data.endTime || v) - 0.1)) })}
            min={0}
          />
          <NumberInput
            label="Out"
            value={data.endTime || 0}
            onChange={(v) => handleDataUpdate({ endTime: Math.max((data.startTime || 0) + 0.1, v) })}
            min={0.1}
          />
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5">Seconds into the source clip — the video plays only between these two points.</p>
      </Section>

      <div className="h-px bg-gray-200 dark:bg-gray-700 my-4" />

      <Section title="Video Adjustments">
        <Slider label="Volume" value={Math.round((data.volume ?? 1) * 100)} onChange={(v) => handleDataUpdate({ volume: v / 100 })} min={0} max={100} />
        <Slider label="Brightness" value={data.brightness ?? 100} onChange={(v) => handleDataUpdate({ brightness: v })} min={0} max={200} />
        <Slider label="Contrast" value={data.contrast ?? 100} onChange={(v) => handleDataUpdate({ contrast: v })} min={0} max={200} />
        <NumberInput label="Radius" value={data.borderRadius ?? 0} onChange={(v) => handleDataUpdate({ borderRadius: v })} min={0} max={500} />

        <div className="flex items-center gap-2 mb-2 mt-2">
          <label className="text-xs text-gray-500 w-14 flex-shrink-0">Speed</label>
          <div className="grid grid-cols-5 gap-1 flex-1">
            {playbackRates.map((r) => (
              <button
                key={r}
                onClick={() => handleDataUpdate({ playbackRate: r })}
                className={`h-7 rounded-md border text-[10px] font-medium transition-colors ${
                  (data.playbackRate ?? 1) === r
                    ? 'border-canva-purple bg-canva-purple/10 text-canva-purple'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {r}x
              </button>
            ))}
          </div>
        </div>
      </Section>

      <div className="h-px bg-gray-200 dark:bg-gray-700 my-4" />

      <Section title="Video Editing">
        <div className="mb-3">
          <FlipControls data={data} handleDataUpdate={handleDataUpdate} />
        </div>

        {/* Crop — percentages of the source video; 0/0/100/100 is uncropped, same
            convention ImageProperties already uses for cropX/Y/Width/Height. */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-gray-500 flex items-center gap-1"><HiOutlineAdjustments size={13} /> Crop</label>
            <button
              onClick={() => handleDataUpdate({ cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 })}
              className="text-[10px] text-gray-400 hover:text-canva-purple"
            >
              Reset
            </button>
          </div>
          <Slider label="Left" value={data.cropX ?? 0} onChange={(v) => handleDataUpdate({ cropX: Math.min(v, 100 - (data.cropWidth ?? 100)) })} min={0} max={99} />
          <Slider label="Top" value={data.cropY ?? 0} onChange={(v) => handleDataUpdate({ cropY: Math.min(v, 100 - (data.cropHeight ?? 100)) })} min={0} max={99} />
          <Slider label="Width" value={data.cropWidth ?? 100} onChange={(v) => handleDataUpdate({ cropWidth: Math.min(v, 100 - (data.cropX ?? 0)) })} min={1} max={100} />
          <Slider label="Height" value={data.cropHeight ?? 100} onChange={(v) => handleDataUpdate({ cropHeight: Math.min(v, 100 - (data.cropY ?? 0)) })} min={1} max={100} />
        </div>
      </Section>
    </>
  );
}

function AudioProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as AudioData;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleReplaceAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) { toast.error('Choose an audio file'); return; }
    setUploading(true);
    try {
      const { data: uploaded } = await uploadAPI.upload(file);
      handleDataUpdate({ src: `${BACKEND}${uploaded.url}` });
      toast.success('Audio replaced!');
    } catch {
      toast.error('Failed to upload audio');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="Audio">
      <Slider label="Volume" value={Math.round((data.volume ?? 1) * 100)} onChange={(v) => handleDataUpdate({ volume: v / 100 })} min={0} max={100} />
      <label className="flex items-center justify-between py-1.5 cursor-pointer">
        <span className="text-sm text-gray-700 dark:text-gray-300">Loop</span>
        <button
          onClick={() => handleDataUpdate({ loop: !(data.loop ?? false) })}
          className={`w-9 h-5 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${(data.loop ?? false) ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${(data.loop ?? false) ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </label>
      <label className="flex items-center justify-between py-1.5 cursor-pointer">
        <span className="text-sm text-gray-700 dark:text-gray-300">Muted</span>
        <button
          onClick={() => handleDataUpdate({ muted: !(data.muted ?? false) })}
          className={`w-9 h-5 rounded-full transition-colors duration-200 relative cursor-pointer flex-shrink-0 ${(data.muted ?? false) ? 'bg-canva-purple' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${(data.muted ?? false) ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </label>

      <div className="h-px bg-gray-200 dark:bg-gray-700 my-3" />
      <NumberInput label="Fade In (s)" value={data.fadeIn ?? 0} onChange={(v) => handleDataUpdate({ fadeIn: v })} min={0} max={10} />
      <NumberInput label="Fade Out (s)" value={data.fadeOut ?? 0} onChange={(v) => handleDataUpdate({ fadeOut: v })} min={0} max={10} />

      <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleReplaceAudio} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
      >
        <HiOutlinePhotograph size={14} /> {uploading ? 'Uploading…' : 'Replace Audio'}
      </button>
    </Section>
  );
}

function FlipControls({ data, handleDataUpdate }: { data: any; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const flipH = !!data.flipH;
  const flipV = !!data.flipV;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-14 flex-shrink-0">Flip</span>
      <button
        onClick={() => handleDataUpdate({ flipH: !flipH })}
        className={`flex-1 h-8 rounded-lg border flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
          flipH ? 'border-canva-purple bg-canva-purple/10 text-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
        title="Flip Horizontal"
      >
        <HiOutlineArrowRight size={14} /> H
      </button>
      <button
        onClick={() => handleDataUpdate({ flipV: !flipV })}
        className={`flex-1 h-8 rounded-lg border flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
          flipV ? 'border-canva-purple bg-canva-purple/10 text-canva-purple' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
        title="Flip Vertical"
      >
        <HiOutlineArrowDown size={14} /> V
      </button>
    </div>
  );
}

function ShapeProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as ShapeData;
  return (
    <Section title="Shape Style">
      <ColorPicker label="Fill" value={data.fill === 'transparent' ? '#000000' : data.fill} onChange={(v) => handleDataUpdate({ fill: v })} />
      <div className="mt-3">
        <ColorPicker label="Stroke" value={data.stroke === 'transparent' ? '#000000' : data.stroke} onChange={(v) => handleDataUpdate({ stroke: v })} />
      </div>
      <NumberInput label="Stroke W" value={data.strokeWidth} onChange={(v) => handleDataUpdate({ strokeWidth: v })} min={0} max={50} />
      <NumberInput label="Corner R" value={data.cornerRadius} onChange={(v) => handleDataUpdate({ cornerRadius: v })} min={0} max={500} />
      <div className="mt-3">
        <FlipControls data={data} handleDataUpdate={handleDataUpdate} />
      </div>
    </Section>
  );
}

function IconProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as IconData;
  return (
    <Section title="Icon Style">
      <ColorPicker label="Recolor" value={data.fill || '#000000'} onChange={(v) => handleDataUpdate({ fill: v })} />
      <p className="text-[10px] text-gray-400 mt-2 mb-3">
        Only applies to single-color paths — multi-color icons keep their original per-path colors.
      </p>
      <FlipControls data={data} handleDataUpdate={handleDataUpdate} />
    </Section>
  );
}

function TableProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as TableData;
  const { rows, cols, cells } = data;

  const updateCell = (row: number, col: number, value: string) => {
    const newCells = cells.map((r) => [...r]);
    while (newCells.length <= row) newCells.push(Array(cols).fill(''));
    while (newCells[row].length <= col) newCells[row].push('');
    newCells[row][col] = value;
    handleDataUpdate({ cells: newCells });
  };

  const addRow = () => {
    const newCells = [...cells, Array(cols).fill('')];
    handleDataUpdate({ cells: newCells, rows: rows + 1 });
  };

  const removeRow = () => {
    if (rows <= 1) return;
    const newCells = cells.slice(0, -1);
    handleDataUpdate({ cells: newCells, rows: rows - 1 });
  };

  const addCol = () => {
    const newCells = cells.map((r) => [...r, '']);
    handleDataUpdate({ cells: newCells, cols: cols + 1 });
  };

  const removeCol = () => {
    if (cols <= 1) return;
    const newCells = cells.map((r) => r.slice(0, -1));
    handleDataUpdate({ cells: newCells, cols: cols - 1 });
  };

  return (
    <>
      <Section title="Table Structure">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-gray-500 w-12">Rows</span>
            <button onClick={removeRow} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700"><HiOutlineMinus size={12} /></button>
            <span className="text-sm font-medium text-gray-900 dark:text-white w-6 text-center">{rows}</span>
            <button onClick={addRow} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700"><HiOutlinePlus size={12} /></button>
          </div>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-gray-500 w-12">Cols</span>
            <button onClick={removeCol} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700"><HiOutlineMinus size={12} /></button>
            <span className="text-sm font-medium text-gray-900 dark:text-white w-6 text-center">{cols}</span>
            <button onClick={addCol} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700"><HiOutlinePlus size={12} /></button>
          </div>
        </div>
      </Section>

      <Section title="Cell Content">
        <div className="max-h-48 overflow-y-auto space-y-1">
          {cells.map((row, ri) =>
            row.map((cell, ci) => (
              <div key={`${ri}-${ci}`} className="flex items-center gap-1">
                <span className="text-[10px] text-gray-400 w-10 flex-shrink-0">R{ri + 1}C{ci + 1}</span>
                <input
                  type="text"
                  value={cell}
                  onChange={(e) => updateCell(ri, ci, e.target.value)}
                  className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-canva-purple/30 text-gray-900 dark:text-white"
                />
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Table Style">
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={!!data.headerRow}
            onChange={(e) => handleDataUpdate({ headerRow: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Header row</span>
        </label>
        <ColorPicker label="Header BG" value={data.headerBgColor} onChange={(v) => handleDataUpdate({ headerBgColor: v })} />
        <div className="mt-2"><ColorPicker label="Header Text" value={data.headerTextColor} onChange={(v) => handleDataUpdate({ headerTextColor: v })} /></div>
        <div className="mt-2"><ColorPicker label="Cell Text" value={data.cellTextColor} onChange={(v) => handleDataUpdate({ cellTextColor: v })} /></div>
        <div className="mt-2"><ColorPicker label="Border" value={data.borderColor} onChange={(v) => handleDataUpdate({ borderColor: v })} /></div>
      </Section>
    </>
  );
}

function ChartProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const chartData = element.data as ChartData;
  const { chartType, data: items, showLabels, showLegend } = chartData;

  const updateItem = (index: number, field: string, value: string | number) => {
    const newItems = items.map((item: { label: string; value: number; color: string }, i: number) => i === index ? { ...item, [field]: value } : item);
    handleDataUpdate({ data: newItems });
  };

  const addItem = () => {
    const colors = ['#7B2FBE', '#00C4CC', '#FF6B9D', '#FF8A00', '#4CAF50', '#2196F3'];
    const newItems = [...items, { label: `Item ${items.length + 1}`, value: 30, color: colors[items.length % colors.length] }];
    handleDataUpdate({ data: newItems });
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const newItems = items.filter((_: { label: string; value: number; color: string }, i: number) => i !== index);
    handleDataUpdate({ data: newItems });
  };

  return (
    <>
      <Section title="Chart Type">
        <div className="grid grid-cols-2 gap-1">
          {(['bar', 'line', 'pie', 'doughnut'] as const).map((type) => (
            <button
              key={type}
              onClick={() => handleDataUpdate({ chartType: type })}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
                chartType === type
                  ? 'bg-canva-purple text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Data">
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {items.map((item: { label: string; value: number; color: string }, i: number) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="color"
                value={item.color}
                onChange={(e) => updateItem(i, 'color', e.target.value)}
                className="w-6 h-6 rounded border-0 cursor-pointer flex-shrink-0"
              />
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(i, 'label', e.target.value)}
                className="w-16 px-1.5 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-canva-purple/30 text-gray-900 dark:text-white"
                placeholder="Label"
              />
              <input
                type="number"
                value={item.value}
                onChange={(e) => updateItem(i, 'value', Number(e.target.value))}
                className="w-14 px-1.5 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-canva-purple/30 text-gray-900 dark:text-white"
                min={0}
              />
              <button onClick={() => removeItem(i)} className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0">
                <HiOutlineMinus size={12} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={addItem} className="mt-2 w-full py-1.5 text-xs font-medium text-canva-purple bg-canva-purple/10 rounded-lg hover:bg-canva-purple/20 transition-colors flex items-center justify-center gap-1">
          <HiOutlinePlus size={12} /> Add data point
        </button>
      </Section>

      <Section title="Options">
        <label className="flex items-center gap-2 cursor-pointer mb-2">
          <input
            type="checkbox"
            checked={!!showLabels}
            onChange={(e) => handleDataUpdate({ showLabels: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Show labels</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!showLegend}
            onChange={(e) => handleDataUpdate({ showLegend: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Show legend</span>
        </label>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  // Local text buffer instead of a native <input type="number"> — lets someone clear
  // the field and type freely (e.g. "8" then "0") without every keystroke round-tripping
  // through Number() and the browser's own number-input formatting, which is what was
  // producing values like "080" instead of "80".
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    const n = Number(text);
    if (!Number.isNaN(n)) {
      const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
      onChange(clamped);
      setText(String(clamped));
    } else {
      setText(String(value));
    }
  };

  const step = (delta: number) => {
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value + delta));
    onChange(clamped);
  };

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 w-8 flex-shrink-0">{label}</label>
      <div className="relative w-full">
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="w-full pl-2 pr-6 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white"
        />
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex flex-col">
          <button type="button" onClick={() => step(1)} className="text-gray-400 hover:text-canva-purple leading-none"><HiOutlineChevronUp size={10} /></button>
          <button type="button" onClick={() => step(-1)} className="text-gray-400 hover:text-canva-purple leading-none"><HiOutlineChevronDown size={10} /></button>
        </div>
      </div>
    </div>
  );
}

// Small swatch grid, reused for Document colors / Photo colors / Default palette so
// all three sections look and behave identically.
function SwatchGrid({ colors, onPick }: { colors: string[]; onPick: (c: string) => void }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {colors.map((color, i) => (
        <button
          key={`${color}-${i}`}
          onClick={() => onPick(color)}
          title={color}
          className="w-5 h-5 rounded border border-gray-200 dark:border-gray-600 hover:scale-125 transition-transform"
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const { pages, currentPageIndex } = useEditorStore();
  const [showPalette, setShowPalette] = useState(false);
  const [photoColors, setPhotoColors] = useState<string[]>([]);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'sv' | 'hue' | null>(null);

  const page = pages[currentPageIndex];
  const documentColors = useMemo(() => getDocumentColors(pages), [pages]);

  // Photo colors are sampled off-thread-ish (async image decode + canvas read), so only
  // do it while the popover is actually open, and only for photos on the current page.
  useEffect(() => {
    if (!showPalette) return;
    const srcs = getPagePhotoSources(page);
    if (srcs.length === 0) { setPhotoColors([]); return; }
    let cancelled = false;
    (async () => {
      const perPhoto = await Promise.all(srcs.slice(0, 5).map((s) => extractPhotoColors(s)));
      if (!cancelled) setPhotoColors(Array.from(new Set(perPhoto.flat())).slice(0, 12));
    })();
    return () => { cancelled = true; };
  }, [showPalette, page]);

  const hsv = isPlainHexColor(value) ? hexToHsv(value) : null;
  const hue = hsv?.h ?? 0;
  const sat = hsv?.s ?? 1;
  const val = hsv?.v ?? 1;

  const updateFromSvEvent = (clientX: number, clientY: number) => {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    onChange(hsvToHex(hue, x / rect.width, 1 - y / rect.height));
  };
  const updateFromHueEvent = (clientX: number) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    onChange(hsvToHex((x / rect.width) * 360, sat, val));
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (draggingRef.current === 'sv') updateFromSvEvent(e.clientX, e.clientY);
      else if (draggingRef.current === 'hue') updateFromHueEvent(e.clientX);
    };
    const handleUp = () => { draggingRef.current = null; };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hue, sat, val]);

  const supportsEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  const handleEyedropper = async () => {
    try {
      // EyeDropper is a new-ish browser API with no stable TS lib types yet.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dropper = new (window as any).EyeDropper();
      const result = await dropper.open();
      if (result?.sRGBHex) onChange(result.sRGBHex.toUpperCase());
    } catch {
      // User pressed Escape / cancelled the pick — nothing to do.
    }
  };

  return (
    <div>
      {label && <label className="text-xs text-gray-500 mb-1 block">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="w-8 h-8 rounded-lg border-2 border-gray-200 dark:border-gray-700 flex-shrink-0"
          style={{ background: value?.includes?.('gradient') ? '#7B2FBE' : value }}
        />
        <input
          type="text"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white font-mono"
        />
        {supportsEyedropper && (
          <button
            onClick={handleEyedropper}
            title="Pick color from screen"
            className="w-8 h-8 rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-canva-purple hover:border-canva-purple/50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 22l1-4 9.5-9.5" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L15 11l-3-3z" />
            </svg>
          </button>
        )}
      </div>
      {showPalette && (
        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
          <div
            ref={svRef}
            className="relative w-full h-28 rounded cursor-crosshair touch-none"
            style={{
              background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue}, 100%, 50%))`,
            }}
            onPointerDown={(e) => { draggingRef.current = 'sv'; updateFromSvEvent(e.clientX, e.clientY); }}
          >
            <div
              className="absolute w-3 h-3 rounded-full border-2 border-white shadow -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%`, background: value }}
            />
          </div>
          <div
            ref={hueRef}
            className="relative w-full h-3 rounded cursor-pointer touch-none"
            style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
            onPointerDown={(e) => { draggingRef.current = 'hue'; updateFromHueEvent(e.clientX); }}
          >
            <div
              className="absolute top-[-2px] bottom-[-2px] w-1.5 rounded-sm bg-white border border-gray-400 shadow -translate-x-1/2 pointer-events-none"
              style={{ left: `${(hue / 360) * 100}%` }}
            />
          </div>

          {documentColors.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Document colors</div>
              <SwatchGrid colors={documentColors} onPick={(c) => { onChange(c); setShowPalette(false); }} />
            </div>
          )}

          {photoColors.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Photo colors</div>
              <SwatchGrid colors={photoColors} onPick={(c) => { onChange(c); setShowPalette(false); }} />
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Default palette</div>
            <SwatchGrid colors={COLORS_PALETTE} onPick={(c) => { onChange(c); setShowPalette(false); }} />
          </div>

          <div className="flex gap-1">
            {GRADIENT_PRESETS.slice(0, 6).map((g, i) => (
              <button
                key={i}
                onClick={() => { onChange(g); setShowPalette(false); }}
                className="flex-1 h-5 rounded"
                style={{ background: g }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, onChange, min, max, step }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-xs text-gray-500 w-14 flex-shrink-0">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-canva-purple"
      />
      <span className="text-xs text-gray-400 w-8 text-right">{typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}</span>
    </div>
  );
}
