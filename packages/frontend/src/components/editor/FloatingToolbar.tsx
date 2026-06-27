import { useEditorStore } from '../../stores/editorStore';
import {
  HiOutlineTrash, HiOutlineDuplicate, HiOutlineLockClosed, HiOutlineLockOpen,
  HiOutlineEye, HiOutlineEyeOff, HiOutlineArrowUp, HiOutlineArrowDown,
  HiOutlineArrowSmUp, HiOutlineArrowSmDown,
} from 'react-icons/hi';

export default function FloatingToolbar() {
  const {
    pages, currentPageIndex, selectedElementIds,
    removeElements, duplicateElements, bringForward, sendBackward,
    bringToFront, sendToBack, lockElement, unlockElement, hideElement, showElement,
  } = useEditorStore();

  const page = pages[currentPageIndex];
  const element = page?.elements.find((e) => selectedElementIds.includes(e.id));

  if (!element || selectedElementIds.length === 0) return null;

  const buttons = [
    {
      icon: HiOutlineDuplicate, label: 'Duplicate', action: () => duplicateElements([element.id]),
      shortcut: 'Ctrl+D',
    },
    { type: 'divider' },
    {
      icon: element.locked ? HiOutlineLockClosed : HiOutlineLockOpen,
      label: element.locked ? 'Unlock' : 'Lock',
      action: () => element.locked ? unlockElement(element.id) : lockElement(element.id),
      active: element.locked,
    },
    {
      icon: element.visible ? HiOutlineEye : HiOutlineEyeOff,
      label: element.visible ? 'Hide' : 'Show',
      action: () => element.visible ? hideElement(element.id) : showElement(element.id),
      active: !element.visible,
    },
    { type: 'divider' },
    {
      icon: HiOutlineArrowSmUp, label: 'Forward', action: () => bringForward(element.id),
    },
    {
      icon: HiOutlineArrowUp, label: 'Front', action: () => bringToFront(element.id),
    },
    {
      icon: HiOutlineArrowSmDown, label: 'Backward', action: () => sendBackward(element.id),
    },
    {
      icon: HiOutlineArrowDown, label: 'Back', action: () => sendToBack(element.id),
    },
    { type: 'divider' },
    {
      icon: HiOutlineTrash, label: 'Delete', action: () => removeElements([element.id]),
      danger: true,
      shortcut: 'Del',
    },
  ];

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
      <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-1">
        {buttons.map((btn, i) => {
          if ('type' in btn && btn.type === 'divider') {
            return <div key={`d${i}`} className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-0.5" />;
          }
          const b = btn as { icon: any; label: string; action: () => void; active?: boolean; danger?: boolean; shortcut?: string };
          return (
            <button
              key={b.label}
              onClick={b.action}
              title={`${b.label}${b.shortcut ? ` (${b.shortcut})` : ''}`}
              className={`p-2 rounded-lg transition-all ${
                b.danger
                  ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                  : b.active
                  ? 'text-canva-purple bg-canva-purple/10'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              <b.icon size={16} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
