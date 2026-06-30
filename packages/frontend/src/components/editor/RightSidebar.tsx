import { useState, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement, TextData, ImageData, ShapeData, TableData, ChartData } from '../../types';
import { COLORS_PALETTE, FONT_FAMILIES, FONT_WEIGHT_MAP, FONT_WEIGHT_LABELS, GRADIENT_PRESETS } from '../../utils/cn';
import {
  HiOutlineX, HiOutlineTrash, HiOutlineDuplicate, HiOutlineLockClosed,
  HiOutlineLockOpen, HiOutlineEye, HiOutlineEyeOff,
  HiOutlineArrowUp, HiOutlineArrowDown, HiOutlinePlus, HiOutlineMinus,
  HiOutlinePhotograph, HiOutlineAdjustments,
  HiOutlineArrowLeft, HiOutlineArrowRight,
  HiOutlineTemplate, HiOutlineCog,
} from 'react-icons/hi';
import toast from 'react-hot-toast';

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

        {/* Shape Properties */}
        {element.type === 'shape' && <ShapeProperties element={element} handleDataUpdate={handleDataUpdate} />}

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
  const weightOptions = [300, 400, 500, 600, 700, 800, 900];

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
              {weightOptions.map((w) => {
                const supported = availableWeights.includes(w);
                return (
                  <option key={w} value={w} disabled={!supported}>
                    {FONT_WEIGHT_LABELS[w] || w}{!supported ? ' (unsupported)' : ''}
                  </option>
                );
              })}
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
    </>
  );
}

function ImageProperties({ element, handleDataUpdate }: { element: CanvasElement; handleDataUpdate: (data: Record<string, unknown>) => void }) {
  const data = element.data as ImageData;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flipH = !!(element.data as any).flipH;
  const flipV = !!(element.data as any).flipV;

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
        {/* Flip Controls */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500 w-14 flex-shrink-0">Flip</span>
          <button
            onClick={() => handleDataUpdate({ flipH: !flipH })}
            className={`flex-1 h-8 rounded-lg border flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
              flipH
                ? 'border-canva-purple bg-canva-purple/10 text-canva-purple'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title="Flip Horizontal"
          >
            <HiOutlineArrowRight size={14} /> H
          </button>
          <button
            onClick={() => handleDataUpdate({ flipV: !flipV })}
            className={`flex-1 h-8 rounded-lg border flex items-center justify-center gap-1 text-xs font-medium transition-colors ${
              flipV
                ? 'border-canva-purple bg-canva-purple/10 text-canva-purple'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            title="Flip Vertical"
          >
            <HiOutlineArrowDown size={14} /> V
          </button>
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

        {/* Crop */}
        <div className="mb-3">
          <button
            onClick={() => toast('Crop mode - use transform handles to adjust')}
            className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <HiOutlineAdjustments size={14} /> Crop
          </button>
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
