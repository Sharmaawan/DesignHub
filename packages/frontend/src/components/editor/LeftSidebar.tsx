import { useState, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { useProjectStore } from '../../stores/projectStore';
import { FONT_FAMILIES } from '../../utils/cn';
import { Template } from '../../types';
import {
  HiOutlineTemplate, HiOutlineUpload, HiOutlinePencil, HiOutlineSparkles,
  HiOutlineViewGrid, HiOutlinePhotograph, HiOutlineDocumentText,
  HiOutlinePlus, HiOutlineSearch, HiOutlineX, HiOutlineTrash,
} from 'react-icons/hi';
import { FiSquare, FiCircle, FiTriangle, FiStar, FiHexagon, FiArrowRight, FiHeart, FiGrid } from 'react-icons/fi';
import TemplateReplaceModal from './TemplateReplaceModal';
import toast from 'react-hot-toast';

const SIDEBAR_TABS = [
  { id: 'templates', icon: HiOutlineTemplate, label: 'Templates' },
  { id: 'uploads', icon: HiOutlineUpload, label: 'Uploads' },
  { id: 'text', icon: HiOutlinePencil, label: 'Text' },
  { id: 'elements', icon: HiOutlineViewGrid, label: 'Elements' },
  { id: 'images', icon: HiOutlinePhotograph, label: 'Images' },
  { id: 'projects', icon: HiOutlineDocumentText, label: 'Projects' },
  { id: 'ai', icon: HiOutlineSparkles, label: 'AI Tools' },
];

const SHAPES = [
  { type: 'rectangle', icon: FiSquare, label: 'Rectangle' },
  { type: 'circle', icon: FiCircle, label: 'Circle' },
  { type: 'triangle', icon: FiTriangle, label: 'Triangle' },
  { type: 'star', icon: FiStar, label: 'Star' },
  { type: 'pentagon', icon: FiHexagon, label: 'Pentagon' },
  { type: 'hexagon', icon: FiHexagon, label: 'Hexagon' },
  { type: 'arrow', icon: FiArrowRight, label: 'Arrow' },
  { type: 'heart', icon: FiHeart, label: 'Heart' },
  { type: 'diamond', icon: FiGrid, label: 'Diamond' },
];

export default function LeftSidebar() {
  const { sidePanelTab, setSidePanelTab, addElement, pages, currentPageIndex, setProject, addPage } = useEditorStore();
  const { templates, projects } = useProjectStore();
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingTemplate, setPendingTemplate] = useState<Template | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  const filteredTemplates = templates.filter(
    (t) => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddText = (type: 'heading' | 'subheading' | 'body') => {
    const configs = {
      heading: { content: 'Heading', fontSize: 64, fontWeight: 700, fontFamily: 'Plus Jakarta Sans', height: 80 },
      subheading: { content: 'Subheading', fontSize: 36, fontWeight: 600, fontFamily: 'Inter', height: 50 },
      body: { content: 'Body text goes here. You can edit this text by double-clicking on it.', fontSize: 18, fontWeight: 400, fontFamily: 'Inter', height: 100 },
    };
    const config = configs[type];
    addElement({
      type: 'text',
      x: 100 + Math.random() * 100,
      y: 100 + Math.random() * 100,
      width: type === 'body' ? 600 : 500,
      height: config.height,
      data: {
        type: 'text',
        content: config.content,
        fontFamily: config.fontFamily,
        fontSize: config.fontSize,
        fontWeight: config.fontWeight,
        fontStyle: 'normal' as const,
        textDecoration: 'none' as const,
        textAlign: 'left' as const,
        color: '#000000',
        lineHeight: 1.4,
        letterSpacing: 0,
        textTransform: 'none' as const,
      },
    });
  };

  const handleAddShape = (shapeType: string) => {
    addElement({
      type: 'shape',
      x: 150 + Math.random() * 100,
      y: 150 + Math.random() * 100,
      width: 200,
      height: 200,
      data: {
        type: 'shape',
        shapeType: shapeType as any,
        fill: '#7B2FBE',
        stroke: 'transparent',
        strokeWidth: 0,
        cornerRadius: shapeType === 'rectangle' ? 12 : 0,
      },
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 500;
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          addElement({
            type: 'image',
            x: 100 + Math.random() * 100,
            y: 100 + Math.random() * 100,
            width: img.width * scale,
            height: img.height * scale,
            data: {
              type: 'image',
              src: reader.result as string,
              objectFit: 'cover' as const,
              borderRadius: 0,
              brightness: 100,
              contrast: 100,
              saturation: 100,
              hue: 0,
              blur: 0,
              filters: [],
              cropX: 0,
              cropY: 0,
              cropWidth: 100,
              cropHeight: 100,
            },
          });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleAddChart = () => {
    addElement({
      type: 'chart',
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      data: {
        type: 'chart',
        chartType: 'bar',
        data: [
          { label: 'Jan', value: 30, color: '#7B2FBE' },
          { label: 'Feb', value: 50, color: '#00C4CC' },
          { label: 'Mar', value: 80, color: '#FF6B9D' },
          { label: 'Apr', value: 40, color: '#FF8A00' },
        ],
        showLabels: true,
        showLegend: true,
      },
    });
  };

  const handleAddTable = () => {
    addElement({
      type: 'table',
      x: 100,
      y: 100,
      width: 500,
      height: 200,
      data: {
        type: 'table',
        rows: 3,
        cols: 3,
        cells: [
          ['Header 1', 'Header 2', 'Header 3'],
          ['Cell 1', 'Cell 2', 'Cell 3'],
          ['Cell 4', 'Cell 5', 'Cell 6'],
        ],
        headerRow: true,
        borderColor: '#E5E5E5',
        headerBgColor: '#7B2FBE',
        headerTextColor: '#FFFFFF',
        cellTextColor: '#333333',
      },
    });
  };

  return (
    <div className="flex h-full flex-shrink-0">
      {/* Tab bar */}
      <div className="w-16 bg-white dark:bg-canva-dark-surface border-r border-gray-200 dark:border-canva-dark-border flex flex-col items-center py-2 gap-0.5 overflow-y-auto">
        {SIDEBAR_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidePanelTab(sidePanelTab === tab.id ? '' : tab.id)}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-all ${
              sidePanelTab === tab.id
                ? 'bg-canva-purple/10 text-canva-purple'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <tab.icon size={18} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      {sidePanelTab && (
        <div className="w-72 bg-white dark:bg-canva-dark-surface border-r border-gray-200 dark:border-canva-dark-border overflow-y-auto flex-shrink-0">
          <div className="p-3 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{sidePanelTab}</h3>
              <button onClick={() => setSidePanelTab('')} className="text-gray-400 hover:text-gray-600"><HiOutlineX size={16} /></button>
            </div>
            <div className="relative">
              <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${sidePanelTab}...`}
                className="w-full pl-9 pr-8 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-canva-purple/30 text-gray-900 dark:text-white placeholder-gray-400"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <HiOutlineX size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="p-3">
            {/* ====== TEMPLATES ====== */}
            {sidePanelTab === 'templates' && (
              <div className="space-y-3">
                {filteredTemplates.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No templates found</p>
                )}
                {filteredTemplates.map((template) => {
                  const page = template.data?.pages?.[0];
                  const bgColor = page?.backgroundColor || '#f3f4f6';
                  const hasElementsOnCanvas = pages[currentPageIndex]?.elements.length > 0;
                  return (
                    <button
                      key={template.id}
                      className="w-full bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden hover:ring-2 hover:ring-canva-purple transition-all text-left group"
                      onClick={() => {
                        if (hasElementsOnCanvas) {
                          setPendingTemplate(template);
                          setShowReplaceModal(true);
                        } else {
                          // Apply directly to empty canvas
                          const tmplPage = template.data?.pages?.[0];
                          if (tmplPage?.elements) {
                            tmplPage.elements.forEach((el: any) => {
                              addElement({ ...el, id: undefined, x: el.x, y: el.y });
                            });
                          }
                          toast.success(`Template "${template.name}" applied`);
                        }
                      }}
                    >
                      <div className="h-20 relative overflow-hidden" style={{ backgroundColor: bgColor }}>
                        {page?.elements?.slice(0, 5).map((el: any) => (
                          <div
                            key={el.id}
                            className="absolute"
                            style={{
                              left: `${(el.x / page.width) * 100}%`,
                              top: `${(el.y / page.height) * 100}%`,
                              width: `${(el.width / page.width) * 100}%`,
                              height: `${(el.height / page.height) * 100}%`,
                              backgroundColor: el.type === 'shape' ? el.data?.fill : undefined,
                              opacity: el.opacity,
                            }}
                          />
                        ))}
                      </div>
                      <div className="p-2">
                        <div className="text-xs font-medium text-gray-900 dark:text-white truncate">{template.name}</div>
                        <div className="text-[10px] text-gray-400">{template.category}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ====== UPLOADS ====== */}
            {sidePanelTab === 'uploads' && (
              <div className="space-y-4">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-canva-purple dark:hover:border-canva-purple transition-colors"
                >
                  <HiOutlineUpload size={24} className="text-gray-400" />
                  <span className="text-sm font-medium text-gray-500">Upload files</span>
                  <span className="text-xs text-gray-400">PNG, JPG, SVG, GIF, MP4</span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={handleImageUpload} className="hidden" />
                <p className="text-center text-sm text-gray-400 py-4">No uploads yet</p>
              </div>
            )}

            {/* ====== TEXT ====== */}
            {sidePanelTab === 'text' && (
              <div className="space-y-3">
                <button onClick={() => handleAddText('heading')} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left">
                  <span className="text-2xl font-bold text-gray-900 dark:text-white block mb-1" style={{ fontFamily: 'Plus Jakarta Sans' }}>Add a heading</span>
                  <span className="text-xs text-gray-400">Large title text (64px)</span>
                </button>
                <button onClick={() => handleAddText('subheading')} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left">
                  <span className="text-lg font-semibold text-gray-900 dark:text-white block mb-1">Add a subheading</span>
                  <span className="text-xs text-gray-400">Medium size text (36px)</span>
                </button>
                <button onClick={() => handleAddText('body')} className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left">
                  <span className="text-sm text-gray-700 dark:text-gray-300 block mb-1">Add body text</span>
                  <span className="text-xs text-gray-400">Regular paragraph text (18px)</span>
                </button>
                <div className="pt-3">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Font combinations</h4>
                  <div className="space-y-2">
                    {[
                      { font: 'Playfair Display', label: 'Elegant Serif', size: 36 },
                      { font: 'Montserrat', label: 'Modern Sans', size: 32 },
                      { font: 'Oswald', label: 'Bold Statement', size: 38 },
                      { font: 'Raleway', label: 'Thin & Light', size: 30 },
                      { font: 'Poppins', label: 'Clean & Simple', size: 32 },
                      { font: 'Roboto Slab', label: 'Slab Serif', size: 34 },
                    ].map((combo) => (
                      <button
                        key={combo.font}
                        onClick={() => {
                          addElement({
                            type: 'text', x: 100 + Math.random() * 50, y: 100 + Math.random() * 50, width: 500, height: 60,
                            data: {
                              type: 'text', content: combo.label, fontFamily: combo.font,
                              fontSize: combo.size, fontWeight: 600, fontStyle: 'normal', textDecoration: 'none',
                              textAlign: 'left', color: '#000000', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none',
                            },
                          });
                        }}
                        className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left"
                      >
                        <span style={{ fontFamily: combo.font }} className="text-lg text-gray-900 dark:text-white">{combo.label}</span>
                        <span className="text-[10px] text-gray-400 block mt-0.5">{combo.font}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ====== ELEMENTS ====== */}
            {sidePanelTab === 'elements' && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Shapes</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {SHAPES.map((shape) => (
                      <button
                        key={shape.type}
                        onClick={() => handleAddShape(shape.type)}
                        className="aspect-square bg-gray-50 dark:bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all"
                        title={shape.label}
                      >
                        <shape.icon size={24} className="text-gray-600 dark:text-gray-300" />
                        <span className="text-[9px] text-gray-400">{shape.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Lines</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => addElement({ type: 'shape', x: 100, y: 100, width: 300, height: 4, data: { type: 'shape', shapeType: 'line', fill: '#000000', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } })}
                      className="h-12 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center hover:bg-canva-purple/5 transition-colors"
                    >
                      <div className="w-24 h-0.5 bg-gray-800 dark:bg-gray-200" />
                    </button>
                    <button
                      onClick={() => addElement({ type: 'shape', x: 100, y: 100, width: 300, height: 4, data: { type: 'shape', shapeType: 'line', fill: '#CCCCCC', stroke: 'transparent', strokeWidth: 0, cornerRadius: 0 } })}
                      className="h-12 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center hover:bg-canva-purple/5 transition-colors"
                    >
                      <div className="w-24 border-t-2 border-dashed border-gray-400" />
                    </button>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Data & Tables</h4>
                  <div className="space-y-2">
                    <button
                      onClick={handleAddChart}
                      className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"
                    >
                      <span className="text-lg">📊</span> Add bar chart
                    </button>
                    <button
                      onClick={handleAddTable}
                      className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2"
                    >
                      <span className="text-lg">📋</span> Add table
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ====== IMAGES ====== */}
            {sidePanelTab === 'images' && (
              <div className="space-y-4">
                <button
                  onClick={() => imageFileInputRef.current?.click()}
                  className="w-full btn-primary py-2.5 flex items-center justify-center gap-2"
                >
                  <HiOutlineUpload size={18} />
                  Upload image
                </button>
                <input ref={imageFileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
                <div>
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sample Images</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { colors: ['#667eea', '#764ba2'], label: 'Purple' },
                      { colors: ['#f093fb', '#f5576c'], label: 'Pink' },
                      { colors: ['#4facfe', '#00f2fe'], label: 'Blue' },
                      { colors: ['#43e97b', '#38f9d7'], label: 'Green' },
                      { colors: ['#fa709a', '#fee140'], label: 'Sunset' },
                      { colors: ['#a18cd1', '#fbc2eb'], label: 'Lavender' },
                    ].map((img) => (
                      <button
                        key={img.label}
                        className="aspect-square rounded-xl flex items-center justify-center hover:scale-105 transition-transform relative overflow-hidden group"
                        style={{ background: `linear-gradient(135deg, ${img.colors[0]}, ${img.colors[1]})` }}
                        onClick={() => {
                          const canvas = document.createElement('canvas');
                          canvas.width = 400;
                          canvas.height = 400;
                          const ctx = canvas.getContext('2d')!;
                          const gradient = ctx.createLinearGradient(0, 0, 400, 400);
                          gradient.addColorStop(0, img.colors[0]);
                          gradient.addColorStop(1, img.colors[1]);
                          ctx.fillStyle = gradient;
                          ctx.fillRect(0, 0, 400, 400);
                          addElement({
                            type: 'image', x: 100 + Math.random() * 50, y: 100 + Math.random() * 50, width: 300, height: 300,
                            data: { type: 'image', src: canvas.toDataURL(), objectFit: 'cover', borderRadius: 12, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
                          });
                        }}
                      >
                        <span className="text-white text-xs font-medium drop-shadow">{img.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ====== PROJECTS ====== */}
            {sidePanelTab === 'projects' && (
              <div className="space-y-2">
                {projects.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No projects yet</p>
                )}
                {projects.slice(0, 10).map((project) => (
                  <button
                    key={project.id}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{project.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{project.pages.length} page{project.pages.length !== 1 ? 's' : ''}</div>
                  </button>
                ))}
              </div>
            )}

            {/* ====== AI TOOLS ====== */}
            {sidePanelTab === 'ai' && (
              <div className="space-y-3">
                <div className="bg-gradient-to-r from-canva-purple/10 to-canva-blue/10 rounded-xl p-4 border border-canva-purple/20">
                  <div className="flex items-center gap-2 mb-2">
                    <HiOutlineSparkles size={18} className="text-canva-purple" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">AI Assistant</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Let AI help you create amazing designs</p>
                </div>
                {[
                  { icon: '✨', label: 'Generate text', desc: 'AI-powered copywriting', action: () => {
                    addElement({
                      type: 'text', x: 100, y: 100, width: 500, height: 60,
                      data: { type: 'text', content: 'AI Generated: Your amazing headline goes here!', fontFamily: 'Plus Jakarta Sans', fontSize: 40, fontWeight: 700, fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', color: '#7B2FBE', lineHeight: 1.2, letterSpacing: 0, textTransform: 'none' },
                    });
                  }},
                  { icon: '🎨', label: 'Generate image', desc: 'Create unique images', action: () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = 500; canvas.height = 400;
                    const ctx = canvas.getContext('2d')!;
                    const gradient = ctx.createLinearGradient(0, 0, 500, 400);
                    gradient.addColorStop(0, '#667eea'); gradient.addColorStop(0.5, '#764ba2'); gradient.addColorStop(1, '#f093fb');
                    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 500, 400);
                    addElement({
                      type: 'image', x: 100, y: 100, width: 400, height: 320,
                      data: { type: 'image', src: canvas.toDataURL(), objectFit: 'cover', borderRadius: 16, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
                    });
                  }},
                  { icon: '🔄', label: 'Smart resize', desc: 'Resize for all platforms', action: () => toast('Smart resize coming soon!', { icon: '🔄' }) },
                  { icon: '💡', label: 'Design suggestions', desc: 'Get layout recommendations', action: () => toast('AI suggestions coming soon!', { icon: '💡' }) },
                ].map((tool) => (
                  <button
                    key={tool.label}
                    onClick={tool.action}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-canva-purple/5 hover:ring-1 hover:ring-canva-purple transition-all text-left flex items-center gap-3"
                  >
                    <span className="text-xl">{tool.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{tool.label}</div>
                      <div className="text-xs text-gray-400">{tool.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Template Replace Modal */}
      <TemplateReplaceModal
        open={showReplaceModal}
        templateName={pendingTemplate?.name || ''}
        onReplace={() => {
          // Clear canvas and apply template
          const editorState = useEditorStore.getState();
          const currentPage = editorState.pages[editorState.currentPageIndex];
          if (currentPage) {
            // Remove all elements from current page
            const allIds = currentPage.elements.map((e) => e.id);
            if (allIds.length > 0) {
              const newPages = [...editorState.pages];
              newPages[editorState.currentPageIndex] = { ...currentPage, elements: [] };
              useEditorStore.setState({ pages: newPages });
            }
          }
          // Apply template elements
          const tmplPage = pendingTemplate?.data?.pages?.[0];
          if (tmplPage?.elements) {
            tmplPage.elements.forEach((el: any) => {
              addElement({ ...el, id: undefined, x: el.x, y: el.y });
            });
          }
          toast.success(`Template "${pendingTemplate?.name}" applied`);
          setShowReplaceModal(false);
          setPendingTemplate(null);
        }}
        onAddPage={() => {
          // Add as new page
          addPage();
          const newIndex = useEditorStore.getState().pages.length - 1;
          const tmplPage = pendingTemplate?.data?.pages?.[0];
          if (tmplPage?.elements) {
            // Set page dimensions
            const newPages = [...useEditorStore.getState().pages];
            newPages[newIndex] = {
              ...newPages[newIndex],
              width: tmplPage.width || 1920,
              height: tmplPage.height || 1080,
              backgroundColor: tmplPage.backgroundColor || '#FFFFFF',
            };
            useEditorStore.setState({ pages: newPages, currentPageIndex: newIndex });
            tmplPage.elements.forEach((el: any) => {
              addElement({ ...el, id: undefined, x: el.x, y: el.y });
            });
          }
          toast.success(`Template "${pendingTemplate?.name}" added as new page`);
          setShowReplaceModal(false);
          setPendingTemplate(null);
        }}
        onCancel={() => {
          setShowReplaceModal(false);
          setPendingTemplate(null);
        }}
      />
    </div>
  );
}
