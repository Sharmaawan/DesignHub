import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { ImageData } from '../../types';
import toast from 'react-hot-toast';
import {
  HiOutlineTrash, HiOutlineDuplicate, HiOutlineLockClosed, HiOutlineLockOpen,
  HiOutlineEye, HiOutlineEyeOff, HiOutlineArrowUp, HiOutlineArrowDown,
  HiOutlineArrowSmUp, HiOutlineArrowSmDown, HiOutlineSwitchVertical,
  HiOutlineClipboard, HiOutlineDocumentDownload, HiOutlineTemplate,
  HiOutlinePhotograph, HiOutlineChat, HiOutlineLink, HiOutlineClock,
  HiOutlineInformationCircle,
} from 'react-icons/hi';

type ToolbarItem = { icon: any; label: string; action: () => void; shortcut?: string };

// Gap between the toolbar and the selection's bounding box, and the min clearance
// from the container's top edge before we flip the toolbar to sit below the
// selection instead of above it (matches real Canva: the contextual toolbar tracks
// the selection and flips side when it would otherwise run off-screen).
const GAP = 12;
const TOP_CLEARANCE = 56;

function rotatedCorners(x: number, y: number, w: number, h: number, rotationDeg: number) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Konva rotates a node around its own (x, y) — i.e. the top-left corner, since no
  // element sets an offsetX/offsetY — so that's the pivot here too.
  return [[0, 0], [w, 0], [w, h], [0, h]].map(([lx, ly]) => ({
    x: x + lx * cos - ly * sin,
    y: y + lx * sin + ly * cos,
  }));
}

export default function FloatingToolbar() {
  const {
    pages, currentPageIndex, selectedElementIds, zoom, panX, panY,
    duplicateElements, bringForward, sendBackward,
    bringToFront, sendToBack, lockElement, unlockElement, hideElement, showElement,
    copy, paste, updateElement, commentsOpen, setCommentsOpen,
    setElementAsPageBackground, setSidePanelTab, sidePanelTab,
  } = useEditorStore();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const page = pages[currentPageIndex];
  const selectedElements = page?.elements.filter((e) => selectedElementIds.includes(e.id)) || [];
  const element = page?.elements.find((e) => selectedElementIds.includes(e.id));

  // Selecting something else should never leave a stale dropdown open over the wrong element.
  useEffect(() => { setOpenDropdown(null); }, [selectedElementIds.join(',')]);

  // Click anywhere outside the toolbar closes whatever dropdown is open — clicks on
  // other triggers/items inside the toolbar are handled by their own onClick instead.
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpenDropdown(null);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [openDropdown]);

  // The toolbar and the Konva Stage are both direct children of the same
  // `position: relative` canvas-area div (see EditorPage.tsx) — reading its size off
  // our own offsetParent avoids prop-drilling containerSize down from EditorCanvas.
  useLayoutEffect(() => {
    const parent = wrapperRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const { clientWidth, clientHeight } = parent;
    setContainerSize((prev) => (prev.width === clientWidth && prev.height === clientHeight ? prev : { width: clientWidth, height: clientHeight }));
  });

  if (!element || selectedElementIds.length === 0) return null;

  // Union bounding box (world space) across every selected element, rotation-aware,
  // then projected to screen space with the same panX/panY/zoom transform the Stage
  // itself uses — so the toolbar tracks the selection through pan/zoom/rotate.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of selectedElements) {
    for (const c of rotatedCorners(el.x, el.y, el.width, el.height, el.rotation)) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
  }
  const screenLeft = panX + minX * zoom;
  const screenTop = panY + minY * zoom;
  const screenRight = panX + maxX * zoom;
  const screenBottom = panY + maxY * zoom;
  const screenCenterX = (screenLeft + screenRight) / 2;

  const flipBelow = screenTop < TOP_CLEARANCE;
  const anchorTop = flipBelow ? screenBottom + GAP : screenTop - GAP;
  const clampedLeft = containerSize.width > 0
    ? Math.min(Math.max(screenCenterX, 80), containerSize.width - 80)
    : screenCenterX;

  const handleAlignCenter = () => {
    if (!page) return;
    const x = (page.width - element.width) / 2;
    const y = (page.height - element.height) / 2;
    updateElement(element.id, { x, y });
  };

  // Matches real Canva: the image becomes a page-level background — auto-cropped to
  // exactly cover the page (no letterboxing), pinned to the very back, and no longer a
  // draggable/resizable/deletable element (it's removed from `elements` entirely, not
  // just resized to fill the page and left selectable like the old version of this
  // button did). Cover-fit math matches LeftSidebar.tsx's handleAddSearchedBackgroundPhoto.
  const handleSetAsBackground = () => {
    if (!page || element.type !== 'image') return;
    const data = element.data as ImageData;
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const targetRatio = page.width / page.height;
      const srcRatio = img.naturalWidth / img.naturalHeight;
      let cropX = 0, cropY = 0, cropWidth = 100, cropHeight = 100;
      if (srcRatio > targetRatio) {
        cropWidth = (targetRatio / srcRatio) * 100;
        cropX = (100 - cropWidth) / 2;
      } else if (srcRatio < targetRatio) {
        cropHeight = (srcRatio / targetRatio) * 100;
        cropY = (100 - cropHeight) / 2;
      }
      setElementAsPageBackground(element.id, { src: data.src, cropX, cropY, cropWidth, cropHeight });
      toast.success('Set as background');
    };
    img.onerror = () => toast.error('Could not load that image');
    img.src = data.src;
  };

  const handleImageInfo = () => {
    if (element.type === 'image') {
      alert(`Image: ${element.width}x${element.height} at (${element.x}, ${element.y})`);
    }
  };

  const buttons = [
    {
      icon: HiOutlineClipboard, label: 'Copy', dropdown: [
        { icon: HiOutlineClipboard, label: 'Copy', action: () => copy(), shortcut: 'Ctrl+C' },
        { icon: HiOutlineDocumentDownload, label: 'Paste', action: () => paste(), shortcut: 'Ctrl+V' },
        { icon: HiOutlineDuplicate, label: 'Duplicate', action: () => duplicateElements([element.id]), shortcut: 'Ctrl+D' },
      ] as ToolbarItem[],
    },
    { type: 'divider' },
    {
      icon: HiOutlineTemplate, label: 'Align Center', action: handleAlignCenter,
    },
    ...(element.type === 'image' ? [{
      icon: HiOutlinePhotograph, label: 'Set as Background', action: handleSetAsBackground,
    }] : []),
    { type: 'divider' },
    {
      icon: HiOutlineSwitchVertical, label: 'Position', dropdown: [
        { icon: HiOutlineArrowSmUp, label: 'Forward', action: () => bringForward(element.id) },
        { icon: HiOutlineArrowUp, label: 'Bring to Front', action: () => bringToFront(element.id) },
        { icon: HiOutlineArrowSmDown, label: 'Backward', action: () => sendBackward(element.id) },
        { icon: HiOutlineArrowDown, label: 'Send to Back', action: () => sendToBack(element.id) },
      ] as ToolbarItem[],
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
      icon: HiOutlineChat, label: 'Comment', action: () => setCommentsOpen(!commentsOpen),
      active: commentsOpen,
    },
    {
      icon: HiOutlineLink, label: 'Link', action: () => alert('Link feature - coming soon'),
    },
    {
      icon: HiOutlineClock, label: 'Animate', action: () => setSidePanelTab(sidePanelTab === 'animations' ? '' : 'animations'),
      active: sidePanelTab === 'animations',
    },
    ...(element.type === 'image' ? [{
      icon: HiOutlineInformationCircle, label: 'Image Info', action: handleImageInfo,
    }] : []),
    { type: 'divider' },
    {
      // Soft-delete: this is the fast, everyday action, so it hides rather than
      // permanently removes — recoverable from the Layers panel. Actually deleting
      // for good is a deliberate act that lives in the Layers panel instead, gated
      // behind a confirmation there.
      icon: HiOutlineTrash, label: 'Delete', action: () => hideElement(element.id),
      danger: true,
      shortcut: 'Del',
    },
  ];

  return (
    <div
      ref={wrapperRef}
      className="absolute z-30"
      style={{ left: clampedLeft, top: anchorTop, transform: `translate(-50%, ${flipBelow ? '0' : '-100%'})` }}
    >
      <div className="flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-1">
        {buttons.map((btn, i) => {
          if ('type' in btn && btn.type === 'divider') {
            return <div key={`d${i}`} className="w-px h-6 bg-gray-200 dark:bg-gray-600 mx-0.5" />;
          }
          if ('dropdown' in btn && btn.dropdown) {
            const isOpen = openDropdown === btn.label;
            return (
              <div key={btn.label} className="relative">
                <button
                  onClick={() => setOpenDropdown(isOpen ? null : btn.label)}
                  title={btn.label}
                  className={`p-2 rounded-lg transition-all ${
                    isOpen
                      ? 'text-canva-purple bg-canva-purple/10'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <btn.icon size={16} />
                </button>
                {isOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 min-w-[170px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-40">
                    {btn.dropdown.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => { item.action(); setOpenDropdown(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                      >
                        <item.icon size={14} className="flex-shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && <span className="text-gray-400">{item.shortcut}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
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
