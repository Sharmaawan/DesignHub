import { useEditorStore } from '../../../stores/editorStore';
import { useCallback, useRef } from 'react';
import { HiOutlineExclamationCircle, HiOutlinePhotograph } from 'react-icons/hi';

export default function ImageProperties() {
  const { selectedElementIds, pages, currentPageIndex, updateElement } = useEditorStore();

  const currentPage = pages[currentPageIndex];
  const element = currentPage?.elements.find((el) => el.id === selectedElementIds[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!element || element.type !== 'image') {
    return (
      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
        <HiOutlineExclamationCircle size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No image element selected</p>
      </div>
    );
  }

  const imageData = element.data as any;

  const handleImageChange = useCallback((field: string, value: any) => {
    updateElement(element.id, {
      data: { ...element.data, [field]: value },
    });
  }, [element, updateElement]);

  // Swaps only `src` — position, size, crop, rotation, corner radius, filters
  // and layer order all stay on the same element exactly as they were. This
  // is the direct "click the existing picture, change it in place" action;
  // it's not a new element, so there's nothing left floating on top of the
  // template afterward the way adding a separate Frame would.
  const handleReplaceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => handleImageChange('src', ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-4 p-4">
      {/* Image Preview */}
      {imageData.src && (
        <div className="w-full aspect-video rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-4">
          <img
            src={imageData.src}
            alt="Preview"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleReplaceImage} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full h-9 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <HiOutlinePhotograph size={14} /> Replace Image
        </button>
      </div>

      {/* Object Fit */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Fit
        </label>
        <select
          value={imageData.objectFit || 'cover'}
          onChange={(e) => handleImageChange('objectFit', e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-canva-purple/30 outline-none"
        >
          <option value="cover">Cover</option>
          <option value="contain">Contain</option>
          <option value="fill">Fill</option>
          <option value="scale-down">Scale down</option>
        </select>
      </div>

      {/* Brightness */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Brightness
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={imageData.brightness || 100}
            onChange={(e) => handleImageChange('brightness', parseInt(e.target.value))}
            className="flex-1"
            min="0"
            max="200"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {imageData.brightness || 100}%
          </span>
        </div>
      </div>

      {/* Contrast */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Contrast
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={imageData.contrast || 100}
            onChange={(e) => handleImageChange('contrast', parseInt(e.target.value))}
            className="flex-1"
            min="0"
            max="200"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {imageData.contrast || 100}%
          </span>
        </div>
      </div>

      {/* Saturation */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Saturation
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={imageData.saturation || 100}
            onChange={(e) => handleImageChange('saturation', parseInt(e.target.value))}
            className="flex-1"
            min="0"
            max="200"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {imageData.saturation || 100}%
          </span>
        </div>
      </div>

      {/* Blur */}
      <div>
        <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
          Blur
        </label>
        <div className="flex gap-2 items-center">
          <input
            type="range"
            value={imageData.blur || 0}
            onChange={(e) => handleImageChange('blur', parseInt(e.target.value))}
            className="flex-1"
            min="0"
            max="20"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {imageData.blur || 0}px
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
            value={imageData.borderRadius || 0}
            onChange={(e) => handleImageChange('borderRadius', parseInt(e.target.value))}
            className="flex-1"
            min="0"
            max="100"
          />
          <span className="text-xs text-gray-600 dark:text-gray-400 min-w-10 text-right">
            {imageData.borderRadius || 0}px
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
