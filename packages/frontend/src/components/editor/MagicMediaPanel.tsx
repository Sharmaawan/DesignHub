import { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import toast from 'react-hot-toast';
import {
  HiOutlinePhotograph,
  HiOutlineFilm,
  HiOutlineColorSwatch,
  HiOutlineSparkles,
  HiOutlineDownload,
  HiOutlineRefresh,
} from 'react-icons/hi';

type Tab = 'images' | 'videos' | 'graphics';

interface GeneratedItem {
  id: string;
  url: string;
  type: string;
}

const IMAGE_STYLES = [
  'Photorealistic',
  'Illustration',
  'Digital Art',
  'Watercolor',
  'Oil Painting',
  '3D Render',
  'Pixel Art',
  'Neon',
  'Minimalist',
  'Abstract',
];

const VIDEO_STYLES = ['Cinematic', 'Animation', 'Motion Graphics', 'Time-lapse', 'Slow Motion'];

const GRAPHIC_STYLES = ['Logo', 'Icon Set', 'Pattern', 'Border', 'Frame', 'Badge'];

const TABS: { id: Tab; icon: typeof HiOutlinePhotograph; label: string }[] = [
  { id: 'images', icon: HiOutlinePhotograph, label: 'AI Images' },
  { id: 'videos', icon: HiOutlineFilm, label: 'AI Videos' },
  { id: 'graphics', icon: HiOutlineColorSwatch, label: 'AI Graphics' },
];

const STYLES_MAP: Record<Tab, string[]> = {
  images: IMAGE_STYLES,
  videos: VIDEO_STYLES,
  graphics: GRAPHIC_STYLES,
};

export default function MagicMediaPanel() {
  const { addElement } = useEditorStore();

  const [activeTab, setActiveTab] = useState<Tab>('images');
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedItem[]>([]);
  const [selectedStyle, setSelectedStyle] = useState(IMAGE_STYLES[0]);

  const styles = STYLES_MAP[activeTab];

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSelectedStyle(STYLES_MAP[tab][0]);
    setResults([]);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt');
      return;
    }

    const token = localStorage.getItem('designhub-token');
    if (!token) {
      toast.error('Please log in to use AI generation');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('http://localhost:3001/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: 'anthropic',
          prompt: `Generate an image description for: ${prompt} in ${selectedStyle} style. Provide a detailed description suitable for image generation.`,
          type: 'text',
        }),
      });

      if (!res.ok) throw new Error('Generation failed');

      const data = await res.json();
      const newResult: GeneratedItem = {
        id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: data.result || data.url || '',
        type: activeTab,
      };

      setResults((prev) => [newResult, ...prev]);
      toast.success(`${activeTab === 'images' ? 'Image' : activeTab === 'videos' ? 'Video' : 'Graphic'} generated!`);
    } catch (err) {
      toast.error('Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddToCanvas = (item: GeneratedItem) => {
    addElement({
      type: 'image',
      data: { src: item.url },
    } as any);
    toast.success('Added to canvas');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-3">
          <HiOutlineSparkles className="text-canva-purple" size={20} />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Magic Media
          </h2>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-700 text-canva-purple shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <tab.icon size={14} />
              <span className="hidden sm:inline">{tab.label.replace('AI ', '')}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Prompt */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Describe what you want to create
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`e.g. ${activeTab === 'images' ? 'A serene mountain landscape at sunset' : activeTab === 'videos' ? 'A spinning product showcase' : 'A modern tech startup logo'}`}
            className="w-full h-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-canva-purple/30 focus:border-canva-purple transition-all"
          />
        </div>

        {/* Style selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            Style
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {styles.map((style) => (
              <button
                key={style}
                onClick={() => setSelectedStyle(style)}
                className={`py-2 px-2.5 rounded-lg text-xs font-medium transition-all border ${
                  selectedStyle === style
                    ? 'bg-canva-purple/10 text-canva-purple border-canva-purple/30'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-canva-purple hover:bg-canva-purple-dark disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-all active:scale-95"
        >
          {generating ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating...
            </>
          ) : (
            <>
              <HiOutlineSparkles size={16} />
              Generate
            </>
          )}
        </button>

        {/* Loading skeleton */}
        {generating && (
          <div className="grid grid-cols-2 gap-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="aspect-square rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && !generating && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => setResults([])}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1"
              >
                <HiOutlineRefresh size={12} />
                Clear
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {results.map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  {item.url ? (
                    <img
                      src={item.url}
                      alt={item.type}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      {activeTab === 'images' && <HiOutlinePhotograph size={32} />}
                      {activeTab === 'videos' && <HiOutlineFilm size={32} />}
                      {activeTab === 'graphics' && <HiOutlineColorSwatch size={32} />}
                    </div>
                  )}

                  {/* Overlay actions */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleAddToCanvas(item)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-canva-purple hover:bg-canva-purple-dark text-white text-xs font-medium rounded-md transition-all"
                      >
                        Add to canvas
                      </button>
                      <button
                        onClick={() => {
                          if (item.url) {
                            const a = document.createElement('a');
                            a.href = item.url;
                            a.download = `magic-${item.type}-${item.id}.png`;
                            a.click();
                          }
                        }}
                        className="p-1.5 bg-white/90 hover:bg-white text-gray-700 rounded-md transition-all"
                        title="Download"
                      >
                        <HiOutlineDownload size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !generating && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-canva-purple/10 flex items-center justify-center mb-3">
              <HiOutlineSparkles className="text-canva-purple" size={28} />
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Create with AI
            </p>
            <p className="text-xs text-gray-400 max-w-[200px]">
              {activeTab === 'images' && 'Describe an image and let AI generate it for you.'}
              {activeTab === 'videos' && 'Describe a video concept and let AI bring it to life.'}
              {activeTab === 'graphics' && 'Describe a graphic element and let AI design it.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
