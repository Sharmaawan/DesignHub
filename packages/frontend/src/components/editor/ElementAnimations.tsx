import { useState, useCallback, useRef } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import toast from 'react-hot-toast';
import { HiOutlinePlay, HiOutlinePause } from 'react-icons/hi';
import { ElementAnimationType } from '../../types';

const ANIMATION_OPTIONS: { type: ElementAnimationType; label: string; icon: string }[] = [
  { type: 'none', label: 'None', icon: '—' },
  { type: 'fadeIn', label: 'Fade In', icon: '🌅' },
  { type: 'pop', label: 'Pop', icon: '💥' },
  { type: 'bounce', label: 'Bounce', icon: '⚡' },
  { type: 'slide', label: 'Slide', icon: '➡️' },
  { type: 'rise', label: 'Rise', icon: '⬆️' },
  { type: 'zoom', label: 'Zoom', icon: '🔍' },
  { type: 'rotate', label: 'Rotate', icon: '🔄' },
  { type: 'typewriter', label: 'Typewriter', icon: '⌨️' },
  { type: 'pulse', label: 'Pulse', icon: '💓' },
];

const DIRECTION_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
] as const;

const SHOW_DIRECTION_FOR: ElementAnimationType[] = ['slide', 'rise'];

export default function ElementAnimations() {
  const {
    selectedElementIds,
    elementAnimations,
    setElementAnimation,
    pages,
    currentPageIndex,
  } = useEditorStore();

  const [previewing, setPreviewing] = useState(false);
  const previewRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedElementId = selectedElementIds[0] || null;
  const currentAnimation = selectedElementId
    ? elementAnimations[selectedElementId] || { type: 'none' as ElementAnimationType, duration: 0.5, delay: 0, direction: 'left' as const }
    : null;

  const page = pages[currentPageIndex];
  const selectedElement = page?.elements.find((e) => e.id === selectedElementId);

  const handleSelectAnimation = useCallback(
    (type: ElementAnimationType) => {
      if (!selectedElementId) return;
      const base = currentAnimation || { type: 'none' as ElementAnimationType, duration: 0.5, delay: 0, direction: 'left' as const };
      setElementAnimation(selectedElementId, {
        type,
        duration: base.duration,
        delay: base.delay,
        direction: base.direction,
      });
      if (type !== 'none') {
        toast.success(`Animation: ${ANIMATION_OPTIONS.find((a) => a.type === type)?.label} applied`);
      }
    },
    [selectedElementId, currentAnimation, setElementAnimation]
  );

  const handleDurationChange = useCallback(
    (value: number) => {
      if (!selectedElementId || !currentAnimation) return;
      setElementAnimation(selectedElementId, { ...currentAnimation, duration: value });
    },
    [selectedElementId, currentAnimation, setElementAnimation]
  );

  const handleDelayChange = useCallback(
    (value: number) => {
      if (!selectedElementId || !currentAnimation) return;
      setElementAnimation(selectedElementId, { ...currentAnimation, delay: value });
    },
    [selectedElementId, currentAnimation, setElementAnimation]
  );

  const handleDirectionChange = useCallback(
    (direction: 'left' | 'right' | 'up' | 'down') => {
      if (!selectedElementId || !currentAnimation) return;
      setElementAnimation(selectedElementId, { ...currentAnimation, direction });
    },
    [selectedElementId, currentAnimation, setElementAnimation]
  );

  const handlePreview = useCallback(() => {
    if (!selectedElementId || !selectedElement || currentAnimation?.type === 'none') return;

    const el = document.getElementById(`canvas-element-${selectedElementId}`);
    if (!el) {
      toast.error('Could not find element to preview');
      return;
    }

    if (previewRef.current) clearTimeout(previewRef.current);

    // Apply CSS animation
    const keyframes: Record<string, Keyframe[]> = {
      fadeIn: [{ opacity: 0 }, { opacity: 1 }],
      pop: [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.1)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }],
      bounce: [{ transform: 'translateY(-20px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      slide: [{ transform: 'translateX(-100%)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
      rise: [{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      zoom: [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      rotate: [{ transform: 'rotate(-180deg) scale(0)', opacity: 0 }, { transform: 'rotate(0) scale(1)', opacity: 1 }],
      pulse: [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.05)', opacity: 0.8 }, { transform: 'scale(1)', opacity: 1 }],
    };

    const frames = keyframes[currentAnimation?.type || 'fadeIn'];
    if (!frames) return;

    setPreviewing(true);
    const duration = (currentAnimation?.duration || 0.5) * 1000;
    const anim = el.animate(frames, { duration, delay: (currentAnimation?.delay || 0) * 1000, fill: 'forwards', easing: 'ease-out' });

    anim.onfinish = () => {
      setPreviewing(false);
      el.getAnimations().forEach(a => a.cancel());
    };

    const totalTime = duration + (currentAnimation?.delay || 0) * 1000 + 500;
    previewRef.current = setTimeout(() => {
      setPreviewing(false);
      el.getAnimations().forEach(a => a.cancel());
    }, totalTime);
  }, [selectedElementId, selectedElement, currentAnimation]);

  const handleRemoveAnimation = useCallback(() => {
    if (!selectedElementId) return;
    setElementAnimation(selectedElementId, { type: 'none', duration: 0.5, delay: 0 });
    toast.success('Animation removed');
  }, [selectedElementId, setElementAnimation]);

  if (!selectedElementId || !selectedElement) {
    return (
      <div className="p-3 text-xs text-gray-400 dark:text-gray-500 text-center">
        Select an element to add animations
      </div>
    );
  }

  const showDirection = currentAnimation && SHOW_DIRECTION_FOR.includes(currentAnimation.type);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {ANIMATION_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            onClick={() => handleSelectAnimation(opt.type)}
            className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-xs transition-all ${
              currentAnimation?.type === opt.type
                ? 'bg-canva-purple/10 text-canva-purple ring-1 ring-canva-purple/30'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            <span className="text-base leading-none">{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      {currentAnimation && currentAnimation.type !== 'none' && (
        <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700/50">
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Duration</span>
              <span className="font-mono">{currentAnimation.duration.toFixed(1)}s</span>
            </div>
            <input
              type="range" min={0.1} max={5} step={0.1}
              value={currentAnimation.duration}
              onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-canva-purple"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Delay</span>
              <span className="font-mono">{currentAnimation.delay.toFixed(1)}s</span>
            </div>
            <input
              type="range" min={0} max={3} step={0.1}
              value={currentAnimation.delay}
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
                      currentAnimation.direction === dir.value
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
              disabled={previewing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-canva-purple hover:bg-canva-purple/90 disabled:bg-canva-purple/50 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition-colors"
            >
              {previewing ? <HiOutlinePause size={14} /> : <HiOutlinePlay size={14} />}
              {previewing ? 'Playing...' : 'Preview'}
            </button>
            <button
              onClick={handleRemoveAnimation}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 rounded-lg text-xs text-gray-500 dark:text-gray-400 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
