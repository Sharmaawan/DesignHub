import React from 'react';

interface SkeletonLoaderProps {
  count?: number;
  height?: string;
  width?: string;
  circle?: boolean;
  className?: string;
}

export default function SkeletonLoader({
  count = 1,
  height = 'h-4',
  width = 'w-full',
  circle = false,
  className = '',
}: SkeletonLoaderProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`${width} ${height} ${
            circle ? 'rounded-full' : 'rounded-lg'
          } bg-gray-200 dark:bg-gray-700 animate-shimmer ${className}`}
        />
      ))}
    </>
  );
}
