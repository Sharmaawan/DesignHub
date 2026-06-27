import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEditorStore } from '../../stores/editorStore';
import { HiOutlinePlus, HiOutlineX } from 'react-icons/hi';
import { CANVAS_PRESETS } from '../../utils/cn';
import { DesignType } from '../../types';
import toast from 'react-hot-toast';

const DESIGN_TYPES: DesignType[] = [
  { id: 'presentation', label: 'Presentation', icon: '📊', width: 1920, height: 1080, category: 'Presentations', description: '16:9 widescreen' },
  { id: 'social-post', label: 'Social Media Post', icon: '📱', width: 1200, height: 630, category: 'Social Media', description: 'Facebook, Twitter' },
  { id: 'instagram-post', label: 'Instagram Post', icon: '📷', width: 1080, height: 1080, category: 'Social Media', description: 'Square format' },
  { id: 'facebook-post', label: 'Facebook Post', icon: '👥', width: 1200, height: 630, category: 'Social Media', description: 'Feed post' },
  { id: 'story', label: 'Story', icon: '📖', width: 1080, height: 1920, category: 'Social Media', description: 'Instagram/Facebook Story' },
  { id: 'video', label: 'Video', icon: '🎬', width: 1920, height: 1080, category: 'Video', description: '16:9 landscape' },
  { id: 'whiteboard', label: 'Whiteboard', icon: '📋', width: 1920, height: 1080, category: 'Documents', description: 'Collaborative canvas' },
  { id: 'document', label: 'Document', icon: '📄', width: 816, height: 1056, category: 'Documents', description: 'US Letter' },
  { id: 'website', label: 'Website', icon: '🌐', width: 1440, height: 900, category: 'Web', description: 'Desktop layout' },
  { id: 'spreadsheet', label: 'Spreadsheet', icon: '📈', width: 1200, height: 800, category: 'Documents', description: 'Data layout' },
  { id: 'custom', label: 'Custom Size', icon: '✏️', width: 1080, height: 1080, category: 'Custom', description: 'Choose your dimensions' },
  { id: 'upload', label: 'Upload File', icon: '📤', width: 1080, height: 1080, category: 'Upload', description: 'Import from file' },
];

export default function CreateButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomSize, setShowCustomSize] = useState(false);
  const [customWidth, setCustomWidth] = useState(1080);
  const [customHeight, setCustomHeight] = useState(1080);
  const navigate = useNavigate();
  const { setProject } = useEditorStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowCustomSize(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleCreateDesign = (type: DesignType) => {
    if (type.id === 'upload') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              setProject({
                id: `proj-${Date.now()}`,
                name: file.name.replace(/\.[^/.]+$/, ''),
                pages: [{
                  id: `page-${Date.now()}`,
                  name: 'Page 1',
                  elements: [{
                    id: `el-${Date.now()}`,
                    type: 'image',
                    x: 0, y: 0,
                    width: Math.min(img.width, 1920),
                    height: Math.min(img.height, 1080),
                    rotation: 0, opacity: 1, visible: true, locked: false,
                    zIndex: 0, name: 'Uploaded Image',
                    data: { type: 'image', src: ev.target?.result as string, objectFit: 'contain', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
                  }],
                  backgroundColor: '#FFFFFF',
                  width: Math.min(img.width, 1920),
                  height: Math.min(img.height, 1080),
                }],
                ownerId: '1', collaborators: [], isFavorite: false, isTemplate: false,
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
              });
              navigate('/editor');
            };
            img.src = ev.target?.result as string;
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      setIsOpen(false);
      return;
    }

    if (type.id === 'custom') {
      setShowCustomSize(true);
      return;
    }

    const width = type.width;
    const height = type.height;
    setProject({
      id: `proj-${Date.now()}`,
      name: `Untitled ${type.label}`,
      pages: [{
        id: `page-${Date.now()}`,
        name: 'Page 1',
        elements: [],
        backgroundColor: '#FFFFFF',
        width, height,
      }],
      ownerId: '1', collaborators: [], isFavorite: false, isTemplate: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    toast.success(`Created ${type.label} (${width}x${height})`);
    navigate('/editor');
    setIsOpen(false);
  };

  const handleCustomCreate = () => {
    setProject({
      id: `proj-${Date.now()}`,
      name: 'Untitled Design',
      pages: [{
        id: `page-${Date.now()}`,
        name: 'Page 1',
        elements: [],
        backgroundColor: '#FFFFFF',
        width: customWidth, height: customHeight,
      }],
      ownerId: '1', collaborators: [], isFavorite: false, isTemplate: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    toast.success(`Created custom design (${customWidth}x${customHeight})`);
    navigate('/editor');
    setIsOpen(false);
    setShowCustomSize(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-[#7B2FBE] to-[#9B4DCA] text-white rounded-full font-semibold shadow-lg shadow-[#7B2FBE]/30 hover:shadow-xl hover:shadow-[#7B2FBE]/40 hover:scale-105 active:scale-95 transition-all duration-200"
      >
        <HiOutlinePlus size={20} strokeWidth={2.5} />
        <span>Create a design</span>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-[340px] bg-white dark:bg-[#1e1e30] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          {!showCustomSize ? (
            <>
              <div className="p-3 border-b border-gray-100 dark:border-gray-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white px-1">Create a design</h3>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-2">
                {DESIGN_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => handleCreateDesign(type)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all group text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
                      {type.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{type.label}</div>
                      <div className="text-[11px] text-gray-400">{type.description}</div>
                    </div>
                    <div className="text-[10px] text-gray-300 dark:text-gray-600 font-mono">
                      {type.id === 'custom' || type.id === 'upload' ? '' : `${type.width}x${type.height}`}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Custom size</h3>
                <button onClick={() => setShowCustomSize(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  <HiOutlineX size={16} />
                </button>
              </div>
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400 mb-1 block">Width (px)</label>
                  <input
                    type="number"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
                  />
                </div>
                <div className="flex items-end pb-2 text-gray-400">
                  <span className="text-sm">×</span>
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-gray-400 mb-1 block">Height (px)</label>
                  <input
                    type="number"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7B2FBE]/30 text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex gap-2 mb-3">
                {[
                  { label: 'Square', w: 1080, h: 1080 },
                  { label: 'Landscape', w: 1920, h: 1080 },
                  { label: 'Portrait', w: 1080, h: 1920 },
                  { label: 'Story', w: 1080, h: 1920 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => { setCustomWidth(preset.w); setCustomHeight(preset.h); }}
                    className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-[#7B2FBE]/10 hover:text-[#7B2FBE] transition-colors text-gray-600 dark:text-gray-400"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCustomCreate}
                disabled={customWidth <= 0 || customHeight <= 0}
                className="w-full py-2.5 bg-gradient-to-r from-[#7B2FBE] to-[#9B4DCA] text-white rounded-xl font-medium text-sm hover:shadow-lg hover:shadow-[#7B2FBE]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Create design
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
