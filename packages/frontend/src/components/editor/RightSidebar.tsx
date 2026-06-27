import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement, TextData, ImageData, ShapeData } from '../../types';
import { COLORS_PALETTE, FONT_FAMILIES, GRADIENT_PRESETS } from '../../utils/cn';
import {
  HiOutlineX, HiOutlineTrash, HiOutlineDuplicate, HiOutlineLockClosed,
  HiOutlineLockOpen, HiOutlineEye, HiOutlineEyeOff,
  HiOutlineArrowUp, HiOutlineArrowDown,
} from 'react-icons/hi';

export default function RightSidebar() {
  const {
    pages, currentPageIndex, selectedElementIds, rightPanelOpen, setRightPanelOpen,
    updateElement, removeElements, duplicateElements, bringForward, sendBackward,
    bringToFront, sendToBack, lockElement, unlockElement, hideElement, showElement,
    pushHistory,
  } = useEditorStore();

  const page = pages[currentPageIndex];
  const selectedElements = page?.elements.filter((e) => selectedElementIds.includes(e.id)) || [];
  const element = selectedElements.length === 1 ? selectedElements[0] : null;

  if (!rightPanelOpen) return null;

  if (!element) {
    return (
      <div className="w-72 bg-white dark:bg-canva-dark-surface border-l border-gray-200 dark:border-canva-dark-border overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white dark:bg-canva-dark-surface border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">Design</span>
          <button onClick={() => setRightPanelOpen(false)} className="toolbar-btn"><HiOutlineX size={16} /></button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            Select an element on the canvas to edit its properties
          </p>
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
            <NumberInput label="W" value={Math.round(element.width)} onChange={(v) => handleUpdate({ width: v })} min={10} />
            <NumberInput label="H" value={Math.round(element.height)} onChange={(v) => handleUpdate({ height: v })} min={10} />
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

        {/* Shape Properties */}
        {element.type === 'shape' && <ShapeProperties element={element} handleDataUpdate={handleDataUpdate} />}

        {/* Shadow */}
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
          <select value={data.fontWeight} onChange={(e) => handleDataUpdate({ fontWeight: Number(e.target.value) })} className="input-field">
            <option value={300}>Light</option>
            <option value={400}>Regular</option>
            <option value={500}>Medium</option>
            <option value={600}>Semi Bold</option>
            <option value={700}>Bold</option>
            <option value={800}>Extra Bold</option>
          </select>
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
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              key={align}
              onClick={() => handleDataUpdate({ textAlign: align })}
              className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] ${data.textAlign === align ? 'bg-canva-purple text-white border-canva-purple' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              {align === 'left' ? '⫷' : align === 'center' ? '☰' : '⫸'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Slider label="Line H" value={data.lineHeight} onChange={(v) => handleDataUpdate({ lineHeight: v })} min={0.5} max={3} step={0.1} />
          <Slider label="Spacing" value={data.letterSpacing} onChange={(v) => handleDataUpdate({ letterSpacing: v })} min={-5} max={20} />
        </div>
      </Section>
      <Section title="Text Color">
        <ColorPicker value={data.color} onChange={(v) => handleDataUpdate({ color: v })} />
      </Section>
    </>
  );
}

function ImageProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as ImageData;
  return (
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
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-gray-500 w-8 flex-shrink-0">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        className="w-full px-2 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white"
      />
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const [showPalette, setShowPalette] = useState(false);

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
      </div>
      {showPalette && (
        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="grid grid-cols-10 gap-1 mb-2">
            {COLORS_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => { onChange(color); setShowPalette(false); }}
                className="w-5 h-5 rounded border border-gray-200 dark:border-gray-600 hover:scale-125 transition-transform"
                style={{ backgroundColor: color }}
              />
            ))}
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
