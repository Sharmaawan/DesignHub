import { useEditorStore } from '../../../stores/editorStore';
import { useCallback } from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';

export default function ShapeProperties() {
  const { selectedElementIds, pages, currentPageIndex, updateElement } = useEditorStore();

  const currentPage = pages[currentPageIndex];
  const element = currentPage?.elements.find((el) => el.id === selectedElementIds[0]);

  if (!element || element.type !== 'shape') {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <HiOutlineExclamationCircle size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No shape element selected</p>
      </div>
    );
  }

  const shapeData = element.data as any;

  const handleShapeChange = useCallback((field: string, value: any) => {
    updateElement(element.id, {
      data: { ...element.data, [field]: value },
    });
  }, [element, updateElement]);

  return (
    <div className="space-y-4 p-4">
      {/* Shape Type */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Shape
        </label>
        <select
          value={shapeData.shapeType || 'rectangle'}
          onChange={(e) => handleShapeChange('shapeType', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
        >
          <option value="rectangle">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="triangle">Triangle</option>
          <option value="line">Line</option>
          <option value="diamond">Diamond</option>
          <option value="star">Star</option>
        </select>
      </div>

      {/* Fill Color */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Fill Color
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={shapeData.fill || '#7B2FBE'}
            onChange={(e) => handleShapeChange('fill', e.target.value)}
            className="h-10 w-10 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
          />
          <input
            type="text"
            value={shapeData.fill || '#7B2FBE'}
            onChange={(e) => handleShapeChange('fill', e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-canva-purple/30 outline-none"
          />
        </div>
      </div>

      {/* Stroke */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Stroke
        </label>
        <div className="flex gap-2">
          <input
            type="color"
            value={shapeData.stroke || '#000000'}
            onChange={(e) => handleShapeChange('stroke', e.target.value)}
            className="h-10 w-10 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer"
          />
          <input
            type="text"
            value={shapeData.stroke || '#000000'}
            onChange={(e) => handleShapeChange('stroke', e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-canva-purple/30 outline-none"
          />
        </div>
      </div>

      {/* Stroke Width */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Stroke Width
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={shapeData.strokeWidth || 0}
            onChange={(e) => handleShapeChange('strokeWidth', parseInt(e.target.value))}
            className="flex-1"
            min="0"
            max="20"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {shapeData.strokeWidth || 0}px
          </span>
        </div>
      </div>

      {/* Border Radius */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Border Radius
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={shapeData.borderRadius || 0}
            onChange={(e) => handleShapeChange('borderRadius', parseInt(e.target.value))}
            className="flex-1"
            min="0"
            max="100"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {shapeData.borderRadius || 0}px
          </span>
        </div>
      </div>

      {/* Opacity */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Opacity
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={(element.opacity || 1) * 100}
            onChange={(e) => updateElement(element.id, { opacity: parseInt(e.target.value) / 100 })}
            className="flex-1"
            min="0"
            max="100"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {Math.round((element.opacity || 1) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
