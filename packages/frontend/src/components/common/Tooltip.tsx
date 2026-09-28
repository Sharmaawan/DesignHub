import React, { useState } from 'react';

interface TooltipProps {
  children: React.ReactNode;
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export default function Tooltip({
  children,
  text,
  position = 'top',
  delay = 0,
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutId) clearTimeout(timeoutId);
    const id = setTimeout(() => {
      setIsVisible(true);
    }, delay);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
  };

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {isVisible && (
        <div
          className={`absolute ${positionClasses[position]} px-2 py-1 bg-gray-900 dark:bg-gray-950 text-white text-xs rounded whitespace-nowrap pointer-events-none z-50 animate-fade-in ${className}`}
        >
          {text}
          {/* Arrow */}
          <div
            className={`absolute w-1.5 h-1.5 bg-gray-900 dark:bg-gray-950 ${
              position === 'top' ? 'bottom-[-3px] left-1/2 -translate-x-1/2 rotate-45' :
              position === 'bottom' ? 'top-[-3px] left-1/2 -translate-x-1/2 rotate-45' :
              position === 'left' ? 'right-[-3px] top-1/2 -translate-y-1/2 rotate-45' :
              'left-[-3px] top-1/2 -translate-y-1/2 rotate-45'
            }`}
          />
        </div>
      )}
    </div>
  );
}
