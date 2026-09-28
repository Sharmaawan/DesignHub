import React, { useEffect, useState } from 'react';
import { HiOutlineCheckCircle, HiOutlineExclamationCircle, HiOutlineInformationCircle, HiOutlineXCircle, HiOutlineX } from 'react-icons/hi';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationProps {
  type: NotificationType;
  title?: string;
  message: string;
  autoClose?: number;
  onClose?: () => void;
  className?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function Notification({
  type,
  title,
  message,
  autoClose = 4000,
  onClose,
  className = '',
  action,
}: NotificationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (autoClose && autoClose > 0) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  if (!isVisible) return null;

  const icons = {
    success: <HiOutlineCheckCircle size={20} />,
    error: <HiOutlineXCircle size={20} />,
    warning: <HiOutlineExclamationCircle size={20} />,
    info: <HiOutlineInformationCircle size={20} />,
  };

  const colors = {
    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200',
    error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
    warning: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
  };

  const iconColors = {
    success: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
    warning: 'text-amber-600 dark:text-amber-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  return (
    <div
      className={`border rounded-lg p-4 flex items-start gap-3 animate-slide-up ${colors[type]} ${className}`}
    >
      <div className={`flex-shrink-0 mt-0.5 ${iconColors[type]}`}>
        {icons[type]}
      </div>
      <div className="flex-1">
        {title && <h3 className="font-semibold text-sm mb-1">{title}</h3>}
        <p className="text-sm">{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 text-sm font-medium hover:opacity-75 transition-opacity"
          >
            {action.label}
          </button>
        )}
      </div>
      <button
        onClick={() => {
          setIsVisible(false);
          onClose?.();
        }}
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
        title="Close"
      >
        <HiOutlineX size={18} />
      </button>
    </div>
  );
}
