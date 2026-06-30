import React, { useState, useEffect, useRef, forwardRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement } from '../../types';
import { cn } from '../../utils/cn';
import { HiOutlineX, HiOutlineChevronUp, HiOutlineChevronDown, HiOutlinePhotograph } from 'react-icons/hi';

interface PhotoCollageProps {
  selectedElementIds: string[];
  onClose: () => void;
}

interface CollageItem {
  id: string;
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  data?: any;
}

const PhotoCollage: React.FC<PhotoCollageProps> = ({ selectedElementIds, onClose }) => {
  const { pages, currentPageIndex, updateElement, duplicateElements } = useEditorStore();
  const page = pages[currentPageIndex];
  const selectedElements = page?.elements.filter((e) => selectedElementIds.includes(e.id)) || [];
  
  const [items, setItems] = useState<CollageItem[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState('masonry');
  const [spacing, setSpacing] = useState(10);
  const [rotation, setRotation] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [autoArrange, setAutoArrange] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);

  const templates = [
    { id: 'masonry', name: 'Masonry', description: 'Irregular grid layout' },
    { id: 'grid', name: 'Grid', description: 'Uniform grid layout' },
    { id: 'polaroid', name: 'Polaroid Strip', description: 'Horizontal polaroid style' },
    { id: 'circle', name: 'Circle', description: 'Circular arrangement' },
    { id: 'magazine', name: 'Magazine', description: 'Magazine spread layout' },
    { id: 'floating', name: 'Floating', description: 'Floating elements with overlap' },
  ];

  useEffect(() => {
    const initialItems: CollageItem[] = selectedElements.map((el) => ({
      id: `item-${el.id}`,
      elementId: el.id,
      x: 0,
      y: 0,
      width: el.width,
      height: el.height,
      rotation: 0,
      opacity: 1,
      zIndex: el.zIndex,
      data: el.data,
    }));
    setItems(initialItems);
  }, [selectedElements]);

  const autoArrangeItems = () => {
    if (!autoArrange || items.length === 0) return;
    
    const templateSpacing = spacing / 100;
    const padding = 20;
    
    if (selectedTemplate === 'grid') {
      const cols = Math.ceil(Math.sqrt(items.length));
      const rows = Math.ceil(items.length / cols);
      const itemWidth = (500 - padding * 2 - cols * templateSpacing) / cols;
      const itemHeight = (500 - padding * 2 - rows * templateSpacing) / rows;
      
      items.forEach((item, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        item.x = padding + col * (itemWidth + templateSpacing);
        item.y = padding + row * (itemHeight + templateSpacing);
        const maxItemWidth = Math.min(itemWidth, item.width);
        const maxItemHeight = Math.min(itemHeight, item.height);
        item.width = maxItemWidth;
        item.height = maxItemHeight;
      });
    } else if (selectedTemplate === 'masonry') {
      let currentY = padding;
      let columnWidths = [0, 0, 0];
      
      items.forEach((item) => {
        const columnIndex = columnWidths.indexOf(Math.min(...columnWidths));
        item.x = padding + columnIndex * (250 - padding * 2);
        item.y = currentY;
        item.width = Math.min(250, item.width * 1.2);
        item.height = item.height * (item.width / item.width);
        
        columnWidths[columnIndex] = Math.max(columnWidths[columnIndex], item.height);
        currentY += item.height + templateSpacing;
      });
    } else if (selectedTemplate === 'polaroid') {
      const itemWidth = 120;
      const itemHeight = 150;
      const startX = (500 - (itemWidth * items.length + templateSpacing * (items.length - 1))) / 2;
      
      items.forEach((item, index) => {
        item.x = startX + index * (itemWidth + templateSpacing);
        item.y = (500 - itemHeight) / 2;
        item.width = itemWidth;
        item.height = itemHeight;
      });
    } else if (selectedTemplate === 'circle') {
      const centerX = 250;
      const centerY = 250;
      const radius = Math.min(500 - padding * 2) / 2;
      
      items.forEach((item, index) => {
        const angle = (index / items.length) * Math.PI * 2;
        item.x = centerX + radius * Math.cos(angle) - item.width / 2;
        item.y = centerY + radius * Math.sin(angle) - item.height / 2;
      });
    } else if (selectedTemplate === 'magazine') {
      const coverWidth = 260;
      const articleWidth = 220;
      
      items[0] && (items[0].x = 10, items[0].y = 10, items[0].width = coverWidth, items[0].height = 400);
      items[1] && (items[1].x = 280, items[1].y = 10, items[1].width = articleWidth, items[1].height = 150);
      items[2] && (items[2].x = 280, items[2].y = 170, items[2].width = articleWidth, items[2].height = 150);
      items[3] && (items[3].x = 10, items[3].y = 420, items[3].width = coverWidth, items[3].height = 90);
    } else if (selectedTemplate === 'floating') {
      items.forEach((item, index) => {
        const angle = (index / items.length) * Math.PI * 0.8 - Math.PI * 0.4;
        item.x = 250 + (index - items.length / 2) * 80 * Math.cos(angle);
        item.y = 250 + (index - items.length / 2) * 80 * Math.sin(angle);
        item.width *= 0.8;
        item.height *= 0.8;
      });
    }
    
    setItems([...items]);
  };

  useEffect(() => {
    if (autoArrange) {
      autoArrangeItems();
    }
  }, [autoArrange, selectedTemplate, spacing]);

  const updateElementInCanvas = (elementId: string, updates: Partial<CollageItem>) => {
    setItems(items.map(item => 
      item.elementId === elementId ? { ...item, ...updates } : item
    ));
  };

  const applyChangesToCanvas = () => {
    items.forEach(item => {
      updateElement(item.elementId, {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        opacity: item.opacity,
        zIndex: item.zIndex,
      });
    });
    onClose();
  };

  const duplicateSelectedItems = () => {
    const newItems = items.map(item => ({
      id: `item-${Date.now()}-${item.id.split('-')[1] || ''}`,
      elementId: item.elementId,
      x: item.x + spacing / 2,
      y: item.y + spacing / 2,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
      opacity: item.opacity,
      zIndex: Math.max(...items.map(i => i.zIndex)) + 1,
      data: item.data,
    }));
    setItems([...items, ...newItems]);
  };

  const removeItem = (itemId: string) => {
    setItems(items.filter(item => item.id !== itemId));
  };

  const moveItemUp = (itemId: string) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return { ...item, zIndex: item.zIndex + 1 };
      } else if (item.zIndex === item.zIndex - 1) {
        return { ...item, zIndex: item.zIndex - 1 };
      }
      return item;
    }));
  };

  const moveItemDown = (itemId: string) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        return { ...item, zIndex: item.zIndex - 1 };
      } else if (item.zIndex === item.zIndex + 1) {
        return { ...item, zIndex: item.zIndex + 1 };
      }
      return item;
    }));
  };

  const rotateSelected = (angle: number) => {
    setItems(items.map(item => ({
      ...item,
      rotation: item.rotation + angle,
    })));
  };

  const exportCollage = () => {
    if (!templateRef.current) return;
    
    const html2canvas = require('html2canvas');
    html2canvas(templateRef.current).then((canvas: HTMLCanvasElement) => {
      const link = document.createElement('a');
      link.download = 'photo-collage.png';
      link.href = canvas.toDataURL();
      link.click();
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Photo Collage</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentImageIndex(Math.max(0, currentImageIndex - 1))}
              disabled={currentImageIndex === 0}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiOutlineChevronUp className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {currentImageIndex + 1} / {items.length}
            </span>
            <button
              onClick={() => setCurrentImageIndex(Math.min(items.length - 1, currentImageIndex + 1))}
              disabled={currentImageIndex === items.length - 1}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <HiOutlineChevronDown className="w-5 h-5" />
            </button>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="w-80 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Templates</label>
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={cn(
                      "w-full p-3 rounded-lg border text-left transition-all",
                      selectedTemplate === template.id
                        ? "border-canva-purple bg-canva-purple/10"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                    )}
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{template.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{template.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Settings</label>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Spacing</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={spacing}
                    onChange={(e) => setSpacing(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-gray-400 text-right">{spacing}px</div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Rotation</label>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-gray-400 text-right">{rotation}°</div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Opacity</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-xs text-gray-400 text-right">{(opacity * 100).toFixed(0)}%</div>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={gridEnabled}
                    onChange={(e) => setGridEnabled(e.target.checked)}
                    className="rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Show grid</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoArrange}
                    onChange={(e) => setAutoArrange(e.target.checked)}
                    className="rounded border-gray-300 text-canva-purple focus:ring-canva-purple"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Auto-arrange</span>
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Selected Items</label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded flex-shrink-0 flex items-center justify-center">
                      <HiOutlinePhotograph className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        Element {item.elementId.slice(-4)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {Math.round(item.width)} × {Math.round(item.height)} px
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-1 text-red-500 hover:text-red-600"
                    >
                      <HiOutlineX className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => rotateSelected(-15)}
                    className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Rotate -15°
                  </button>
                  <button
                    onClick={() => rotateSelected(15)}
                    className="px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Rotate +15°
                  </button>
                </div>
                <button
                  onClick={duplicateSelectedItems}
                  className="px-3 py-2 rounded-lg bg-canva-purple text-white font-medium hover:bg-canva-purple/90"
                >
                  Duplicate Selected
                </button>
              </div>
            </div>

            <div className="flex-1 p-8 flex items-center justify-center overflow-auto">
              <div
                ref={templateRef}
                className="relative bg-white dark:bg-gray-950 shadow-lg rounded-lg overflow-hidden"
                style={{ width: 500, height: 500, position: 'relative' }}
              >
                {gridEnabled && (
                  <div className="absolute inset-0 pointer-events-none z-10">
                    {Array.from({ length: 11 }).map((_, i) => (
                      <div
                        key={`h-${i}`}
                        className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700"
                        style={{ top: `${i * 5}%` }}
                      />
                    ))}
                    {Array.from({ length: 11 }).map((_, i) => (
                      <div
                        key={`v-${i}`}
                        className="absolute top-0 bottom-0 border-l border-gray-200 dark:border-gray-700"
                        style={{ left: `${i * 5}%` }}
                      />
                    ))}
                  </div>
                )}

                <div className="absolute inset-0 p-4">
                  {items.map((item, index) => (
                    <div
                      key={item.id}
                      className="absolute cursor-move"
                      style={{
                        left: `${item.x}px`,
                        top: `${item.y}px`,
                        width: `${item.width}px`,
                        height: `${item.height}px`,
                        transform: `rotate(${item.rotation}deg)`, opacity: item.opacity,
                        zIndex: item.zIndex,
                      }}
                    >
                      <div
                        className="w-full h-full bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm hover:shadow-md transition-shadow flex items-center justify-center"
                        onClick={() => setCurrentImageIndex(index)}
                      >
                        <HiOutlinePhotograph className="w-8 h-8 text-gray-400" />
                        <div className="absolute bottom-1 left-1 right-1 text-xs text-gray-500 dark:text-gray-400 text-center">
                          {item.elementId.slice(-4)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => moveItemDown(items[currentImageIndex]?.id || '')}
                  disabled={currentImageIndex === 0}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Move Back
                </button>
                <button
                  onClick={() => moveItemUp(items[currentImageIndex]?.id || '')}
                  disabled={currentImageIndex === items.length - 1}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Move Forward
                </button>
                <button
                  onClick={exportCollage}
                  className="px-4 py-2 rounded-lg bg-canva-purple text-white font-medium hover:bg-canva-purple/90"
                >
                  Export Collage
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {items.length} items selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={applyChangesToCanvas}
                className="px-4 py-2 rounded-lg bg-canva-purple text-white font-medium hover:bg-canva-purple/90"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoCollage;
