import { useEditorStore } from '../../../stores/editorStore';
import { useCallback } from 'react';
import {
  HiOutlineType, HiOutlineExclamationCircle,
} from 'react-icons/hi';

export default function TextProperties() {
  const { selectedElementIds, pages, currentPageIndex, updateElement } = useEditorStore();

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
      data: { ...element.data, [field]: value },
    });
  }, [element, updateElement]);

  const handleContentChange = useCallback((newText: string) => {
    updateElement(element.id, {
      data: { ...element.data, content: newText },
    });
  }, [element, updateElement]);

  return (
    <div className="space-y-4 p-4">
      {/* Text Content */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Text
        </label>
        <textarea
          value={textData.content || ''}
          onChange={(e) => handleContentChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple outline-none resize-none"
          rows={3}
        />
      </div>

      {/* Font Family */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Font
        </label>
        <select
          value={textData.fontFamily || 'Arial'}
          onChange={(e) => handleTextChange('fontFamily', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple outline-none"
        >
          <option>Arial</option>
          <option>Times New Roman</option>
          <option>Courier New</option>
          <option>Georgia</option>
          <option>Verdana</option>
          <option>Comic Sans MS</option>
        </select>
      </div>

      {/* Font Size */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Size
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={textData.fontSize || 24}
            onChange={(e) => handleTextChange('fontSize', parseInt(e.target.value))}
            className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
            min="8"
            max="200"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 py-2">px</span>
        </div>
      </div>

      {/* Font Weight */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Weight
        </label>
        <div className="flex gap-2">
          {[
            { label: 'Regular', value: 400 },
            { label: 'Bold', value: 700 },
            { label: 'Light', value: 300 },
          ].map((w) => (
            <button
              key={w.value}
              onClick={() => handleTextChange('fontWeight', w.value)}
              className={`flex-1 px-2 py-2 text-xs rounded border transition-colors ${
                textData.fontWeight === w.value
                  ? 'bg-canva-purple text-white border-canva-purple'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text Color */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Color
        </label>
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

      {/* Text Alignment */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Alignment
        </label>
        <select
          value={textData.textAlign || 'left'}
          onChange={(e) => handleTextChange('textAlign', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
          <option value="justify">Justify</option>
        </select>
      </div>

      {/* Line Height */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Line Height
        </label>
        <input
          type="number"
          value={textData.lineHeight || 1.2}
          onChange={(e) => handleTextChange('lineHeight', parseFloat(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
          min="0.5"
          max="3"
          step="0.1"
        />
      </div>

      {/* Letter Spacing */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Letter Spacing
        </label>
        <input
          type="number"
          value={textData.letterSpacing || 0}
          onChange={(e) => handleTextChange('letterSpacing', parseFloat(e.target.value))}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
          min="-5"
          max="5"
          step="0.1"
        />
      </div>
    </div>
  );
}
