import { useState, useCallback } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import toast from 'react-hot-toast';
import { HiOutlinePlay } from 'react-icons/hi';
import { PageTransitionType } from '../../types';

const TRANSITION_OPTIONS: { type: PageTransitionType; label: string; icon: string }[] = [
  { type: 'none', label: 'None', icon: '—' },
  { type: 'fade', label: 'Fade', icon: '🌅' },
  { type: 'slide', label: 'Slide', icon: '➡️' },
  { type: 'wipe', label: 'Wipe', icon: '🧹' },
  { type: 'dissolve', label: 'Dissolve', icon: '✨' },
  { type: 'pan', label: 'Pan', icon: '🎥' },
  { type: 'rise', label: 'Rise', icon: '⬆️' },
  { type: 'flow', label: 'Flow', icon: '🌊' },
  { type: 'matchAndMove', label: 'Match & Move', icon: '🔄' },
];

const DIRECTION_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
] as const;

const SHOW_DIRECTION_FOR: PageTransitionType[] = ['slide', 'wipe', 'pan'];

export default function PageTransitions() {
  const {
    currentPageIndex,
    pageTransitions,
    updatePageTransition,
    pages,
  } = useEditorStore();

  const [applyToAll, setApplyToAll] = useState(false);

  const currentTransition = pageTransitions[currentPageIndex] || {
    type: 'none' as PageTransitionType,
    duration: 0.5,
    delay: 0,
    direction: 'left' as const,
  };

  const handleSelectTransition = useCallback(
    (type: PageTransitionType) => {
      updatePageTransition(currentPageIndex, {
        type,
        duration: currentTransition.duration,
        delay: currentTransition.delay,
        direction: currentTransition.direction,
      });
      if (type !== 'none') {
        toast.success(`Transition: ${TRANSITION_OPTIONS.find((t) => t.type === type)?.label} applied to page ${currentPageIndex + 1}`);
      }
    },
    [currentPageIndex, currentTransition, updatePageTransition]
  );

  const handleDurationChange = useCallback(
    (value: number) => {
      updatePageTransition(currentPageIndex, { ...currentTransition, duration: value });
    },
    [currentPageIndex, currentTransition, updatePageTransition]
  );

  const handleDelayChange = useCallback(
    (value: number) => {
      updatePageTransition(currentPageIndex, { ...currentTransition, delay: value });
    },
    [currentPageIndex, currentTransition, updatePageTransition]
  );

  const handleDirectionChange = useCallback(
    (direction: 'left' | 'right' | 'up' | 'down') => {
      updatePageTransition(currentPageIndex, { ...currentTransition, direction });
    },
    [currentPageIndex, currentTransition, updatePageTransition]
  );

  const handleApplyToAll = useCallback(() => {
    pages.forEach((_, index) => {
      if (index !== currentPageIndex) {
        updatePageTransition(index, { ...currentTransition });
      }
    });
    setApplyToAll(true);
    toast.success(`Transition applied to all ${pages.length} pages`);
  }, [currentPageIndex, currentTransition, pages, updatePageTransition]);

  const handlePreview = useCallback(() => {
    const canvasEl = document.querySelector('.konvajs-content');
    if (!canvasEl || currentTransition.type === 'none') return;

    const animations: Record<string, Keyframe[]> = {
      fade: [{ opacity: 0 }, { opacity: 1 }],
      slide: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
      wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      dissolve: [{ opacity: 0, filter: 'blur(10px)' }, { opacity: 1, filter: 'blur(0)' }],
      pan: [{ transform: 'translateX(-20%) scale(1.1)' }, { transform: 'translateX(0) scale(1)' }],
      rise: [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      flow: [{ transform: 'scale(0.95) translateY(10px)', opacity: 0 }, { transform: 'scale(1) translateY(0)', opacity: 1 }],
      matchAndMove: [{ transform: 'scale(0.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    };

    const frames = animations[currentTransition.type];
    if (!frames) return;

    const duration = currentTransition.duration * 1000;
    (canvasEl as HTMLElement).animate(frames, {
      duration,
      delay: currentTransition.delay * 1000,
      fill: 'forwards',
      easing: 'ease-in-out',
    });
    toast.success(`Previewing ${currentTransition.type} transition`);
  }, [currentTransition]);

  const showDirection = currentTransition && SHOW_DIRECTION_FOR.includes(currentTransition.type);

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Page {currentPageIndex + 1} of {pages.length}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {TRANSITION_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => handleSelectTransition(opt.type)}
            className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs transition-all ${
              currentTransition.type === opt.type
                ? 'bg-canva-purple/10 text-canva-purple ring-1 ring-canva-purple/30'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <span className="text-base leading-none">{opt.icon}</span>
            <span className="text-center leading-tight">{opt.label}</span>
          </button>
        ))}
      </div>

      {currentTransition.type !== 'none' && (
        <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700/50">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Duration</span>
              <span className="font-mono">{currentTransition.duration.toFixed(1)}s</span>
            </div>
            <input
              type="range" min={0.1} max={3} step={0.1}
              value={currentTransition.duration}
              onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-canva-purple"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Delay</span>
              <span className="font-mono">{currentTransition.delay.toFixed(1)}s</span>
            </div>
            <input
              type="range" min={0} max={2} step={0.1}
              value={currentTransition.delay}
              onChange={(e) => handleDelayChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-canva-purple"
            />
          </div>

          {showDirection && (
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Direction</div>
              <div className="grid grid-cols-4 gap-1">
                {DIRECTION_OPTIONS.map((dir) => (
                  <button
                    key={dir.value}
                    onClick={() => handleDirectionChange(dir.value)}
                    className={`px-1.5 py-1 rounded text-xs transition-all ${
                      currentTransition.direction === dir.value
                        ? 'bg-canva-purple/10 text-canva-purple ring-1 ring-canva-purple/30'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {dir.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handlePreview}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-canva-purple hover:bg-canva-purple/90 rounded-lg text-xs font-medium text-white transition-colors"
            >
              <HiOutlinePlay size={14} />
              Preview
            </button>
            <button
              onClick={handleApplyToAll}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                applyToAll
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Apply to All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
