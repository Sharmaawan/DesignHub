import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer, Line } from 'react-konva';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement, Page, TextData, ImageData, ShapeData, TableData, ChartData, VideoData, AudioData, PageBackgroundImage, ElementAnimation, ElementAnimationType } from '../../types';
import Konva from 'konva';
import { Collaborator } from '../../hooks/useCollaboration';
import { timelineClock as defaultTimelineClock, TimelineClock } from '../../lib/timelineClock';
import { uploadAPI, BACKEND_ORIGIN as BACKEND } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  HiOutlineClipboard, HiOutlineDocumentDownload, HiOutlineDuplicate,
  HiOutlineArrowSmUp, HiOutlineArrowUp, HiOutlineArrowSmDown, HiOutlineArrowDown,
  HiOutlineLockClosed, HiOutlineLockOpen, HiOutlineEye, HiOutlineEyeOff, HiOutlineTrash,
  HiOutlinePhotograph, HiMinus, HiPlus, HiChat,
} from 'react-icons/hi';

interface EditorCanvasProps {
  page: Page;
  // Preview mode needs its own zoom/pan (fit-to-frame) and needs grid/rulers/guides
  // forced off, independent of whatever the live editor's global view state happens
  // to be — passing them in here avoids having to temporarily mutate (and restore)
  // shared store state, which is what made the earlier preview attempt fragile.
  zoomOverride?: number;
  panOverride?: { x: number; y: number };
  hideChrome?: boolean;
  collaborators?: Collaborator[];
  onCursorMove?: (x: number, y: number) => void;
  // Which shared clock drives this canvas's video/audio elements — defaults to the
  // module-level singleton the live editor uses. Preview mode passes its own isolated
  // instance since it can be mounted at the same time as the live editor canvas.
  clock?: TimelineClock;
}

// Konva starts a drag on the very first pixel of pointer movement by default, so a
// slightly unsteady click (not a real drag gesture) would nudge the element before
// the click even registers as a click. A few pixels of dead zone is the same fix
// Canva/Figma use — real drags are unaffected, accidental ones are absorbed.
Konva.dragDistance = 4;

// Page backgrounds can be a plain color OR a CSS `linear-gradient(...)` string (set
// by the Background panel's gradient swatches). Konva's `fill` prop is passed
// straight to canvas fillStyle, which can't parse CSS gradient syntax and silently
// falls back to black — so gradients need Konva's native fillLinearGradient* props
// instead, computed from the parsed angle/stops.
function parseLinearGradient(css: string): { angleDeg: number; stops: { offset: number; color: string }[] } | null {
  const match = /^linear-gradient\(\s*([\d.]+)deg\s*,\s*(.+)\)$/i.exec(css.trim());
  if (!match) return null;
  const angleDeg = parseFloat(match[1]);
  const parts = match[2].split(',').map((p) => p.trim());
  const stops = parts.map((part, i) => {
    const stopMatch = /^(.+?)\s+([\d.]+)%$/.exec(part);
    if (stopMatch) {
      return { offset: parseFloat(stopMatch[2]) / 100, color: stopMatch[1].trim() };
    }
    return { offset: parts.length > 1 ? i / (parts.length - 1) : 0, color: part };
  });
  return { angleDeg, stops };
}

function getGradientLine(angleDeg: number, width: number, height: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const length = Math.abs(width * dx) + Math.abs(height * dy);
  const cx = width / 2;
  const cy = height / 2;
  const half = length / 2;
  return {
    start: { x: cx - dx * half, y: cy - dy * half },
    end: { x: cx + dx * half, y: cy + dy * half },
  };
}

// "Show rulers" toggle existed in the store and the Settings UI but nothing ever
// rendered a ruler — this is that missing piece. Ticks are drawn in world (page)
// coordinates transformed by the same zoom/pan the Stage itself uses, so they line
// up with the actual canvas regardless of zoom level or how far it's panned.
const RULER_SIZE = 20;
const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

function Ruler({ zoom, panX, panY, width, height }: { zoom: number; panX: number; panY: number; width: number; height: number }) {
  const rawStep = 80 / zoom;
  const step = NICE_STEPS.find((s) => s >= rawStep) || NICE_STEPS[NICE_STEPS.length - 1];

  const hTicks: { screenX: number; label: number }[] = [];
  const startWorldX = Math.floor(-panX / zoom / step) * step;
  for (let wx = startWorldX; wx * zoom + panX < width; wx += step) {
    hTicks.push({ screenX: wx * zoom + panX, label: wx });
  }

  const vTicks: { screenY: number; label: number }[] = [];
  const startWorldY = Math.floor(-panY / zoom / step) * step;
  for (let wy = startWorldY; wy * zoom + panY < height; wy += step) {
    vTicks.push({ screenY: wy * zoom + panY, label: wy });
  }

  return (
    <>
      <div className="absolute top-0 left-5 right-0 h-5 bg-white/95 dark:bg-gray-900/95 border-b border-gray-200 dark:border-gray-700 overflow-hidden pointer-events-none z-20">
        {hTicks.map((t) => (
          <div key={t.label} className="absolute top-0 h-full" style={{ left: t.screenX }}>
            <div className="w-px h-2 bg-gray-400 dark:bg-gray-500" />
            <span className="text-[9px] text-gray-500 dark:text-gray-400 absolute top-2 left-0.5 whitespace-nowrap">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="absolute top-5 left-0 bottom-0 w-5 bg-white/95 dark:bg-gray-900/95 border-r border-gray-200 dark:border-gray-700 overflow-hidden pointer-events-none z-20">
        {vTicks.map((t) => (
          <div key={t.label} className="absolute left-0" style={{ top: t.screenY }}>
            <div className="h-px w-2 bg-gray-400 dark:bg-gray-500" />
            <span
              className="text-[9px] text-gray-500 dark:text-gray-400 absolute whitespace-nowrap origin-top-left"
              style={{ left: 12, top: 1, transform: 'rotate(90deg)' }}
            >
              {t.label}
            </span>
          </div>
        ))}
      </div>
      <div className="absolute top-0 left-0 w-5 h-5 bg-white/95 dark:bg-gray-900/95 border-r border-b border-gray-200 dark:border-gray-700 z-20" />
    </>
  );
}

export default function EditorCanvas({ page, zoomOverride, panOverride, hideChrome, collaborators, onCursorMove, clock = defaultTimelineClock }: EditorCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Middle-mouse-drag and Space+drag both pan the canvas, matching Figma/Canva —
  // separate from the existing scroll-to-pan. Set at pan-drag start, read on every
  // subsequent mousemove until mouseup; not React state since it needs to be
  // read/written synchronously inside the same mousedown/mousemove handlers that
  // already exist for selection/drawing, with no re-render in between.
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; panX: number; panY: number } | null>(null);
  // The text-edit <textarea> is a plain DOM overlay (see handleElementDblClick),
  // positioned once in absolute screen pixels at the moment it's created — it isn't
  // part of the Konva scene, so panning/zooming afterward moved the rest of the
  // canvas out from under it instead of moving it along too. This ref lets the
  // pan/zoom effect below find and reposition it live while it's open.
  const activeTextEditRef = useRef<{ textarea: HTMLTextAreaElement; elementId: string } | null>(null);

  // A double-click is two separate mousedown/mouseup cycles under the hood — Konva
  // has no way to know the first one is "really" the start of a double-click, so if
  // the pointer drifts past the drag threshold during that first click (very easy on
  // a trackpad, or just an unsteady hand), it commits as a genuine drag-and-drop
  // before the second click ever lands. The element jumps to wherever the cursor
  // happened to be, sometimes well outside the page, right as text-edit mode opens —
  // this is what reads as "double-clicking to edit throws the text somewhere else."
  // dragStartPosRef captures the pre-drag position so dragEnd can hand it off;
  // lastDragRef remembers it briefly so a dblclick landing right after can silently
  // snap the element back before opening the editor, as if the accidental drag never
  // happened.
  const dragStartPosRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const lastDragRef = useRef<{ id: string; prevX: number; prevY: number; time: number } | null>(null);

  // Real fix for the same root problem: elements are never Konva-`draggable` by
  // default any more. A mousedown just records a drag *candidate* here; only once
  // the pointer has actually moved past ELEMENT_DRAG_THRESHOLD screen pixels (checked
  // in handleStageMouseMove below) do we call node.startDrag() and hand off to Konva's
  // normal drag lifecycle (the existing onDragStart/onDragMove/onDragEnd handlers are
  // unchanged and fire exactly as before once engaged). Below that threshold, Konva
  // never considers the gesture a drag at all, so its own click/dblclick detection —
  // which otherwise suppresses click events after ANY drag, however small — is never
  // affected. That's what a plain double-click needs: two clicks whose few pixels of
  // natural jitter never register as movement in the first place.
  const ELEMENT_DRAG_THRESHOLD = 5;
  const pendingElementDragRef = useRef<{ id: string; node: Konva.Node; startX: number; startY: number; engaged: boolean } | null>(null);

  const handleElementMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, id: string) => {
    const element = page.elements.find((el) => el.id === id);
    if (!element || element.locked || activeTool !== 'select') return;
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    // Text-with-background (and curved text) renders as a Group wrapping a Rect +
    // Text child — `id`/commonProps live on the Group, but e.target on a mousedown
    // is whichever CHILD shape was actually hit. Konva's own built-in `draggable`
    // walks up to the nearest draggable ancestor automatically; calling startDrag()
    // straight on e.target skips that resolution and drags the child in its own
    // group-local coordinate space instead of the element's real page position —
    // exactly the "element teleports somewhere nonsensical" bug. Looking the node up
    // by id always gets the actual top-level node commonProps was applied to.
    const node = stageRef.current?.findOne('#' + id) ?? e.target;
    pendingElementDragRef.current = { id, node, startX: pos.x, startY: pos.y, engaged: false };
  };

  // Drag-to-reposition/zoom for the page background image (double-click it, or the
  // Design panel's "Edit Background" button, to enter — matching Canva).
  // repositioningBg itself lives in the store (see editorStore.ts) so RightSidebar
  // can trigger/reflect it too; dragPreviewOffset gives live feedback during an
  // active drag without writing to the store (and the undo stack) on every
  // mousemove frame — only onDragEnd commits, so it stays local to this component.
  const [dragPreviewOffset, setDragPreviewOffset] = useState<{ x: number; y: number } | null>(null);

  // Smart alignment guides (Canva/Figma-style pink lines): computed once at drag
  // start from every other element's bounds on the page, then checked against the
  // dragged element's current position on every move. Kept in a ref (not state)
  // so building the snapshot never re-renders anything — only the visible guide
  // lines themselves are state, and only change when they actually appear/disappear.
  const dragGuideContextRef = useRef<{ vLines: number[]; hLines: number[] } | null>(null);
  const [activeGuideLines, setActiveGuideLines] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  // Auto-grouped image+frame pairs (see maybeAutoGroup below) need to move together
  // when either member is dragged — Konva only moves the node you actually grabbed,
  // so this tracks the dragged element's group siblings + their positions at drag
  // start, and every sibling Konva node is nudged by the same delta on each move.
  const groupDragRef = useRef<{ draggedId: string; startX: number; startY: number; siblings: { id: string; x: number; y: number }[] } | null>(null);

  const {
    zoom: storeZoom, selectedElementIds, showGrid: storeShowGrid, gridSize, snapEnabled,
    showGuides: storeShowGuides, showRulers: storeShowRulers,
    panX: storePanX, panY: storePanY,
    selectElement, setSelectedElementIds, deselectAll, moveElement, updateElement, setZoom, setPan,
    setHoveredElement, pushHistory, setViewportCenter, addElement,
    activeTool, drawColor, drawWidth, addDrawing,
    isPlaying, setPlayheadMs, setIsPlaying,
    copy, paste, duplicateElements, bringForward, sendBackward, bringToFront, sendToBack,
    lockElement, unlockElement, hideElement, showElement, setElementAsPageBackground,
    updatePage, currentPageIndex, fitRequestId, repositioningBg, setRepositioningBg,
    autoGroupWithFrame, zoomToFit, rightPanelOpen, setRightPanelOpen,
    comments, setCommentsOpen,
  } = useEditorStore();
  const [currentStroke, setCurrentStroke] = useState<number[]>([]);
  const isDrawingRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ elementId: string; x: number; y: number } | null>(null);

  const zoom = zoomOverride ?? storeZoom;
  const panX = panOverride?.x ?? storePanX;
  const panY = panOverride?.y ?? storePanY;
  const showGrid = hideChrome ? false : storeShowGrid;
  const showGuides = hideChrome ? false : storeShowGuides;
  const showRulers = hideChrome ? false : storeShowRulers;

  const bgGradient = useMemo(() => {
    const parsed = parseLinearGradient(page.backgroundColor);
    if (!parsed) return null;
    const line = getGradientLine(parsed.angleDeg, page.width, page.height);
    return {
      start: line.start,
      end: line.end,
      colorStops: parsed.stops.flatMap((s) => [s.offset, s.color]),
    };
  }, [page.backgroundColor, page.width, page.height]);

  // A hidden/muted TRACK (timeline track controls — separate from a single
  // element's own visible/locked flags) overrides every clip assigned to it.
  const hiddenTrackIds = new Set((page.tracks || []).filter((t) => t.hidden).map((t) => t.id));
  const mutedTrackIds = new Set((page.tracks || []).filter((t) => t.muted).map((t) => t.id));

  const sortedElements = [...page.elements]
    .sort((a, b) => a.zIndex - b.zIndex)
    .filter((e) => e.visible && !(e.trackId && hiddenTrackIds.has(e.trackId)));

  // Icons always resize proportionally (corner handles only) — dragging a side handle
  // without this would squash one axis, which the contain-fit icon renderer then shows
  // as the whole icon shrinking to fit the smaller dimension (looks like it "disappeared").
  const singleSelected = selectedElementIds.length === 1
    ? page.elements.find((e) => e.id === selectedElementIds[0])
    : null;
  const isIconSelected = singleSelected?.type === 'icon';

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Drive the shared video-timeline clock off this page's duration and the store's
  // isPlaying flag. The clock's own per-frame tick never touches React state — only
  // its throttled UI subscription does, which is what feeds the scrubber.
  // Only the live editor canvas (the default singleton clock) is driven by the global
  // store's isPlaying/playheadMs — a canvas given its own clock instance (Preview) owns
  // its play/pause/duration/UI-tick wiring itself, so it doesn't fight over global state
  // with whichever other EditorCanvas happens to be mounted at the same time.
  const drivesGlobalPlayback = clock === defaultTimelineClock;

  useEffect(() => {
    if (!drivesGlobalPlayback) return;
    clock.setDuration(page.duration || 0);
  }, [drivesGlobalPlayback, clock, page.duration]);

  useEffect(() => {
    if (!drivesGlobalPlayback) return;
    if (isPlaying) clock.play();
    else clock.pause();
  }, [drivesGlobalPlayback, clock, isPlaying]);

  useEffect(() => {
    if (!drivesGlobalPlayback) return;
    return clock.subscribeUi((ms) => setPlayheadMs(ms));
  }, [drivesGlobalPlayback, clock, setPlayheadMs]);

  // The clock can stop itself (reaching the end of the scene's duration) without the
  // store's isPlaying ever being told — without this, the Play/Pause button would keep
  // showing "Pause" forever after a scene finishes on its own.
  useEffect(() => {
    if (!drivesGlobalPlayback) return;
    return clock.onEnd(() => setIsPlaying(false));
  }, [drivesGlobalPlayback, clock, setIsPlaying]);

  // Track Shift key for aspect ratio locking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Track Space for hand-tool panning (Figma/Canva convention) — ignored while an
  // input/textarea/contentEditable is focused (page name, captions, etc.) so a
  // literal typed space is never hijacked into a pan gesture.
  useEffect(() => {
    const isTypingTarget = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget()) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // The zoom the page opens at (whole page visible, comfortably inset) — remembered
  // so plain scroll can tell "still at the default view" apart from "zoomed in or
  // out from it." Only the latter should pan; scrolling shouldn't nudge the page
  // around during normal editing at the view it naturally starts at.
  const fitZoomRef = useRef<number | null>(null);
  const prevFitRequestIdRef = useRef(fitRequestId);
  // Explicitly set by applyZoom (the single funnel for every user-initiated zoom
  // action) whenever the user zooms in past fit, and cleared by the "Fit to screen"
  // action — this replaces a previous epsilon-comparison against a cached zoom
  // value, which could silently drift out of sync with what actually fits: a
  // debug-logged real session showed panX stuck at a value that was only ever centered for a
  // container hundreds of pixels wider than the current one, left over from before
  // a side panel opened, because that comparison's "still at prior fit" check
  // skipped recentering under conditions that turned out to be reachable in
  // practice. An explicit boolean can't drift the same way.
  const manualZoomRef = useRef(false);
  useEffect(() => {
    if (containerSize.width > 0 && containerSize.height > 0) {
      // Largest zoom that fits the page in the available workspace, minus a small
      // fixed inset so the page doesn't touch the container edges — was previously
      // 100px + a flat 0.8 multiplier, which threw away up to 20% of the workspace
      // on top of the inset and left the page needlessly tiny on smaller/narrower
      // windows (e.g. both side panels open).
      const scale = Math.min(
        (containerSize.width - 64) / page.width,
        (containerSize.height - 64) / page.height,
        1
      ) * 0.94;
      fitZoomRef.current = scale;

      const explicitFitRequested = fitRequestId !== prevFitRequestIdRef.current;
      prevFitRequestIdRef.current = fitRequestId;
      if (explicitFitRequested) manualZoomRef.current = false;

      if (!manualZoomRef.current) {
        // Always resync to fit-and-centered on every relevant container change —
        // a side panel opening/closing, a window resize, the page strip collapsing,
        // first load, whatever. No skip conditions: the page can only ever be
        // exactly where "fit" puts it, so there is nothing left that can go stale.
        setZoom(scale);
        const newPanX = (containerSize.width - page.width * scale) / 2;
        const newPanY = (containerSize.height - page.height * scale) / 2;
        setPan(newPanX, newPanY);
        setViewportCenter(page.width / 2, page.height / 2);
      } else {
        // The user deliberately zoomed in past fit — respect that zoom instead of
        // yanking it back; just re-clamp pan so the resize can't leave the page
        // scrolled out of view.
        const clamped = clampPan(panX, panY);
        setPan(clamped.x, clamped.y);
      }
    }
  // fitRequestId is bumped by the store's zoomToFit() (called from the "Fit to
  // screen" menu item) purely to re-trigger this exact computation on demand,
  // using whatever containerSize/page dimensions are current at that moment.
  }, [containerSize, page.width, page.height, setZoom, setPan, setViewportCenter, fitRequestId]);

  // The Properties panel adapts to what you're doing instead of permanently eating
  // canvas width: closed by default, opens automatically the moment something is
  // selected (so it's there when you need it without a manual click), and closes
  // again once nothing is selected or you enter background-reposition mode (which
  // is edited by dragging directly on the canvas, not through the panel, so it just
  // wants the space back). The user can still manually toggle it open/closed at any
  // point — this only decides the DEFAULT, it doesn't lock the panel one way.
  useEffect(() => {
    setRightPanelOpen(!repositioningBg && selectedElementIds.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositioningBg, selectedElementIds.length]);

  // REMOVED: this used to auto-zoom-in and recenter the view on whatever got
  // selected, any time the current zoom was below 35% — which a normal-sized
  // portrait page (e.g. 1080x1350) in a typical browser window sits below very
  // easily, especially with a side panel or two open. The practical effect: select
  // any element and the whole page would silently jump/zoom to center on it,
  // reported repeatedly (in different words each time) as "the page moves when I
  // click something" and "there's suddenly empty white space where the page used to
  // be" — because recentering on a selection near one edge of the page pushes that
  // edge into the middle of the viewport, exposing empty workspace on the opposite
  // side. The page must never move on its own as a side effect of selecting
  // something, so this whole effect is gone rather than tuned further.

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    // Defensive: locked elements must never get resize/rotate handles, even if
    // something upstream (e.g. a future select-all-ish action) puts a locked id
    // into selectedElementIds — dragging is already blocked at the node level via
    // `draggable`, but the Transformer has no equivalent prop, so it's filtered here.
    const lockedIds = new Set(page.elements.filter((e) => e.locked).map((e) => e.id));
    const nodes = selectedElementIds
      .filter((id) => !lockedIds.has(id))
      .map((id) => stage.findOne('#' + id))
      .filter(Boolean);
    transformer.nodes(nodes as any);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementIds, page.elements]);

  // True "clamp to content bounds" panning, per axis, matching how Figma/Canva
  // actually behave: panX/panY is where the page's own (0,0) lands on screen, so the
  // page's screen-space box on this axis is [value, value+pageSpan]. If the page
  // fits within the viewport on this axis, it's always centered — there's nothing
  // to pan, so any pan attempt just snaps back to center (this is what makes the
  // page "not draggable" at or below fit zoom, since at fit BOTH axes fit). If the
  // page is bigger than the viewport on this axis, the pan is clamped so neither of
  // the page's edges can ever retreat past the viewport's matching edge — you can
  // reach every part of the page, but never end up with an empty grey gap on one
  // side while part of the page is already off the other (the previous version only
  // guaranteed a minimum sliver stayed visible, which could still look like "the
  // page basically disappeared" when zoomed in a lot).
  const clampAxis = (value: number, containerSpan: number, pageSpan: number) => {
    if (pageSpan <= containerSpan) return (containerSpan - pageSpan) / 2;
    return Math.min(0, Math.max(containerSpan - pageSpan, value));
  };
  // Takes an explicit zoom rather than always reading the current `zoom` state, so
  // a caller that's simultaneously changing the zoom (applyZoom) can clamp against
  // the NEW zoom's page span instead of the stale one from before the change.
  const clampPanForZoom = (x: number, y: number, forZoom: number) => ({
    x: clampAxis(x, containerSize.width, page.width * forZoom),
    y: clampAxis(y, containerSize.height, page.height * forZoom),
  });
  const clampPan = useCallback((x: number, y: number) => clampPanForZoom(x, y, zoom),
    [page.width, page.height, zoom, containerSize]);

  // The page is a fixed document, not a draggable object — panning only exists to
  // move the VIEWPORT over a page too large to fit, never the other way around. So
  // whenever the whole page already fits at the current zoom (<= fitZoom), the page
  // is always centered and pan is disabled outright; only once zoomed in past that
  // point is there anything to pan across. This is the single source of truth for
  // that rule — every zoom-changing action (wheel, buttons, shortcuts, auto-zoom-on-
  // select) funnels through here so none of them can leave the page off-center or
  // leave a stale pan lying around from before the last zoom-out.
  const applyZoom = (rawNewZoom: number, anchorX: number, anchorY: number) => {
    const newZoom = Math.max(0.1, Math.min(5, rawNewZoom));
    const fitZoom = fitZoomRef.current;
    if (fitZoom !== null && newZoom <= fitZoom + 0.001) {
      manualZoomRef.current = false;
      setZoom(newZoom);
      setPan((containerSize.width - page.width * newZoom) / 2, (containerSize.height - page.height * newZoom) / 2);
      return;
    }
    manualZoomRef.current = true;
    const stageX = (anchorX - panX) / zoom;
    const stageY = (anchorY - panY) / zoom;
    setZoom(newZoom);
    const raw = clampPanForZoom(anchorX - stageX * newZoom, anchorY - stageY * newZoom, newZoom);
    setPan(raw.x, raw.y);
  };

  // Page panning (wheel-scroll and Space+drag) is disabled outright rather than
  // conditionally allowed above "fit" zoom. That conditional version compared live
  // `zoom` against a cached `fitZoomRef.current`, but that ref gets updated without
  // `zoom` itself whenever a selection change resizes the container (opening the
  // Properties panel) — see the "selectionJustToggled" branch above, which exists to
  // avoid yanking the view out from under a just-selected element. The side effect:
  // right after selecting anything, the auto-refit computation can settle on a zoom
  // that doesn't actually fit the now-narrower (both side panels open) container,
  // which made the old "am I past fit?" check spuriously true and let the whole page
  // get dragged off-center — reported repeatedly as "the entire poster is
  // draggable." Rather than keep chasing that timing race across several interacting
  // effects, panning is simply off: there is no path left that can ever move the
  // page out from under the user, regardless of how zoom/container state settles.
  const isPannable = () => false;

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    // Ctrl/Cmd+scroll zooms (browsers also report trackpad pinch-zoom gestures as a
    // wheel event with ctrlKey set, so pinch-to-zoom works too). A plain scroll or
    // trackpad swipe pans instead — but only once zoomed in past fit; at or below
    // fit the whole page is already visible and centered, so scrolling is a no-op
    // rather than dragging the fixed page around.
    const isZoomGesture = e.evt.ctrlKey || e.evt.metaKey;
    if (!isZoomGesture) {
      if (!isPannable()) return;
      const next = clampPan(panX - e.evt.deltaX, panY - e.evt.deltaY);
      setPan(next.x, next.y);
      return;
    }

    const scaleBy = 1.1;
    const oldScale = zoom;
    // Anchor the zoom to the cursor (falls back to viewport center if the pointer
    // position is ever unavailable, e.g. a synthetic event with no real cursor) —
    // applyZoom itself overrides this back to centered whenever the result is at or
    // below fitZoom, since the page is locked centered at that point regardless.
    const pointer = stageRef.current?.getPointerPosition();
    const cx = pointer?.x ?? containerSize.width / 2;
    const cy = pointer?.y ?? containerSize.height / 2;
    applyZoom(e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy, cx, cy);
  }, [zoom, panX, panY, containerSize, page.width, page.height, setZoom, setPan, clampPan]);

  const zoomInAtCenter = () => applyZoom(zoom * 1.2, containerSize.width / 2, containerSize.height / 2);
  const zoomOutAtCenter = () => applyZoom(zoom / 1.2, containerSize.width / 2, containerSize.height / 2);

  // Ctrl+=/Ctrl+-/Ctrl+0 — moved here (off the global keydown handler in
  // EditorPage.tsx, which has no containerSize/pan context) so these anchor the
  // same way every other zoom gesture on this canvas does, instead of jumping the
  // page toward the Stage's origin.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomInAtCenter(); }
      else if (e.key === '-') { e.preventDefault(); zoomOutAtCenter(); }
      else if (e.key === '0') { e.preventDefault(); applyZoom(1, containerSize.width / 2, containerSize.height / 2); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoom, panX, panY, containerSize]);

  // Dragging an image file in from the OS (Explorer/Finder/desktop) straight onto
  // the canvas — the Uploads panel already had a small drop zone for this, but
  // nothing accepted a drop on the canvas itself, which is where a user naturally
  // tries it first (matches Canva's own behavior).
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleCanvasDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
  }, []);

  const handleCanvasDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) setIsDraggingFile(false);
  }, []);

  const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);

    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    // Where the drop landed, converted from screen pixels to page coordinates —
    // the Stage is scaled/panned (scaleX/Y=zoom, x/y=panX/panY), so this undoes
    // that transform the same way handleWheel's own zoom-anchor math does.
    const container = containerRef.current?.getBoundingClientRect();
    const dropX = container ? (e.clientX - container.left - panX) / zoom : page.width / 2;
    const dropY = container ? (e.clientY - container.top - panY) / zoom : page.height / 2;

    for (const file of files) {
      try {
        const { data: saved } = await uploadAPI.upload(file);
        const serverUrl = `${BACKEND}${saved.url}`;
        const img = new window.Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = serverUrl;
        });
        const w = Math.min(img.naturalWidth || 300, Math.round(page.width * 0.6));
        const h = img.naturalWidth ? Math.round((img.naturalHeight / img.naturalWidth) * w) : 225;
        addElement({
          type: 'image', x: dropX - w / 2, y: dropY - h / 2, width: w, height: h,
          rotation: 0, opacity: 1, visible: true, locked: false, name: file.name, zIndex: 0,
          data: { type: 'image', src: serverUrl, objectFit: 'cover', borderRadius: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, filters: [], cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 },
        });
        pushHistory();
        toast.success(`${file.name} added to canvas`);
      } catch (err: any) {
        toast.error(err.response?.data?.error || `Failed to upload ${file.name}`);
      }
    }
  }, [panX, panY, zoom, page.width, page.height, addElement, pushHistory]);

  // Eraser deliberately never touches images/text/shapes — it only deletes your own
  // pen/highlighter strokes that come within reach of the cursor, checked against each
  // stroke's own recorded points (converted back to page coordinates via its element's
  // x/y). A pixel-level canvas erase (destination-out) would have cut through whatever
  // artwork happened to be underneath, which isn't what an annotation eraser should do.
  // Hard clipping boundary for every drawing tool (pen/highlighter/eraser) — the page
  // is the only place a stroke can exist, never the grey workspace around it. Clamped
  // in page-space coordinates (what getRelativePointerPosition already returns, since
  // the Stage's own scale/offset is the pan/zoom transform), so this holds at any zoom
  // or pan level: a point outside the page snaps to the nearest edge instead of being
  // recorded as-is, which both stops strokes from ever leaving the page and clips a
  // stroke dragged across the boundary right at the edge rather than past it.
  const clampToPage = (x: number, y: number) => ({
    x: Math.max(0, Math.min(page.width, x)),
    y: Math.max(0, Math.min(page.height, y)),
  });

  const eraseNear = (px: number, py: number) => {
    const { pages: allPages, currentPageIndex: pageIdx, removeElements: remove } = useEditorStore.getState();
    const radius = Math.max(15, drawWidth * 2);
    const toRemove: string[] = [];
    for (const el of allPages[pageIdx].elements) {
      if (el.type !== 'drawing') continue;
      const data = el.data as any;
      if (data.tool !== 'pen' && data.tool !== 'highlighter') continue;
      const pts: number[] = data.points;
      for (let i = 0; i < pts.length; i += 2) {
        if (Math.hypot(el.x + pts[i] - px, el.y + pts[i + 1] - py) <= radius) {
          toRemove.push(el.id);
          break;
        }
      }
    }
    if (toRemove.length > 0) remove(toRemove);
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Middle-mouse-drag or Space+drag pans, taking priority over whatever tool is
    // active or whatever's under the cursor — same Figma/Canva convention as
    // scroll-to-pan, just a second gesture for it.
    const isMiddleButton = 'button' in e.evt && e.evt.button === 1;
    if (isMiddleButton || spaceHeld) {
      if (isMiddleButton) e.evt.preventDefault();
      // The whole page already fits and is centered — nothing to pan across.
      if (!isPannable()) return;
      const pos = stageRef.current?.getPointerPosition();
      if (!pos) return;
      isPanningRef.current = true;
      panStartRef.current = { mouseX: pos.x, mouseY: pos.y, panX, panY };
      return;
    }

    if (activeTool !== 'select') {
      const rawPos = stageRef.current?.getRelativePointerPosition();
      if (!rawPos) return;
      const pos = clampToPage(rawPos.x, rawPos.y);
      isDrawingRef.current = true;
      if (activeTool === 'eraser') eraseNear(pos.x, pos.y);
      else setCurrentStroke([pos.x, pos.y]);
      return;
    }

    const target = e.target;
    if (target === stageRef.current || target.name() === 'canvas-bg') {
      deselectAll();
      setEditingTextId(null);
      useEditorStore.setState({ isEditing: false });
      if (repositioningBg) setRepositioningBg(false);
    }
  };

  // Double-clicking the empty page (background image included — it's listening={false}
  // outside reposition mode, so a click there passes straight through to canvas-bg,
  // same target this checks for a single click) enters background reposition mode.
  const handleStageDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const target = e.target;
    if ((target === stageRef.current || target.name() === 'canvas-bg') && page.backgroundImage) {
      setRepositioningBg(true);
    }
  };

  useEffect(() => {
    if (!repositioningBg) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setRepositioningBg(false); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [repositioningBg]);

  const lastCursorEmitRef = useRef(0);

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pendingDrag = pendingElementDragRef.current;
    if (pendingDrag && !pendingDrag.engaged) {
      const pos = stageRef.current?.getPointerPosition();
      if (pos) {
        const dx = pos.x - pendingDrag.startX;
        const dy = pos.y - pendingDrag.startY;
        if (Math.sqrt(dx * dx + dy * dy) >= ELEMENT_DRAG_THRESHOLD) {
          pendingDrag.engaged = true;
          pendingDrag.node.startDrag();
        }
      }
    }
    if (isPanningRef.current && panStartRef.current) {
      const pos = stageRef.current?.getPointerPosition();
      if (pos) {
        const start = panStartRef.current;
        const next = clampPan(start.panX + (pos.x - start.mouseX), start.panY + (pos.y - start.mouseY));
        setPan(next.x, next.y);
      }
      return;
    }
    if (onCursorMove) {
      // Throttled — this fires on every pixel of mouse movement, and broadcasting
      // each one individually would flood the socket for no visible benefit.
      const now = Date.now();
      if (now - lastCursorEmitRef.current > 50) {
        lastCursorEmitRef.current = now;
        const pos = stageRef.current?.getRelativePointerPosition();
        if (pos) onCursorMove(pos.x, pos.y);
      }
    }
    if (isDrawingRef.current) {
      const rawPos = stageRef.current?.getRelativePointerPosition();
      if (!rawPos) return;
      const pos = clampToPage(rawPos.x, rawPos.y);
      if (activeTool === 'eraser') eraseNear(pos.x, pos.y);
      else setCurrentStroke((prev) => [...prev, pos.x, pos.y]);
    }
  };

  const handleStageMouseUp = () => {
    pendingElementDragRef.current = null;
    if (isPanningRef.current) {
      isPanningRef.current = false;
      panStartRef.current = null;
      return;
    }
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (activeTool !== 'eraser' && currentStroke.length >= 4) {
        addDrawing(currentStroke, activeTool as 'pen' | 'highlighter', drawColor, drawWidth);
      }
      setCurrentStroke([]);
    }
  };

  // The Stage's own onMouseUp only fires while the release happens over the Stage's
  // own DOM container — a fast drag that leaves the whole canvas area (e.g. onto a
  // sidebar) before the button comes up releases outside that container, so Konva
  // never sees a mouseup there and the in-progress stroke/pan would otherwise be
  // stuck forever (visibly drawn but never committed, silently lost on the next tool
  // switch). This window-level fallback guarantees a release is always caught,
  // wherever the pointer ends up; handleStageMouseUp is idempotent (it no-ops once
  // isDrawingRef/isPanningRef are already false), so this is safe to also fire
  // redundantly for a normal release that the Stage already handled itself.
  const handleStageMouseUpRef = useRef(handleStageMouseUp);
  handleStageMouseUpRef.current = handleStageMouseUp;
  useEffect(() => {
    const onWindowRelease = () => handleStageMouseUpRef.current();
    window.addEventListener('mouseup', onWindowRelease);
    window.addEventListener('touchend', onWindowRelease);
    return () => {
      window.removeEventListener('mouseup', onWindowRelease);
      window.removeEventListener('touchend', onWindowRelease);
    };
  }, []);

  const handleElementClick = (e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true;
    const element = page.elements.find((el) => el.id === id);
    if (element?.locked) return;
    // Canva behavior: a plain click on text that is ALREADY the (sole) selection
    // starts editing it, so "click to select, click again to type" works without
    // needing a precise double-click. A drag never reaches here (Konva suppresses
    // click after a drag), and handleElementDblClick guards against opening a
    // second editor when this click turns out to be the first half of a dblclick.
    if (element?.type === 'text' && !e.evt.shiftKey && selectedElementIds.length === 1 && selectedElementIds[0] === id) {
      handleElementDblClick(e, element);
      return;
    }
    // Auto-grouped image+frame pairs select as one unit — clicking either member
    // selects both, matching the "move/resize together" behavior. Shift-click still
    // does plain additive multi-select instead, so it isn't trapped inside the group.
    if (element?.groupId && !e.evt.shiftKey) {
      const groupIds = page.elements.filter((el) => el.groupId === element.groupId).map((el) => el.id);
      setSelectedElementIds(groupIds);
      return;
    }
    selectElement(id, e.evt.shiftKey);
  };

  // Keep an open text-edit textarea glued to its Konva text node while panning or
  // zooming — without this, the canvas content moves under a textarea that was
  // only ever positioned once, at the moment editing started.
  useEffect(() => {
    const active = activeTextEditRef.current;
    if (!active) return;
    const textNode = stageRef.current?.findOne('#' + active.elementId);
    const stageBox = stageRef.current?.container().getBoundingClientRect();
    const element = page.elements.find((el) => el.id === active.elementId);
    if (!textNode || !stageBox || !element) return;
    const textPosition = textNode.getAbsolutePosition();
    const data = element.data as TextData;
    active.textarea.style.top = `${stageBox.top + textPosition.y}px`;
    active.textarea.style.left = `${stageBox.left + textPosition.x}px`;
    active.textarea.style.width = `${element.width * zoom}px`;
    active.textarea.style.height = `${element.height * zoom}px`;
    active.textarea.style.fontSize = `${data.fontSize * zoom}px`;
  }, [panX, panY, zoom, page.elements]);

  const handleElementDblClick = (e: Konva.KonvaEventObject<MouseEvent>, elementIn: CanvasElement) => {
    // Undo an accidental drag from the first click of this double-click gesture
    // (see lastDragRef above) before doing anything else — snap the element, and
    // its on-canvas node, back to where it was before this double-click started.
    // `element` is shadowed with the corrected position so every branch below
    // (text, table, image) sees the reverted x/y rather than the stale param.
    let element = elementIn;
    if (lastDragRef.current?.id === element.id && Date.now() - lastDragRef.current.time < 500) {
      const { prevX, prevY } = lastDragRef.current;
      updateElement(element.id, { x: prevX, y: prevY });
      element = { ...element, x: prevX, y: prevY };
      const node = stageRef.current?.findOne('#' + element.id);
      if (node) { node.x(prevX); node.y(prevY); }
      lastDragRef.current = null;
    }
    if (element.type === 'text') {
      // Already editing this exact element (the click-on-selected-text path in
      // handleElementClick fired on the first click of a double-click) — the open
      // textarea is the editor; don't stack a second one on top of it.
      if (activeTextEditRef.current?.elementId === element.id) return;
      setEditingTextId(element.id);
      useEditorStore.setState({ isEditing: true });

      const textNode = stageRef.current?.findOne('#' + element.id);
      if (textNode) {
        const textPosition = textNode.getAbsolutePosition();
        const stageBox = stageRef.current?.container().getBoundingClientRect();
        if (!stageBox) return;

        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        const data = element.data as TextData;
        textarea.value = data.content;
        textarea.style.position = 'absolute';
        textarea.style.top = `${stageBox.top + textPosition.y}px`;
        textarea.style.left = `${stageBox.left + textPosition.x}px`;
        textarea.style.width = `${element.width * zoom}px`;
        textarea.style.height = `${element.height * zoom}px`;
        textarea.style.fontSize = `${data.fontSize * zoom}px`;
        textarea.style.fontFamily = data.fontFamily;
        textarea.style.fontWeight = String(data.fontWeight);
        textarea.style.fontStyle = data.fontStyle;
        textarea.style.textAlign = data.textAlign;
        textarea.style.color = data.color;
        textarea.style.lineHeight = String(data.lineHeight);
        textarea.style.letterSpacing = `${data.letterSpacing}px`;
        textarea.style.textDecoration = data.textDecoration;
        // A hardcoded near-white editing background made light/white text (e.g.
        // white text on a colored bar, like "CERTIFICATE OF COMPLETION") nearly
        // invisible while typing — same color family, no contrast. Fixed once with
        // a solid dark/light fill chosen by the text's own luminance — but for a
        // text element that has no background OF ITS OWN (most manually-placed
        // text sitting directly on a photo/graphic), that solid fill is its own new
        // problem: it paints an opaque box across the FULL element width/height —
        // almost always much bigger than the actual text inside it — right over
        // whatever vibrant image is underneath, which is what showed up as a
        // Always use transparent background with text outline for contrast.
        // Never apply element backgrounds to the textarea — they create large
        // opaque boxes covering surrounding content during editing. The text
        // outline (stroke + shadow) provides enough contrast without any box.
        textarea.style.background = 'transparent';
        const hex = data.color.replace('#', '');
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
        const r = parseInt(full.slice(0, 2), 16) || 0, g = parseInt(full.slice(2, 4), 16) || 0, b = parseInt(full.slice(4, 6), 16) || 0;
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const outline = luminance > 0.6 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
        (textarea.style as any).webkitTextStroke = `1px ${outline}`;
        textarea.style.textShadow = `0 0 3px ${outline}, 0 0 3px ${outline}, 0 0 3px ${outline}`;
        textarea.style.border = '2px dashed #7B2FBE';
        textarea.style.borderRadius = '4px';
        textarea.style.padding = '4px';
        textarea.style.outline = 'none';
        textarea.style.resize = 'none';
        textarea.style.zIndex = '10000';
        textarea.style.transformOrigin = 'left top';
        // Not 'hidden' — a box sized to the OCR-detected original line (e.g. an
        // extracted headline) is often just tall enough for ONE line, so typing more
        // than that used to be invisible while editing (clipped) and then rendered
        // past the box's own background once committed. Growing the textarea live
        // means what you see while typing already matches what you'll get.
        textarea.style.overflow = 'visible';
        textarea.style.wordWrap = 'break-word';

        textarea.focus();
        activeTextEditRef.current = { textarea, elementId: element.id };

        const fontStyleStr = [String(data.fontWeight), data.fontStyle === 'italic' ? 'italic' : ''].filter(Boolean).join(' ');
        // Same wrapping engine the real element renders with (Konva.Text, not the
        // textarea's own CSS layout) — an unattached node with height left unset
        // auto-sizes to however many lines the current text needs at this width/
        // fontSize, so this matches the persisted element exactly rather than
        // approximating it.
        const measureHeightAt = (content: string, fontSize: number) => {
          const measurer = new Konva.Text({
            text: content, fontFamily: data.fontFamily, fontSize, fontStyle: fontStyleStr,
            width: element.width, lineHeight: data.lineHeight, letterSpacing: data.letterSpacing, wrap: 'word',
          });
          const h = measurer.height();
          measurer.destroy();
          return h;
        };

        // Text extracted FROM an image (recognizable by having a `background` fill
        // — see designReconstruction/editorStore) sits tightly next to other content
        // that's still just flat image pixels, not yet its own element (e.g. the
        // very next line down). Growing its box to fit more text would paint its
        // opaque background straight over that neighboring content. A plain
        // user-created text box has no such neighbor sharing its space, so it's
        // free to grow normally instead.
        const isExtractedFromImage = !!data.background;

        const fitFontSize = (content: string): number => {
          const original = data.fontSize;
          if (measureHeightAt(content, original) <= element.height) return original;
          const minSize = Math.max(6, Math.round(original * 0.5));
          let lo = minSize, hi = original, best = minSize;
          while (lo <= hi) {
            const mid = Math.round((lo + hi) / 2);
            if (measureHeightAt(content, mid) <= element.height) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
          }
          return best;
        };

        const liveUpdate = () => {
          if (isExtractedFromImage) {
            const fitted = fitFontSize(textarea.value);
            textarea.style.fontSize = `${fitted * zoom}px`;
          } else {
            const neededPagePx = Math.max(element.height, measureHeightAt(textarea.value, data.fontSize));
            textarea.style.height = `${neededPagePx * zoom}px`;
          }
        };
        liveUpdate();
        textarea.addEventListener('input', liveUpdate);

        const finishEdit = () => {
          const content = textarea.value;
          const update = isExtractedFromImage
            ? { data: { ...data, content, fontSize: fitFontSize(content) } as TextData }
            : { height: Math.max(element.height, measureHeightAt(content, data.fontSize)), data: { ...data, content } as TextData };
          updateElement(element.id, update);
          textarea.removeEventListener('input', liveUpdate);
          textarea.remove();
          activeTextEditRef.current = null;
          setEditingTextId(null);
          useEditorStore.setState({ isEditing: false });
          pushHistory();
        };

        textarea.addEventListener('blur', finishEdit);
        // Enter now behaves like a normal multi-line text box — it inserts a line
        // break (the textarea's own default behavior, so no handler needed for
        // that) rather than closing the edit. Only Escape or clicking away
        // (blur) ends editing now.
        textarea.addEventListener('keydown', (ke) => {
          if (ke.key === 'Escape') finishEdit();
        });
      }
    }

    // Table cell editing
    if (element.type === 'table') {
      const data = element.data as TableData;
      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const stageScale = stage.scaleX();
      const cellW = element.width / data.cols;
      const cellH = element.height / data.rows;
      const localX = (pointer.x - stage.x()) / stageScale - element.x;
      const localY = (pointer.y - stage.y()) / stageScale - element.y;
      const col = Math.floor(localX / cellW);
      const row = Math.floor(localY / cellH);

      if (row < 0 || row >= data.rows || col < 0 || col >= data.cols) return;

      const cellText = data.cells?.[row]?.[col] || '';
      const input = document.createElement('input');
      document.body.appendChild(input);

      const cellAbsX = element.x + col * cellW;
      const cellAbsY = element.y + row * cellH;

      input.value = cellText;
      input.style.position = 'absolute';
      input.style.top = `${stage.container().getBoundingClientRect().top + (cellAbsY * stageScale) + stage.y()}px`;
      input.style.left = `${stage.container().getBoundingClientRect().left + (cellAbsX * stageScale) + stage.x()}px`;
      input.style.width = `${cellW * stageScale}px`;
      input.style.height = `${cellH * stageScale}px`;
      input.style.fontSize = `${13 * stageScale}px`;
      input.style.fontFamily = 'Inter';
      input.style.textAlign = 'center';
      input.style.border = '2px solid #7B2FBE';
      input.style.borderRadius = '2px';
      input.style.padding = '0';
      input.style.outline = 'none';
      input.style.background = 'white';
      input.style.zIndex = '10000';
      input.style.color = data.headerRow && row === 0 ? data.headerTextColor : data.cellTextColor;

      input.focus();
      input.select();

      const finishEdit = () => {
        const newCells = data.cells.map((r) => [...r]);
        while (newCells.length <= row) newCells.push(Array(data.cols).fill(''));
        while (newCells[row].length <= col) newCells[row].push('');
        newCells[row][col] = input.value;
        updateElement(element.id, {
          data: { ...data, cells: newCells } as TableData,
        });
        input.remove();
        pushHistory();
      };

      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (ke) => {
        if (ke.key === 'Enter') { ke.preventDefault(); finishEdit(); }
        if (ke.key === 'Escape') finishEdit();
      });
    }

    // Double-click a spot on an uploaded image (e.g. a headline or a logo) to pull
    // JUST that one thing out as its own editable element — the rest of the image
    // stays exactly as it was. Re-enabled as an explicit, opt-in-by-clicking action
    // (same status as the Properties panel's "Edit as Design" button) after real
    // reliability problems in testing — garbled text, mismatched mask colors,
    // misplaced elements, one report of lost content. Every fix from that testing
    // (OCR filtering, logo-priority-in-corners, box tightening, duplicate
    // detection, crop-window correctness) is still active here, but this is still
    // best-effort: expect some spots to come back wrong or find nothing at all.
    if (element.type === 'image') {
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const stageScale = stage.scaleX();
      const localX = (pointer.x - stage.x()) / stageScale - element.x;
      const localY = (pointer.y - stage.y()) / stageScale - element.y;
      if (localX < 0 || localX > element.width || localY < 0 || localY > element.height) return;

      const data = element.data as ImageData;
      if (!data.src) return;
      // Percent-of-natural-image click point — accounts for any existing crop so a
      // pre-cropped image still maps the click onto the right source pixels.
      const cropXPct = (data as any).cropX ?? 0;
      const cropYPct = (data as any).cropY ?? 0;
      const cropWPct = (data as any).cropWidth ?? 100;
      const cropHPct = (data as any).cropHeight ?? 100;
      const pointXPct = cropXPct + (localX / element.width) * cropWPct;
      const pointYPct = cropYPct + (localY / element.height) * cropHPct;

      const elementId = element.id;
      const imageSrc = data.src;
      const toastId = `extract-${elementId}`;
      toast.loading('Analyzing…', { id: toastId });
      (async () => {
        try {
          const { runRegionExtraction } = await import('../../utils/runDesignReconstruction');
          const outcome = await runRegionExtraction(elementId, imageSrc, pointXPct, pointYPct, (label) => {
            toast.loading(label, { id: toastId });
          });
          toast.dismiss(toastId);
          // Silently do nothing when there's nothing extractable at the clicked
          // point — clicking empty space (sky, plain photo background) is a normal,
          // expected outcome, not something worth interrupting with a popup every
          // time.
          if (!outcome.found && outcome.debug) console.log('[extractElementAtPoint] nothing found:', outcome.debug);
        } catch (err: any) {
          toast.dismiss(toastId);
          console.error('[extractElementAtPoint] failed', err);
          toast.error(err?.message || 'Could not analyze that spot');
        }
      })();
    }
  };

  // Snapshot of every alignment line a dragged element could snap to — every other
  // visible element's left/center/right (x) and top/center/bottom (y) edges, plus
  // the page's own edges/center. Built once at drag start rather than recomputed on
  // every mousemove, since the set of "other elements" can't change mid-drag.
  const buildDragGuideContext = (draggedId: string) => {
    const vLines = new Set<number>([0, page.width / 2, page.width]);
    const hLines = new Set<number>([0, page.height / 2, page.height]);
    for (const el of page.elements) {
      if (el.id === draggedId || !el.visible) continue;
      vLines.add(el.x);
      vLines.add(el.x + el.width / 2);
      vLines.add(el.x + el.width);
      hLines.add(el.y);
      hLines.add(el.y + el.height / 2);
      hLines.add(el.y + el.height);
    }
    return { vLines: Array.from(vLines), hLines: Array.from(hLines) };
  };

  // For each candidate edge (left/center/right, or top/center/bottom) of the
  // dragged element, finds the closest guide line within threshold — returns how
  // far to shift the element's position so that edge lands exactly on the line.
  const findAxisSnap = (edges: number[], lines: number[], threshold: number): { delta: number; line: number } | null => {
    let best: { delta: number; line: number } | null = null;
    for (const edge of edges) {
      for (const line of lines) {
        const delta = line - edge;
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) {
          best = { delta, line };
        }
      }
    }
    return best;
  };

  // Auto-group an image with a rectangle "frame" shape once one is dragged/dropped
  // (nearly) fully inside the other — matches Canva's picture-frame behavior. Both
  // directions are checked: an image dropped into a frame, or a frame dragged around
  // an existing image. Only fires for a lone (ungrouped) drag — see handleElementDragEnd.
  const FRAME_CONTAINMENT_RATIO = 0.85;
  const containmentRatio = (
    inner: { x: number; y: number; width: number; height: number },
    outer: { x: number; y: number; width: number; height: number }
  ) => {
    const ix1 = Math.max(inner.x, outer.x);
    const iy1 = Math.max(inner.y, outer.y);
    const ix2 = Math.min(inner.x + inner.width, outer.x + outer.width);
    const iy2 = Math.min(inner.y + inner.height, outer.y + outer.height);
    const overlapArea = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
    const innerArea = inner.width * inner.height;
    return innerArea > 0 ? overlapArea / innerArea : 0;
  };
  const maybeAutoGroup = (movedId: string) => {
    // Read fresh from the store rather than the `page` closure — moveElement() was
    // just called synchronously above, but this component hasn't re-rendered yet,
    // so `page.elements` here would still hold the pre-drag position.
    const freshState = useEditorStore.getState();
    const freshPage = freshState.pages[freshState.currentPageIndex];
    const moved = freshPage.elements.find((el) => el.id === movedId);
    if (!moved) return;
    if (moved.type === 'image') {
      const frame = freshPage.elements.find((el) =>
        el.id !== moved.id && el.type === 'shape' && (el.data as ShapeData).shapeType === 'rectangle' &&
        !(moved.groupId && moved.groupId === el.groupId) &&
        containmentRatio(moved, el) >= FRAME_CONTAINMENT_RATIO
      );
      if (frame) {
        autoGroupWithFrame(moved.id, frame.id);
        toast.success('Grouped with frame');
      }
    } else if (moved.type === 'shape' && (moved.data as ShapeData).shapeType === 'rectangle') {
      const image = freshPage.elements.find((el) =>
        el.id !== moved.id && el.type === 'image' &&
        !(moved.groupId && moved.groupId === el.groupId) &&
        containmentRatio(el, moved) >= FRAME_CONTAINMENT_RATIO
      );
      if (image) {
        autoGroupWithFrame(image.id, moved.id);
        toast.success('Grouped with frame');
      }
    }
  };

  const handleElementDragStart = (e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    dragGuideContextRef.current = buildDragGuideContext(id);
    const element = page.elements.find((el) => el.id === id);
    if (element) dragStartPosRef.current = { id, x: element.x, y: element.y };
    if (element?.groupId) {
      const siblings = page.elements
        .filter((el) => el.groupId === element.groupId && el.id !== id)
        .map((el) => ({ id: el.id, x: el.x, y: el.y }));
      groupDragRef.current = siblings.length > 0
        ? { draggedId: id, startX: e.target.x(), startY: e.target.y(), siblings }
        : null;
    } else {
      groupDragRef.current = null;
    }
  };

  const handleElementDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    let newX = node.x();
    let newY = node.y();
    const guides = { v: [] as number[], h: [] as number[] };

    if (snapEnabled) {
      const threshold = 5 / zoom;
      const ctx = dragGuideContextRef.current;
      if (ctx && storeShowGuides) {
        const w = node.width();
        const h = node.height();
        const snapX = findAxisSnap([newX, newX + w / 2, newX + w], ctx.vLines, threshold);
        const snapY = findAxisSnap([newY, newY + h / 2, newY + h], ctx.hLines, threshold);
        if (snapX) { newX += snapX.delta; guides.v.push(snapX.line); }
        if (snapY) { newY += snapY.delta; guides.h.push(snapY.line); }
      } else {
        // Guides disabled but snapping still on: fall back to page edges/center only.
        const snapPoints = [0, page.width / 2, page.width, page.height / 2, page.height];
        for (const p of snapPoints) if (Math.abs(newY - p) < threshold) newY = p;
        for (const p of snapPoints) if (Math.abs(newX - p) < threshold) newX = p;
      }
      node.x(newX);
      node.y(newY);
    }
    setActiveGuideLines(guides);

    // Auto-pan the viewport when dragging an element near the edge of the visible
    // canvas — otherwise a zoomed-in page traps you at whatever's currently on
    // screen, unable to drag an element to a part of the page that's scrolled out
    // of view. No-ops naturally at/below fit zoom: clampPan already keeps the page
    // centered and non-pannable there, so there's nothing for this to do.
    const EDGE_PAN_ZONE = 40;
    const EDGE_PAN_STEP = 18;
    const nodeW = node.width();
    const nodeH = node.height();
    const left = newX * zoom + panX;
    const top = newY * zoom + panY;
    const right = (newX + nodeW) * zoom + panX;
    const bottom = (newY + nodeH) * zoom + panY;
    let panDX = 0, panDY = 0;
    if (left < EDGE_PAN_ZONE) panDX = EDGE_PAN_STEP;
    else if (right > containerSize.width - EDGE_PAN_ZONE) panDX = -EDGE_PAN_STEP;
    if (top < EDGE_PAN_ZONE) panDY = EDGE_PAN_STEP;
    else if (bottom > containerSize.height - EDGE_PAN_ZONE) panDY = -EDGE_PAN_STEP;
    if (panDX || panDY) {
      const next = clampPan(panX + panDX, panY + panDY);
      setPan(next.x, next.y);
    }

    const gd = groupDragRef.current;
    if (gd && gd.draggedId === node.id()) {
      const dx = newX - gd.startX;
      const dy = newY - gd.startY;
      const stage = stageRef.current;
      for (const sib of gd.siblings) {
        const sibNode = stage?.findOne('#' + sib.id);
        if (sibNode) {
          sibNode.x(sib.x + dx);
          sibNode.y(sib.y + dy);
        }
      }
      stage?.batchDraw();
    }
  };

  const handleElementDragEnd = (e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    const node = e.target;
    moveElement(id, node.x(), node.y());
    if (dragStartPosRef.current?.id === id) {
      lastDragRef.current = { id, prevX: dragStartPosRef.current.x, prevY: dragStartPosRef.current.y, time: Date.now() };
    }
    dragStartPosRef.current = null;

    const gd = groupDragRef.current;
    if (gd && gd.draggedId === id) {
      const dx = node.x() - gd.startX;
      const dy = node.y() - gd.startY;
      for (const sib of gd.siblings) {
        moveElement(sib.id, sib.x + dx, sib.y + dy);
      }
      groupDragRef.current = null;
    } else {
      // Only a lone (ungrouped) drag can form a new group — a grouped pair moving
      // together shouldn't re-trigger grouping against itself.
      maybeAutoGroup(id);
    }

    pushHistory();
    dragGuideContextRef.current = null;
    setActiveGuideLines({ v: [], h: [] });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>, id: string) => {
    const node = e.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    updateElement(id, {
      x: node.x(),
      y: node.y(),
      width: Math.max(20, node.width() * scaleX),
      height: Math.max(20, node.height() * scaleY),
      rotation: node.rotation(),
    });
    pushHistory();
  };

  const renderElement = (element: CanvasElement) => {
    const isTextEdit = editingTextId === element.id;
    const commonProps = {
      id: element.id,
      x: element.x,
      y: element.y,
      rotation: element.rotation,
      opacity: element.opacity,
      // Never Konva-auto-draggable — see pendingElementDragRef/ELEMENT_DRAG_THRESHOLD
      // above. Drag is engaged manually, once real movement is confirmed, via
      // node.startDrag() in handleStageMouseMove.
      draggable: false,
      ...(element.shadow ? {
        shadowColor: element.shadow.color,
        shadowBlur: element.shadow.blur,
        shadowOffsetX: element.shadow.offsetX,
        shadowOffsetY: element.shadow.offsetY,
        shadowOpacity: element.shadow.opacity,
      } : {}),
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleElementClick(e, element.id),
      onDblClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleElementDblClick(e, element),
      onMouseDown: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => handleElementMouseDown(e, element.id),
      onTouchStart: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => handleElementMouseDown(e, element.id),
      onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => handleElementDragStart(e, element.id),
      onDragMove: handleElementDragMove,
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleElementDragEnd(e, element.id),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => handleTransformEnd(e, element.id),
      onMouseEnter: () => setHoveredElement(element.id),
      onMouseLeave: () => setHoveredElement(null),
      onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>) => {
        e.evt.preventDefault();
        if (!selectedElementIds.includes(element.id)) selectElement(element.id);
        setContextMenu({ elementId: element.id, x: e.evt.clientX, y: e.evt.clientY });
      },
    };

    switch (element.type) {
      case 'drawing': {
        const data = element.data as any;
        return (
          <Line
            key={element.id}
            {...commonProps}
            points={data.points}
            stroke={data.stroke}
            strokeWidth={data.strokeWidth}
            opacity={element.opacity * (data.tool === 'highlighter' ? 0.4 : 1)}
            lineCap="round"
            lineJoin="round"
            tension={0.3}
            globalCompositeOperation={data.tool === 'eraser' ? 'destination-out' : 'source-over'}
            hitStrokeWidth={Math.max(data.strokeWidth, 12)}
          />
        );
      }
      case 'text': {
        const data = element.data as TextData;
        return (
          <AnimatedTextElement
            key={element.id}
            element={element}
            commonProps={commonProps}
            data={data}
            isTextEdit={isTextEdit}
          />
        );
      }
      case 'image': {
        const data = element.data as ImageData;
        return (
          <ImageElement
            key={element.id}
            element={element}
            commonProps={commonProps}
            data={data}
          />
        );
      }
      case 'video': {
        const data = element.data as VideoData;
        return (
          <VideoElement
            key={element.id}
            element={element}
            commonProps={commonProps}
            data={data}
            clock={clock}
            trackMuted={!!element.trackId && mutedTrackIds.has(element.trackId)}
          />
        );
      }
      case 'audio': {
        const data = element.data as AudioData;
        return (
          <AudioElement
            key={element.id}
            element={element}
            data={data}
            clock={clock}
            trackMuted={!!element.trackId && mutedTrackIds.has(element.trackId)}
          />
        );
      }
      case 'shape': {
        const data = element.data as ShapeData;
        return (
          <ShapeElement
            key={element.id}
            element={element}
            commonProps={commonProps}
            data={data}
          />
        );
      }
      case 'table': {
        const data = element.data as TableData;
        return (
          <TableElement
            key={element.id}
            element={element}
            commonProps={commonProps}
            data={data}
          />
        );
      }
      case 'chart': {
        const data = element.data as ChartData;
        return (
          <ChartElement
            key={element.id}
            element={element}
            commonProps={commonProps}
            data={data}
          />
        );
      }
      case 'icon': {
        return (
          <IconElement
            key={element.id}
            element={element}
            commonProps={commonProps}
            data={element.data as any}
          />
        );
      }
      default:
        return (
          <Rect
            key={element.id}
            {...commonProps}
            width={element.width}
            height={element.height}
            fill="#E5E5E5"
            cornerRadius={4}
          />
        );
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative"
      onDragOver={handleCanvasDragOver}
      onDragEnter={handleCanvasDragEnter}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
    >
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center bg-canva-purple/10 border-4 border-dashed border-canva-purple">
          <div className="bg-white dark:bg-gray-800 rounded-xl px-5 py-3 shadow-lg text-sm font-semibold text-canva-purple">
            Drop image to add it to the canvas
          </div>
        </div>
      )}
      {showRulers && containerSize.width > 0 && (
        <Ruler zoom={zoom} panX={panX} panY={panY} width={containerSize.width} height={containerSize.height} />
      )}
      {repositioningBg && (
        <div
          className="absolute z-40 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 pl-3 pr-1 py-1"
          style={{ left: panX + (page.width / 2) * zoom, top: panY - 44, transform: 'translateX(-50%)' }}
        >
          <span className="text-xs text-gray-600 dark:text-gray-300">Drag to reposition · Scroll to zoom</span>
          <button
            onClick={() => setRepositioningBg(false)}
            className="btn-primary text-xs py-1 px-3 rounded-full"
          >
            Done
          </button>
        </div>
      )}
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={zoom}
        scaleY={zoom}
        x={panX}
        y={panY}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onDblClick={handleStageDblClick}
        style={{ cursor: spaceHeld && isPannable() ? 'grab' : activeTool !== 'select' ? 'crosshair' : 'default' }}
      >
        {/* Content layer — clipped to the page bounds, so any element (video, image,
            shape...) that's larger than or dragged/zoomed past the page's own edges
            is masked exactly like a real page/frame: the overflow simply isn't
            visible (or exported), rather than spilling onto the grey workspace.
            Matches how PageBackgroundImageLayer already crops itself internally,
            just generalized to every element instead of only the background. The
            Transformer/guides/draw-preview layer below is deliberately separate and
            NOT clipped, so resize/rotate handles stay grabbable even when the
            selection's bounding box extends past the page (e.g. a zoomed-in video
            being cropped to a 9:16 page). */}
        <Layer clipX={0} clipY={0} clipWidth={page.width} clipHeight={page.height}>
          <Rect
            name="canvas-bg"
            x={0}
            y={0}
            width={page.width}
            height={page.height}
            fill={bgGradient ? undefined : page.backgroundColor}
            fillLinearGradientStartPoint={bgGradient?.start}
            fillLinearGradientEndPoint={bgGradient?.end}
            fillLinearGradientColorStops={bgGradient?.colorStops}
            shadowColor="rgba(0,0,0,0.15)"
            shadowBlur={20}
            shadowOffsetX={0}
            shadowOffsetY={4}
            cornerRadius={2}
          />

          {page.backgroundImage && (
            <PageBackgroundImageLayer
              backgroundImage={page.backgroundImage}
              pageWidth={page.width}
              pageHeight={page.height}
              repositioning={repositioningBg}
              dragPreviewOffset={dragPreviewOffset}
              onDragMove={(x, y) => setDragPreviewOffset({ x, y })}
              onDragEnd={(x, y) => {
                setDragPreviewOffset(null);
                updatePage(currentPageIndex, { backgroundImage: { ...page.backgroundImage!, offsetX: x, offsetY: y } });
                pushHistory();
              }}
              onWheelZoom={(deltaY) => {
                const current = page.backgroundImage!.scale ?? 1;
                const next = Math.min(4, Math.max(1, current + (deltaY > 0 ? -0.1 : 0.1)));
                updatePage(currentPageIndex, { backgroundImage: { ...page.backgroundImage!, scale: next } });
                pushHistory();
              }}
            />
          )}

          {showGrid && (
            <Group>
              {Array.from({ length: Math.ceil(page.width / gridSize) + 1 }).map((_, i) => (
                <Line
                  key={`v${i}`}
                  points={[i * gridSize, 0, i * gridSize, page.height]}
                  stroke="#E5E5E5"
                  strokeWidth={0.5}
                  opacity={0.5}
                />
              ))}
              {Array.from({ length: Math.ceil(page.height / gridSize) + 1 }).map((_, i) => (
                <Line
                  key={`h${i}`}
                  points={[0, i * gridSize, page.width, i * gridSize]}
                  stroke="#E5E5E5"
                  strokeWidth={0.5}
                  opacity={0.5}
                />
              ))}
            </Group>
          )}

          {showGuides && (
            <Group>
              <Line
                points={[page.width / 2, 0, page.width / 2, page.height]}
                stroke="#7B2FBE"
                strokeWidth={0.5}
                dash={[8, 4]}
                opacity={0.3}
              />
              <Line
                points={[0, page.height / 2, page.width, page.height / 2]}
                stroke="#7B2FBE"
                strokeWidth={0.5}
                dash={[8, 4]}
                opacity={0.3}
              />
            </Group>
          )}

          {sortedElements.map(renderElement)}
          {sortedElements.some((el) => resolveElementAnimation(el).type !== 'none') && (
            <ElementAnimationDriver elements={sortedElements} stageRef={stageRef} />
          )}
        </Layer>

        {/* UI layer — deliberately unclipped (see the content Layer's comment above):
            alignment guides routinely extend miles past the page on purpose, the
            draw-tool preview and Transformer handles both need to stay visible/
            grabbable even when they're anchored to something that overflows the
            page edge. */}
        <Layer>
          {/* Smart alignment guides — pink lines shown only while actively dragging,
              marking where the dragged element's edge/center now lines up with
              another element's or the page's own edge/center. */}
          {activeGuideLines.v.map((x) => (
            <Line key={`gv${x}`} points={[x, -4000, x, page.height + 4000]} stroke="#FF4DA6" strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} listening={false} />
          ))}
          {activeGuideLines.h.map((y) => (
            <Line key={`gh${y}`} points={[-4000, y, page.width + 4000, y]} stroke="#FF4DA6" strokeWidth={1 / zoom} dash={[4 / zoom, 4 / zoom]} listening={false} />
          ))}

          {/* Only pen/highlighter ever populate currentStroke — eraser works by
              immediately deleting matched strokes in eraseNear(), it has no stroke
              of its own to preview. */}
          {currentStroke.length >= 4 && (
            <Line
              points={currentStroke}
              stroke={drawColor}
              strokeWidth={drawWidth}
              opacity={activeTool === 'highlighter' ? 0.4 : 1}
              lineCap="round"
              lineJoin="round"
              tension={0.3}
              listening={false}
            />
          )}

          {/* Selection handles read `selectedElementIds` straight off the shared global
              store, same as the live editor canvas — without this guard, a chrome-free
              instance (Preview, video export capture) would bake whatever's selected in
              the still-mounted live editor into its own render, since both instances
              share that same store. */}
          {!hideChrome && (
            <Transformer
              ref={transformerRef}
              borderStroke="#7B2FBE"
              // Konva's Transformer already renders these anchors at a constant screen
              // size regardless of Stage zoom (it does NOT shrink/grow them with the
              // content the way a plain shape would) — dividing by zoom here previously
              // double-compensated for scaling Konva already handles internally, which
              // at low zoom (e.g. 14%) blew anchorSize up to ~100 and produced giant
              // handles covering the whole design. Plain fixed values, slightly larger
              // than the original 10px for easier grabbing, is the correct fix.
              borderStrokeWidth={2}
              anchorStroke="#7B2FBE"
              anchorFill="#FFFFFF"
              anchorSize={12}
              anchorCornerRadius={2}
              rotateAnchorOffset={25}
              enabledAnchors={isIconSelected
                ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
                : ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
              keepRatio={isIconSelected}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 20 || newBox.height < 20) return oldBox;
                if (isIconSelected || shiftHeld) {
                  const ratio = oldBox.width / oldBox.height;
                  const newW = Math.max(20, newBox.width);
                  const newH = Math.max(20, newW / ratio);
                  return { ...newBox, width: newW, height: newH };
                }
                return newBox;
              }}
            />
          )}
        </Layer>
      </Stage>

      {/* Other viewers' live cursors — plain HTML overlay converting page-space
          coordinates to screen-space with the same zoom/pan transform the Stage
          itself uses, same technique the Ruler above already uses. */}
      {collaborators?.filter((c) => c.cursor).map((c) => (
        <div
          key={c.id}
          className="absolute z-30 pointer-events-none transition-transform duration-75 ease-linear"
          style={{ left: 0, top: 0, transform: `translate(${c.cursor!.x * zoom + panX}px, ${c.cursor!.y * zoom + panY}px)` }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ fill: c.color }}>
            <path d="M1 1l6.5 15 2.5-6 6-2.5z" />
          </svg>
          <span
            className="ml-3.5 -mt-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white whitespace-nowrap"
            style={{ backgroundColor: c.color }}
          >
            {c.name}
          </span>
        </div>
      ))}

      {/* Comment pins — a small marker on the canvas for every open comment attached
          to an element on this page (see FloatingToolbar's "Comment" action and
          CommentsPanel's pendingElement handling), so it's visible which element a
          comment belongs to instead of the comment only existing in the side panel.
          Positioned at the element's top-right corner, same page-space-to-screen
          conversion as the cursor overlay above. */}
      {!hideChrome && comments
        .filter((c) => c.pageId === page.id && !c.resolved && c.elementId)
        .map((c) => {
          const el = page.elements.find((e) => e.id === c.elementId);
          if (!el) return null;
          return (
            <button
              key={c.id}
              onClick={() => setCommentsOpen(true)}
              title={`${c.userName}: ${c.content}`}
              className="absolute z-30 w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-canva-purple text-white flex items-center justify-center shadow-lg border-2 border-white dark:border-gray-900 hover:scale-110 transition-transform"
              style={{ left: (el.x + el.width) * zoom + panX, top: el.y * zoom + panY }}
            >
              <HiChat size={12} />
            </button>
          );
        })}

      {contextMenu && (() => {
        const menuElement = page.elements.find((e) => e.id === contextMenu.elementId);
        if (!menuElement) return null;
        const menuItems: { icon: any; label: string; shortcut?: string; danger?: boolean; action: () => void }[] = [
          { icon: HiOutlineClipboard, label: 'Copy', shortcut: 'Ctrl+C', action: () => copy() },
          { icon: HiOutlineDocumentDownload, label: 'Paste', shortcut: 'Ctrl+V', action: () => paste() },
          { icon: HiOutlineDuplicate, label: 'Duplicate', shortcut: 'Ctrl+D', action: () => duplicateElements([menuElement.id]) },
          ...(menuElement.type === 'image' ? [
            { type: 'divider' } as any,
            {
              // The actual crop that makes this cover the page edge-to-edge is
              // computed fresh at render time from the CURRENT page size (see
              // PageBackgroundImageLayer) — placeholder 0/0/100/100 here is never
              // read for that, it's just satisfying the stored shape.
              icon: HiOutlinePhotograph, label: 'Set as Background', action: () => {
                const data = menuElement.data as ImageData;
                setElementAsPageBackground(menuElement.id, { src: data.src, cropX: 0, cropY: 0, cropWidth: 100, cropHeight: 100 });
                toast.success('Set as background');
              },
            },
          ] : []),
          { type: 'divider' } as any,
          { icon: HiOutlineArrowSmUp, label: 'Forward', action: () => bringForward(menuElement.id) },
          { icon: HiOutlineArrowUp, label: 'Bring to Front', action: () => bringToFront(menuElement.id) },
          { icon: HiOutlineArrowSmDown, label: 'Backward', action: () => sendBackward(menuElement.id) },
          { icon: HiOutlineArrowDown, label: 'Send to Back', action: () => sendToBack(menuElement.id) },
          { type: 'divider' } as any,
          menuElement.locked
            ? { icon: HiOutlineLockOpen, label: 'Unlock', action: () => unlockElement(menuElement.id) }
            : { icon: HiOutlineLockClosed, label: 'Lock', action: () => lockElement(menuElement.id) },
          menuElement.visible
            ? { icon: HiOutlineEyeOff, label: 'Hide', action: () => hideElement(menuElement.id) }
            : { icon: HiOutlineEye, label: 'Show', action: () => showElement(menuElement.id) },
          { type: 'divider' } as any,
          { icon: HiOutlineTrash, label: 'Delete', shortcut: 'Del', danger: true, action: () => hideElement(menuElement.id) },
        ];
        return (
          <>
            <div className="fixed inset-0 z-50" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div
              className="fixed z-50 bg-white dark:bg-gray-800 rounded-xl shadow-canva-xl border border-gray-100 dark:border-gray-700 py-1 w-52"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              {menuItems.map((item, i) => (
                'type' in item && item.type === 'divider' ? (
                  <div key={`d${i}`} className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
                ) : (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setContextMenu(null); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                      item.danger
                        ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <item.icon size={14} className="flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && <span className="text-xs text-gray-400">{item.shortcut}</span>}
                  </button>
                )
              ))}
            </div>
          </>
        );
      })()}

      {!hideChrome && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-1">
          <button
            onClick={zoomOutAtCenter}
            title="Zoom out (Ctrl+-)"
            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <HiMinus size={14} />
          </button>
          <span className="w-12 text-center text-xs font-medium text-gray-700 dark:text-gray-200 select-none">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={zoomInAtCenter}
            title="Zoom in (Ctrl+=)"
            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <HiPlus size={14} />
          </button>
          <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
          <button
            onClick={zoomToFit}
            title="Fit to screen"
            className="px-2.5 py-1 rounded-full text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-canva-purple hover:bg-canva-purple/10"
          >
            Fit
          </button>
        </div>
      )}
    </div>
  );
}

// Maps the OLD text-only `data.animation` string (pre-Phase-2 saved projects) onto
// the new canonical ElementAnimationType vocabulary, so old projects keep animating
// on load instead of silently going static — a one-time read-path fallback only,
// never written back.
const LEGACY_TEXT_ANIMATION_MAP: Record<string, ElementAnimationType> = {
  fadeIn: 'fadeIn', slideUp: 'rise', slideLeft: 'slide', zoom: 'zoom', bounce: 'bounce',
  pulse: 'pulse', typewriter: 'typewriter',
};

function resolveElementAnimation(element: CanvasElement): ElementAnimation {
  if (element.animation) return element.animation;
  const legacy = (element.data as any)?.animation as string | undefined;
  const mapped = legacy ? LEGACY_TEXT_ANIMATION_MAP[legacy] : undefined;
  return mapped ? { type: mapped, duration: 0.6, delay: 0 } : { type: 'none', duration: 0.5, delay: 0 };
}

function AnimatedTextElement({ element, commonProps, data, isTextEdit }: {
  element: CanvasElement;
  commonProps: any;
  data: TextData & { animation?: string };
  isTextEdit: boolean;
}) {
  const textRef = useRef<Konva.Text>(null);
  const groupRef = useRef<Konva.Group>(null);
  const [displayText, setDisplayText] = useState(data.content);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const animation = resolveElementAnimation(element);

  const applyTextTransform = (text: string) => {
    switch (data.textTransform) {
      case 'uppercase': return text.toUpperCase();
      case 'lowercase': return text.toLowerCase();
      case 'capitalize': return text.replace(/\b\w/g, (c) => c.toUpperCase());
      default: return text;
    }
  };

  // Typewriter is the one animation type that's fundamentally text-specific (reveals
  // characters progressively) — everything else (fadeIn/pop/bounce/slide/rise/zoom/
  // rotate/pulse) is handled uniformly for every element type, text included, by the
  // shared ElementAnimationDriver keyed off element.animation directly.
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (animation.type !== 'typewriter') {
      setDisplayText(data.content);
      return;
    }
    const startDelayMs = Math.max(0, animation.delay * 1000);
    const startTimer = setTimeout(() => {
      setDisplayText('');
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        setDisplayText(data.content.slice(0, i));
        if (i >= data.content.length) clearInterval(intervalRef.current);
      }, 60);
    }, startDelayMs);
    return () => { clearTimeout(startTimer); clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id, animation.type, animation.delay, data.content]);

  // Measure text and adjust Group size to match actual content (not text constraint width).
  // This makes the Transformer selection box tight around actual text, not oversized.
  useEffect(() => {
    const groupNode = groupRef.current;
    const textNode = textRef.current;
    if (!groupNode || !textNode) return;

    // Use requestAnimationFrame to measure after Konva has rendered
    const frameId = requestAnimationFrame(() => {
      try {
        // Get the actual text bounding box from Konva
        const clientRect = textNode.getClientRect?.();
        if (clientRect && clientRect.width > 0 && clientRect.height > 0) {
          // Set Group size to actual text bounds (in design space, not screen space)
          // Divide by zoom since getClientRect returns screen coordinates
          groupNode.width(Math.max(1, clientRect.width / zoom));
          groupNode.height(Math.max(1, clientRect.height / zoom));
        }
      } catch (e) {
        // Silently ignore measurement errors
      }
    });

    return () => cancelAnimationFrame(frameId);
  }, [text, data.content, data.fontSize, data.fontFamily, data.fontWeight, data.fontStyle, data.lineHeight, zoom];

  const text = applyTextTransform(displayText);

  // Konva.Text has no separate fontWeight attribute — it only reads a single
  // `fontStyle` string, verbatim, into the canvas 2D `font` shorthand
  // (fontStyle + fontVariant + fontSize + fontFamily; see Text.js's
  // _getContextFont). A plain `fontWeight` prop is silently ignored, so every
  // weight rendered as whatever the font's default happens to be — while the
  // text-editing textarea overlay (real CSS, `font-weight` genuinely works)
  // rendered the actual chosen weight. That mismatch is exactly what looked like
  // "text goes bold when you select/edit it": editing was correct, the passive
  // canvas render was wrong. Canvas font parsing accepts a numeric weight in the
  // same slot as the 'bold' keyword, so passing it straight through fixes both.
  const konvaFontStyle = [String(data.fontWeight), data.fontStyle === 'italic' ? 'italic' : ''].filter(Boolean).join(' ');

  // Curved text: positive curvature arches the text upward (peak in the middle),
  // negative dips it downward — each character is measured and placed as its own
  // Text node along a circular arc, since Konva has no built-in text-on-a-path.
  if (data.curvature && text.length > 0) {
    const widths = measureCharWidths(text, data.fontFamily, data.fontSize, data.fontWeight, data.fontStyle);
    const totalWidth = widths.reduce((a, b) => a + b, 0) || 1;
    const angle = (data.curvature / 100) * Math.PI; // -100..100 → up to a half-circle sweep
    const radius = totalWidth / Math.max(0.05, Math.abs(angle));
    const curveSign = angle >= 0 ? 1 : -1;

    let cumulative = 0;
    const charNodes = Array.from(text).map((ch, i) => {
      const w = widths[i];
      const centerOffset = cumulative + w / 2;
      cumulative += w;
      const t = centerOffset / totalWidth - 0.5; // -0.5..0.5
      const charAngle = t * angle;
      const x = radius * Math.sin(charAngle);
      const y = -curveSign * radius * (1 - Math.cos(charAngle));
      return { ch, x, y, rotation: (charAngle * 180) / Math.PI };
    });

    return (
      <Group {...commonProps} width={element.width} height={element.height} visible={!isTextEdit}>
        {data.background && (
          <Rect
            x={-data.background.padding}
            y={-data.background.padding}
            width={element.width + data.background.padding * 2}
            height={element.height + data.background.padding * 2}
            fill={data.background.color}
            opacity={data.background.opacity}
          />
        )}
        {charNodes.map((c, i) => (
          <Text
            key={i}
            text={c.ch}
            x={element.width / 2 + c.x}
            y={element.height / 2 + c.y}
            offsetX={widths[i] / 2}
            rotation={c.rotation}
            fontFamily={data.fontFamily}
            fontSize={data.fontSize}
            fontStyle={konvaFontStyle}
            fill={data.color}
            stroke={data.outline?.color}
            strokeWidth={data.outline?.width ?? 0}
          />
        ))}
      </Group>
    );
  }

  const textProps = {
    text,
    fontFamily: data.fontFamily,
    fontSize: data.fontSize,
    fontStyle: konvaFontStyle,
    fill: data.color,
    width: element.width,
    height: element.height,
    align: data.textAlign,
    lineHeight: data.lineHeight,
    letterSpacing: data.letterSpacing,
    textDecoration: data.textDecoration,
    stroke: data.outline?.color,
    strokeWidth: data.outline?.width ?? 0,
  };

  // Render background OUTSIDE the text Group so it doesn't affect Group sizing.
  // This lets the Group (used by Transformer) size tightly to just the text content.
  if (data.background) {
    return (
      <>
        <Rect
          x={element.x - data.background.padding}
          y={element.y - data.background.padding}
          width={element.width + data.background.padding * 2}
          height={element.height + data.background.padding * 2}
          fill={data.background.color}
          opacity={data.background.opacity}
        />
        <Group ref={groupRef} {...commonProps} name="text-wrapper" visible={!isTextEdit}>
          <Text ref={textRef} {...textProps} />
        </Group>
      </>
    );
  }

  return (
    <Group ref={groupRef} {...commonProps} name="text-wrapper" visible={!isTextEdit}>
      <Text ref={textRef} {...textProps} />
    </Group>
  );
}

interface AnimTransform {
  opacityMul: number;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotationDelta: number;
}

const ANIM_RESTING: AnimTransform = { opacityMul: 1, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotationDelta: 0 };

function directionOffset(direction: ElementAnimation['direction'] | undefined, distance: number) {
  switch (direction) {
    case 'right': return { dx: distance, dy: 0 };
    case 'up': return { dx: 0, dy: -distance };
    case 'down': return { dx: 0, dy: distance };
    case 'left':
    default: return { dx: -distance, dy: 0 };
  }
}

// Pure function of elapsed time -> transform, evaluated fresh every animation-driver
// tick (see ElementAnimationDriver) rather than baked into an imperative one-shot
// Konva .to() tween — this is what makes it a real, re-evaluable animation instead of
// "fire once on mount and forget," even though full timeline-scrub-to-any-point
// support is left for a future pass (see ElementAnimationDriver's start-time model).
function computeAnimationTransform(
  type: ElementAnimationType,
  elapsedSinceDelayMs: number,
  durationMs: number,
  direction: ElementAnimation['direction'] | undefined,
  nowMs: number
): AnimTransform {
  if (elapsedSinceDelayMs < 0) return computeAnimationTransform(type, 0, durationMs, direction, nowMs);
  const t = Math.min(elapsedSinceDelayMs, durationMs);
  switch (type) {
    case 'fadeIn':
      return { ...ANIM_RESTING, opacityMul: Konva.Easings.EaseInOut(t, 0, 1, durationMs) };
    case 'pop': {
      const s = Konva.Easings.BackEaseOut(t, 0, 1, durationMs);
      const o = Konva.Easings.EaseOut(t, 0, 1, Math.max(1, durationMs * 0.6));
      return { ...ANIM_RESTING, opacityMul: Math.min(1, o), scaleX: s, scaleY: s };
    }
    case 'bounce': {
      const { dx, dy } = directionOffset(direction || 'up', 60);
      const v = Konva.Easings.BounceEaseOut(t, 0, 1, durationMs);
      const o = Konva.Easings.EaseOut(t, 0, 1, Math.max(1, durationMs * 0.4));
      return { ...ANIM_RESTING, opacityMul: Math.min(1, o), offsetX: dx * (1 - v), offsetY: dy * (1 - v) };
    }
    case 'slide': {
      const { dx, dy } = directionOffset(direction || 'left', 120);
      const v = Konva.Easings.EaseOut(t, 0, 1, durationMs);
      return { ...ANIM_RESTING, opacityMul: v, offsetX: dx * (1 - v), offsetY: dy * (1 - v) };
    }
    case 'rise': {
      const { dx, dy } = directionOffset(direction || 'down', 60);
      const v = Konva.Easings.EaseOut(t, 0, 1, durationMs);
      return { ...ANIM_RESTING, opacityMul: v, offsetX: dx * (1 - v), offsetY: dy * (1 - v) };
    }
    case 'zoom': {
      const s = Konva.Easings.EaseOut(t, 0.1, 0.9, durationMs);
      return { ...ANIM_RESTING, opacityMul: Konva.Easings.EaseOut(t, 0, 1, durationMs), scaleX: s, scaleY: s };
    }
    case 'rotate': {
      const s = Konva.Easings.EaseOut(t, 0.2, 0.8, durationMs);
      return {
        ...ANIM_RESTING,
        opacityMul: Konva.Easings.EaseOut(t, 0, 1, durationMs),
        scaleX: s, scaleY: s,
        rotationDelta: Konva.Easings.EaseOut(t, -180, 180, durationMs),
      };
    }
    case 'typewriter':
      // Text elements get real character-reveal from AnimatedTextElement instead;
      // this path only runs for non-text elements, which have nothing to "type," so
      // it falls back to a plain fade rather than doing nothing at all.
      return { ...ANIM_RESTING, opacityMul: Konva.Easings.EaseInOut(t, 0, 1, durationMs) };
    case 'pulse': {
      // A continuous attention-getter, not a one-shot entrance — keeps oscillating
      // for as long as the element is on screen, unlike every other type here.
      const period = Math.max(300, durationMs);
      const phase = (nowMs % period) / period;
      const s = 1 + Math.sin(phase * Math.PI * 2) * 0.05;
      return { ...ANIM_RESTING, scaleX: s, scaleY: s };
    }
    default:
      return ANIM_RESTING;
  }
}

function applyAnimationTransform(node: Konva.Node, transform: AnimTransform, element: CanvasElement) {
  node.opacity(element.opacity * transform.opacityMul);
  node.offsetX(transform.offsetX);
  node.offsetY(transform.offsetY);
  node.scaleX(transform.scaleX);
  node.scaleY(transform.scaleY);
  node.rotation(element.rotation + transform.rotationDelta);
}

// One shared driver per page rather than one Konva.Animation per animated element —
// finds each element's root node generically via its existing `id` (every element
// type's commonProps already sets `id: element.id` on its outermost Konva node, so
// this needs no per-type wiring at all). Mounted only while the page actually has at
// least one non-'none' animation, so pages without any cost nothing.
function ElementAnimationDriver({ elements, stageRef }: { elements: CanvasElement[]; stageRef: React.RefObject<Konva.Stage> }) {
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const startTimesRef = useRef<Map<string, number>>(new Map());
  const signaturesRef = useRef<Map<string, string>>(new Map());
  const doneRef = useRef<Set<string>>(new Set());

  // (Re)starts just the elements whose animation config actually changed (new type,
  // or duration/delay/direction edited, or a brand-new animated element) — editing
  // one element's animation shouldn't restart every other element's on the page.
  useEffect(() => {
    const now = performance.now();
    const liveIds = new Set<string>();
    elements.forEach((el) => {
      const a = resolveElementAnimation(el);
      liveIds.add(el.id);
      if (a.type === 'none') {
        startTimesRef.current.delete(el.id);
        signaturesRef.current.delete(el.id);
        doneRef.current.delete(el.id);
        return;
      }
      const sig = `${a.type}:${a.duration}:${a.delay}:${a.direction || ''}`;
      if (signaturesRef.current.get(el.id) !== sig) {
        signaturesRef.current.set(el.id, sig);
        startTimesRef.current.set(el.id, now);
        doneRef.current.delete(el.id);
      }
    });
    Array.from(signaturesRef.current.keys()).forEach((id) => {
      if (!liveIds.has(id)) { signaturesRef.current.delete(id); startTimesRef.current.delete(id); doneRef.current.delete(id); }
    });
  }, [elements]);

  useEffect(() => {
    const stage = stageRef.current;
    const layer = stage?.getLayers()[0];
    if (!stage || !layer) return;

    const anim = new Konva.Animation(() => {
      const now = performance.now();
      elementsRef.current.forEach((el) => {
        const a = resolveElementAnimation(el);
        if (a.type === 'none' || (a.type === 'typewriter' && el.type === 'text')) return;
        if (doneRef.current.has(el.id)) return; // pulse never gets marked done, see below

        const node = stage.findOne('#' + el.id);
        if (!node) return;

        const startedAt = startTimesRef.current.get(el.id);
        if (startedAt === undefined) return;
        const elapsed = now - startedAt;
        const delayMs = Math.max(0, a.delay * 1000);
        const durationMs = Math.max(50, a.duration * 1000);

        const transform = computeAnimationTransform(a.type, elapsed - delayMs, durationMs, a.direction, now);
        applyAnimationTransform(node, transform, el);

        if (a.type !== 'pulse' && elapsed >= delayMs + durationMs) {
          doneRef.current.add(el.id);
          applyAnimationTransform(node, ANIM_RESTING, el);
        }
      });
    }, layer);
    anim.start();
    return () => { anim.stop(); };
  }, [stageRef]);

  return null;
}

function measureCharWidths(text: string, fontFamily: string, fontSize: number, fontWeight: number, fontStyle: string): number[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${fontStyle === 'italic' ? 'italic ' : ''}${fontWeight} ${fontSize}px ${fontFamily}`;
  return Array.from(text).map((ch) => ctx.measureText(ch).width);
}

// Konva's own Path.parsePathData() uses a regex tokenizer that mis-parses compact SVG
// arc-flag notation (e.g. Heroicons' "a1 1 0 001.414 1.414", where "00" flags run
// straight into the next coordinate with no separator) — it only special-cases the
// literal token "00", not "00" glued to a following number, silently corrupting the
// rest of the path. Rather than hand-parse SVG ourselves, rasterize real <path>/<circle>/
// etc. markup through the browser's own (spec-correct) SVG engine, exactly like a normal
// <img>, then draw that as a Konva.Image — the same approach already used for uploaded
// images below. This sidesteps the parser bug entirely instead of working around it.
function buildIconSvgMarkup(data: any): { markup: string; vbWidth: number; vbHeight: number } {
  const paths: string[] = data.svgPaths ? data.svgPaths : data.svgPath ? [data.svgPath] : [];
  const iconFills: string[] = data.iconFills ? data.iconFills : [];
  const vbWidth: number = data.viewBoxWidth || data.viewBoxSize || 20;
  const vbHeight: number = data.viewBoxHeight || data.viewBoxSize || 20;
  const accentFill: string = data.fill || '#6366F1';
  const body = paths
    .map((p, i) => {
      const rawFill = iconFills[i] || iconFills[0] || 'currentColor';
      const fill = rawFill === 'currentColor' || rawFill === 'none' ? accentFill : rawFill;
      return `<path d="${p.replace(/"/g, '&quot;')}" fill="${fill}"/>`;
    })
    .join('');
  return {
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbWidth} ${vbHeight}">${body}</svg>`,
    vbWidth,
    vbHeight,
  };
}

function IconElement({ element, commonProps: rawCommonProps, data }: { element: CanvasElement; commonProps: any; data: any }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const { markup, vbWidth, vbHeight } = useMemo(() => buildIconSvgMarkup(data), [
    data.svgPaths, data.svgPath, data.iconFills, data.fill, data.viewBoxWidth, data.viewBoxHeight, data.viewBoxSize,
  ]);

  const flipH = !!data.flipH;
  const flipV = !!data.flipV;
  const commonProps = (flipH || flipV) ? {
    ...rawCommonProps,
    x: rawCommonProps.x + (flipH ? element.width : 0),
    y: rawCommonProps.y + (flipV ? element.height : 0),
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
  } : rawCommonProps;

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  }, [markup]);

  if (!image) return <Group {...commonProps} width={element.width} height={element.height} />;

  // Contain-fit: scale uniformly to fit inside the element's box, centered, so a
  // non-square viewBox never stretches even though the bounding box itself may not be square.
  const rawScale = Math.min(element.width / vbWidth, element.height / vbHeight);
  const scale = Number.isFinite(rawScale) && rawScale > 0 ? rawScale : 1;
  const drawWidth = vbWidth * scale;
  const drawHeight = vbHeight * scale;
  const offsetX = (element.width - drawWidth) / 2;
  const offsetY = (element.height - drawHeight) / 2;

  return (
    <Group {...commonProps} width={element.width} height={element.height}>
      <KonvaImage image={image} x={offsetX} y={offsetY} width={drawWidth} height={drawHeight} />
    </Group>
  );
}

// Renders a page's locked background image — same manual-Image-load pattern as
// StaticImageElement, but with no commonProps/drag handlers/selection wiring at all,
// since a page background is never selectable, draggable, or resizable (see
// PageBackgroundImage in types/index.ts). Sits between the flat-color canvas-bg Rect
// and the grid/elements, so it's always beneath every real element.
function PageBackgroundImageLayer({
  backgroundImage, pageWidth, pageHeight, repositioning, dragPreviewOffset, onDragMove, onDragEnd, onWheelZoom,
}: {
  backgroundImage: PageBackgroundImage; pageWidth: number; pageHeight: number;
  repositioning: boolean;
  dragPreviewOffset: { x: number; y: number } | null;
  onDragMove: (offsetX: number, offsetY: number) => void;
  onDragEnd: (offsetX: number, offsetY: number) => void;
  onWheelZoom: (deltaY: number) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imageRef = useRef<Konva.Image>(null);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { if (!cancelled) setImage(img); };
    img.onerror = () => { if (!cancelled) console.error('[PageBackgroundImageLayer] failed to load', backgroundImage.src); };
    img.src = backgroundImage.src;
    return () => { cancelled = true; };
  }, [backgroundImage.src]);

  // Same "only cache when a filter is genuinely active" rule as StaticImageElement —
  // caching unconditionally risks Konva rendering the uncropped part of the cache
  // canvas as solid black instead of transparent (see that component's own comment).
  const brightness = backgroundImage.brightness ?? 100;
  const contrast = backgroundImage.contrast ?? 100;
  const saturation = backgroundImage.saturation ?? 100;
  const hue = backgroundImage.hue ?? 0;
  const blur = backgroundImage.blur ?? 0;
  const hasFilters = brightness !== 100 || contrast !== 100 || saturation !== 100 || hue !== 0 || blur > 0;

  useEffect(() => {
    if (!imageRef.current || !image) return;
    if (hasFilters) {
      imageRef.current.cache();
    } else {
      imageRef.current.clearCache();
    }
    imageRef.current.getLayer()?.batchDraw();
  }, [image, hasFilters, brightness, contrast, saturation, hue, blur, pageWidth, pageHeight, backgroundImage.scale, backgroundImage.offsetX, backgroundImage.offsetY, dragPreviewOffset]);

  if (!image) return null;

  // Cover-fit is recomputed fresh from the CURRENT page dimensions on every render,
  // rather than trusting backgroundImage.cropX/Y/Width/Height (computed once, for
  // whatever page size existed at the moment "Set as Background" was clicked) —
  // otherwise resizing the page to a different aspect ratio afterward would stretch
  // the image to the new box using a crop window sized for the OLD ratio, distorting
  // it instead of staying correctly cropped to cover the page edge-to-edge.
  const targetRatio = pageWidth / pageHeight;
  const srcRatio = image.naturalWidth / image.naturalHeight;
  let cropW0 = image.naturalWidth, cropH0 = image.naturalHeight;
  if (srcRatio > targetRatio) {
    cropW0 = targetRatio * image.naturalHeight;
  } else if (srcRatio < targetRatio) {
    cropH0 = image.naturalWidth / targetRatio;
  }

  // scale/offsetX/Y layer a drag-to-reposition/zoom on top of that base cover-fit —
  // scale shrinks the crop window (zooming in), offsetX/Y (each -1..1) then shifts
  // that smaller window within the slack left over in the source image, so the
  // result can never expose empty space beyond the image's own edges.
  const scale = Math.min(4, Math.max(1, backgroundImage.scale ?? 1));
  const offsetX = dragPreviewOffset ? dragPreviewOffset.x : (backgroundImage.offsetX ?? 0);
  const offsetY = dragPreviewOffset ? dragPreviewOffset.y : (backgroundImage.offsetY ?? 0);
  const cropWidth = cropW0 / scale;
  const cropHeight = cropH0 / scale;
  const slackX = (image.naturalWidth - cropWidth) / 2;
  const slackY = (image.naturalHeight - cropHeight) / 2;
  const cropX = image.naturalWidth / 2 - cropWidth / 2 + offsetX * slackX;
  const cropY = image.naturalHeight / 2 - cropHeight / 2 + offsetY * slackY;

  // Same brightness/contrast/HSL/blur mapping StaticImageElement uses.
  const konvaBrightness = (brightness - 100) / 100;
  const konvaContrast = contrast - 100;
  const konvaSaturation = (saturation - 100) / 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = [];
  if (brightness !== 100) filters.push(Konva.Filters.Brighten);
  if (contrast !== 100) filters.push(Konva.Filters.Contrast);
  if (hue !== 0 || saturation !== 100) filters.push(Konva.Filters.HSL);
  if (blur > 0) filters.push(Konva.Filters.Blur);

  // Converts a page-space drag delta (Konva's draggable accumulates this directly
  // onto the node's own x/y from wherever the drag started) into a new offsetX/Y —
  // dragging right reveals more of what's currently off the left edge, i.e. moves
  // the crop window (and so offsetX) the other way. Guarded against slack being 0
  // (scale still at 1, cover-fit exactly, nothing to pan yet).
  const offsetFromDrag = (node: Konva.Node) => {
    const baseOffsetX = backgroundImage.offsetX ?? 0;
    const baseOffsetY = backgroundImage.offsetY ?? 0;
    const newOffsetX = slackX > 0 ? Math.min(1, Math.max(-1, baseOffsetX - (node.x() * (cropWidth / pageWidth)) / slackX)) : baseOffsetX;
    const newOffsetY = slackY > 0 ? Math.min(1, Math.max(-1, baseOffsetY - (node.y() * (cropHeight / pageHeight)) / slackY)) : baseOffsetY;
    return { newOffsetX, newOffsetY };
  };

  return (
    <KonvaImage
      ref={imageRef}
      name="page-background-image"
      listening={repositioning}
      draggable={repositioning}
      onDragMove={(e) => {
        const { newOffsetX, newOffsetY } = offsetFromDrag(e.target);
        onDragMove(newOffsetX, newOffsetY);
      }}
      onDragEnd={(e) => {
        const { newOffsetX, newOffsetY } = offsetFromDrag(e.target);
        e.target.position({ x: 0, y: 0 });
        onDragEnd(newOffsetX, newOffsetY);
      }}
      onWheel={(e) => {
        if (!repositioning) return;
        e.evt.preventDefault();
        e.cancelBubble = true;
        onWheelZoom(e.evt.deltaY);
      }}
      image={image}
      x={0}
      y={0}
      width={pageWidth}
      height={pageHeight}
      crop={{ x: cropX, y: cropY, width: Math.max(1, cropWidth), height: Math.max(1, cropHeight) }}
      filters={filters}
      brightness={konvaBrightness}
      contrast={konvaContrast}
      hue={hue}
      saturation={konvaSaturation}
      blurRadius={blur}
    />
  );
}

// Dispatches to a static (cached, filterable) render for ordinary photos, or a
// continuously-sampled live one for animated stickers/GIFs — kept as two
// separate components (rather than branching inside one) so this stays a
// stable per-element choice and never trips the rules-of-hooks.
function ImageElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: ImageData }) {
  if (data.animated) {
    return <AnimatedStickerElement element={element} commonProps={commonProps} data={data} />;
  }
  return <StaticImageElement element={element} commonProps={commonProps} data={data} />;
}

function StaticImageElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: ImageData }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imageRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    if (data.src) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { if (!cancelled) setImage(img); };
      // Without this, a failed load (bad URL, CORS rejection, 404) just leaves
      // `image` null forever with no trace — the element quietly stays a gray
      // placeholder and there's nothing in the console to explain why.
      img.onerror = () => { if (!cancelled) console.error('[ImageElement] failed to load', data.src); };
      img.src = data.src;
    }
    // If the element is deleted/unmounted (or data.src changes again) while a
    // load is in flight, drop the callbacks instead of setState-ing a
    // component that no longer cares — a real, if minor, leak source.
    return () => { cancelled = true; };
  }, [data.src]);

  useEffect(() => {
    if (!imageRef.current || !image) return;
    // .cache() rasterizes the node into an offscreen bitmap — the ONLY reason to
    // pay for that is Konva's pixel filters (Brighten/Contrast/HSL/Blur), which
    // require a real getImageData/putImageData pass. crop, cornerRadius, and plain
    // width/height are native Konva.Image drawing properties that render correctly
    // on their own. Caching unconditionally here used to also run on every crop
    // change, and combined with a crop rect that doesn't fully cover the cached
    // canvas, that can leave the uncovered region rendering solid black instead of
    // transparent (a real Konva cache+crop interaction issue) — skipping cache()
    // entirely whenever no filter is active avoids that path altogether.
    const hasActiveFilters = (data.brightness !== undefined && data.brightness !== 100)
      || (data.contrast !== undefined && data.contrast !== 100)
      || (data.hue !== undefined && data.hue !== 0)
      || (data.saturation !== undefined && data.saturation !== 100)
      || (data.blur !== undefined && data.blur > 0);
    if (hasActiveFilters) {
      imageRef.current.cache();
    } else {
      imageRef.current.clearCache();
    }
    imageRef.current.getLayer()?.batchDraw();
  }, [
    image, data.brightness, data.contrast, data.saturation, data.hue, data.blur, data.borderRadius,
    element.width, element.height,
    // Crop changes the region drawn from the source image — needed here so a
    // filtered image's cache re-rasterizes with the new crop; an unfiltered image
    // re-renders natively on every Konva prop change regardless, but re-running
    // this effect costs nothing and keeps the two paths' triggers identical.
    (data as any).cropX, (data as any).cropY, (data as any).cropWidth, (data as any).cropHeight,
  ]);

  if (!image) {
    return (
      <Rect
        {...commonProps}
        width={element.width}
        height={element.height}
        fill="#F3F4F6"
        cornerRadius={data.borderRadius}
      />
    );
  }

  // All five sliders are 0-200 (100 = unchanged), except hue (0-360) and blur (px).
  // Each filter below wants a different range, so convert per-filter rather than
  // sharing one mapping:
  //   Brighten  -> brightness  -1..1
  //   Contrast  -> contrast  -100..100  (Konva squares (contrast+100)/100)
  //   HSL       -> saturation  -1..1, hue 0..360
  const brightness = ((data.brightness ?? 100) - 100) / 100;
  const contrast = (data.contrast ?? 100) - 100;
  const saturation = ((data.saturation ?? 100) - 100) / 100;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = [];
  if (data.brightness !== undefined && data.brightness !== 100) filters.push(Konva.Filters.Brighten);
  if (data.contrast !== undefined && data.contrast !== 100) filters.push(Konva.Filters.Contrast);
  // Konva's HSL filter drives hue AND saturation, so it has to be enabled when
  // either one is off its neutral value — keying it on hue alone meant moving
  // only the Saturation slider did nothing at all.
  if ((data.hue !== undefined && data.hue !== 0) || (data.saturation !== undefined && data.saturation !== 100)) {
    filters.push(Konva.Filters.HSL);
  }
  if (data.blur !== undefined && data.blur > 0) filters.push(Konva.Filters.Blur);

  const flipH = !!(data as any).flipH;
  const flipV = !!(data as any).flipV;

  // Adjust x/y so the flipped image still occupies the same visual bounding box
  const flipProps = (flipH || flipV) ? {
    ...commonProps,
    x: commonProps.x + (flipH ? element.width : 0),
    y: commonProps.y + (flipV ? element.height : 0),
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
  } : commonProps;

  // cropX/Y/Width/Height are percentages of the source image (0-100; 0,0,100,100 = full
  // image, uncropped) — converted here into the source-pixel rect Konva's `crop` expects.
  const cropXPct = (data as any).cropX ?? 0;
  const cropYPct = (data as any).cropY ?? 0;
  const cropWPct = (data as any).cropWidth ?? 100;
  const cropHPct = (data as any).cropHeight ?? 100;
  const isCropped = cropXPct !== 0 || cropYPct !== 0 || cropWPct !== 100 || cropHPct !== 100;
  const cropProp = isCropped ? {
    crop: {
      x: (cropXPct / 100) * image.naturalWidth,
      y: (cropYPct / 100) * image.naturalHeight,
      width: Math.max(1, (cropWPct / 100) * image.naturalWidth),
      height: Math.max(1, (cropHPct / 100) * image.naturalHeight),
    },
  } : {};

  const imageVisualProps = {
    ...cropProp,
    image,
    width: element.width,
    height: element.height,
    cornerRadius: data.borderRadius,
    filters,
    brightness,
    contrast,
    hue: data.hue || 0,
    blurRadius: data.blur || 0,
    saturation,
  };

  // A shaped photo frame (see ImageData.clipPolygon): the Group carries the
  // element's identity/position/handlers so selection, drag and transform all keep
  // working unchanged, while the image inside is masked to the polygon. Flip is
  // applied to the inner image relative to the box so the mask itself stays put.
  const clip = data.clipPolygon;
  if (clip && clip.length >= 6) {
    return (
      <Group
        {...commonProps}
        width={element.width}
        height={element.height}
        clipFunc={(ctx: any) => {
          ctx.beginPath();
          ctx.moveTo(clip[0] * element.width, clip[1] * element.height);
          for (let i = 2; i < clip.length; i += 2) ctx.lineTo(clip[i] * element.width, clip[i + 1] * element.height);
          ctx.closePath();
        }}
      >
        <KonvaImage
          ref={imageRef}
          {...imageVisualProps}
          x={flipH ? element.width : 0}
          y={flipV ? element.height : 0}
          scaleX={flipH ? -1 : 1}
          scaleY={flipV ? -1 : 1}
        />
      </Group>
    );
  }

  return (
    <KonvaImage
      ref={imageRef}
      {...flipProps}
      {...imageVisualProps}
    />
  );
}

// The video trick (hand a live element to Konva.Image and keep redrawing) does NOT
// work for GIFs: canvas drawImage() of an animated <img> only ever captures its first
// frame — GIF animation is a feature of the browser's own native image renderer, not
// something canvas hooks into the way it does for <video>. This actually decodes every
// frame (via gifuct-js) up front, composites each one onto the running frame the way a
// real GIF player does (respecting each frame's disposal method), and swaps the Konva
// node's image imperatively on a timer matched to each frame's own delay.
function AnimatedStickerElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: ImageData }) {
  const imageNodeRef = useRef<Konva.Image>(null);
  const framesRef = useRef<{ canvas: HTMLCanvasElement; delay: number }[]>([]);
  const [ready, setReady] = useState(false);
  const [firstFrame, setFirstFrame] = useState<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setFirstFrame(null);
    framesRef.current = [];

    (async () => {
      try {
        const { parseGIF, decompressFrames } = await import('gifuct-js');
        const res = await fetch(data.src);
        const buffer = await res.arrayBuffer();
        const gif = parseGIF(buffer);
        const rawFrames = decompressFrames(gif, true);
        const w = gif.lsd.width;
        const h = gif.lsd.height;

        // One persistent canvas accumulates frames in place, same as a real GIF
        // decoder — each built frame is a snapshot of it at that point.
        const composite = document.createElement('canvas');
        composite.width = w;
        composite.height = h;
        const cctx = composite.getContext('2d')!;

        const built: { canvas: HTMLCanvasElement; delay: number }[] = [];
        for (const frame of rawFrames) {
          if (frame.disposalType === 2) cctx.clearRect(0, 0, w, h);
          const patch = document.createElement('canvas');
          patch.width = frame.dims.width;
          patch.height = frame.dims.height;
          patch.getContext('2d')!.putImageData(
            // window.ImageData — this file's own ImageData type (image element data)
            // shadows the DOM/Canvas API's global ImageData constructor.
            new window.ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height), 0, 0,
          );
          cctx.drawImage(patch, frame.dims.left, frame.dims.top);

          const snapshot = document.createElement('canvas');
          snapshot.width = w;
          snapshot.height = h;
          snapshot.getContext('2d')!.drawImage(composite, 0, 0);
          // GIF delay is in centiseconds; a 0 delay is common and means "as fast as
          // possible", which browsers themselves clamp to a sane minimum.
          built.push({ canvas: snapshot, delay: Math.max(20, (frame.delay || 10) * 10) });
        }

        if (cancelled || built.length === 0) return;
        framesRef.current = built;
        setFirstFrame(built[0].canvas);
        setReady(true);
      } catch (err) {
        console.error('[sticker] failed to decode GIF', err);
      }
    })();

    return () => { cancelled = true; };
  }, [data.src]);

  useEffect(() => {
    if (!ready || !imageNodeRef.current || framesRef.current.length < 2) return;
    const node = imageNodeRef.current;
    const layer = node.getLayer();
    if (!layer) return;
    let frameIndex = 0;
    let elapsed = 0;
    const anim = new Konva.Animation((frameObj) => {
      if (!frameObj) return;
      elapsed += frameObj.timeDiff;
      if (elapsed >= framesRef.current[frameIndex].delay) {
        elapsed = 0;
        frameIndex = (frameIndex + 1) % framesRef.current.length;
        node.image(framesRef.current[frameIndex].canvas);
      }
    }, layer);
    anim.start();
    return () => { anim.stop(); };
  }, [ready]);

  const flipH = !!(data as any).flipH;
  const flipV = !!(data as any).flipV;
  const flipProps = (flipH || flipV) ? {
    ...commonProps,
    x: commonProps.x + (flipH ? element.width : 0),
    y: commonProps.y + (flipV ? element.height : 0),
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
  } : commonProps;

  if (!ready || !firstFrame) {
    return (
      <Rect
        {...commonProps}
        width={element.width}
        height={element.height}
        fill="#F3F4F6"
        cornerRadius={data.borderRadius}
      />
    );
  }

  return (
    <KonvaImage
      ref={imageNodeRef}
      {...flipProps}
      image={firstFrame}
      width={element.width}
      height={element.height}
      cornerRadius={data.borderRadius}
    />
  );
}

// Konva has no native video node — the standard technique (same one Konva's own docs
// use) is to hand a live <video> element to a Konva.Image as its image source and keep
// redrawing the layer on every animation frame, so each redraw just samples whatever
// frame the video is currently showing.
function VideoElement({ element, commonProps, data, clock, trackMuted }: { element: CanvasElement; commonProps: any; data: VideoData; clock: TimelineClock; trackMuted?: boolean }) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const imageNodeRef = useRef<Konva.Image>(null);
  const animRef = useRef<Konva.Animation | null>(null);
  const [ready, setReady] = useState(false);
  // A clip that belongs to a timeline track is driven by the shared clock (play/pause/
  // seek/visibility all come from it); one with no trackId keeps today's exact
  // independent-autoplay-on-mount behavior, so ordinary (non-timeline) video placements
  // are unaffected by any of this.
  const clocked = !!element.trackId;

  useEffect(() => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    // Native `loop` always restarts at 0, not at a trim-in point — looping a clip
    // whose start/end were trimmed away from the source's own bounds has to be
    // handled manually via the timeupdate listener below instead.
    video.loop = false;
    // A video whose audio was split onto its own linked Audio track (see
    // addVideoWithAudio in editorStore.ts) must never also play its own embedded
    // audio — that would double it up with the linked audio element.
    video.muted = trackMuted || !!data.linkedAudioId || (data.muted ?? false);
    video.playsInline = true;
    video.src = data.src;
    if (data.startTime) video.currentTime = data.startTime;
    // Kept out of layout/visible flow but genuinely attached to the document — a
    // fully detached (never-appended) <video> plays and decodes frames fine (canvas
    // drawImage() doesn't care), but Web Audio's createMediaElementSource() on it
    // silently produces a dead/sample-less track for export's audio mix, which in
    // turn poisons the whole combined MediaRecorder (0 bytes output, no error).
    // Real DOM attachment fixes the audio tap without changing anything visible.
    videoElRef.current = video;

    const handleReady = () => {
      setReady(true);
      // A reversed clip is driven manually (currentTime scrubbed backward every
      // animation frame below) — native play() only ever moves forward, so it must
      // stay paused here regardless of autoplay.
      if (!clocked && (data.autoplay ?? true) && !data.reverse) video.play().catch(() => { /* browser blocked autoplay — still shows first frame */ });
    };
    video.addEventListener('loadeddata', handleReady);
    // Without this, a video whose source 404s, CORS-fails, or uses an unsupported
    // codec just sits at readyState 0 forever with no visible sign anything is
    // wrong — it never reaches "ready", so it never registers with the clock, so
    // it silently never plays. Surfacing the actual failure is what turns a
    // confusing "nothing happens" report into something fixable.
    const handleError = () => {
      const code = video.error?.code;
      const reason = code === 1 ? 'load aborted' : code === 2 ? 'network error' : code === 3 ? 'decode error' : code === 4 ? 'format not supported' : 'unknown error';
      toast.error(`"${element.name}" failed to load (${reason}) — its video won't play`);
    };
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('error', handleError);
      video.pause();
      video.src = '';
    };
  }, [data.src, clocked]);

  useEffect(() => {
    const video = videoElRef.current;
    if (video) video.muted = trackMuted || !!data.linkedAudioId || (data.muted ?? false);
  }, [data.muted, data.linkedAudioId, trackMuted]);

  useEffect(() => {
    const video = videoElRef.current;
    if (video) video.volume = data.volume ?? 1;
  }, [data.volume]);

  useEffect(() => {
    const video = videoElRef.current;
    if (video) video.playbackRate = data.playbackRate ?? 1;
  }, [data.playbackRate]);

  // Enforce the clip's trim in/out points during ordinary forward playback — an
  // unclocked video otherwise plays from startTime straight through to the end of
  // the SOURCE file, ignoring endTime entirely (native `loop` only ever restarts at
  // 0, not at a trim-in point), so a clip trimmed shorter than its source needs this
  // to actually stop/loop where the user set it.
  useEffect(() => {
    const video = videoElRef.current;
    if (!video || clocked || data.reverse) return;
    const inSec = data.startTime || 0;
    const handleTimeUpdate = () => {
      if (data.endTime && video.currentTime >= data.endTime - 0.05) {
        if (data.loop ?? true) video.currentTime = inSec;
        else video.pause();
      }
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [clocked, data.reverse, data.startTime, data.endTime, data.loop]);

  // Register with the shared clock only while this clip is on a track. getTiming is
  // re-read every frame (not snapshotted) so trimming later (Phase 3) doesn't require
  // re-registering.
  useEffect(() => {
    if (!clocked || !ready || !videoElRef.current) return;
    return clock.registerMedia(
      element.id,
      videoElRef.current,
      () => (element.trackId
        ? { timelineStart: element.timelineStart ?? 0, timelineEnd: element.timelineEnd ?? 0, reverse: data.reverse }
        : null),
      (data.startTime || 0) * 1000
    );
  }, [clocked, ready, element.id, element.trackId, element.timelineStart, element.timelineEnd, data.startTime, data.reverse, clock]);

  const hasFilters = (data.brightness !== undefined && data.brightness !== 100) || (data.contrast !== undefined && data.contrast !== 100);

  // Crop is only re-applied to the cached bitmap here, on change — the per-frame
  // animation loop below only re-caches while a brightness/contrast filter is
  // active, so without this a crop edit on an otherwise-unfiltered clip would
  // update the sidebar values but never actually redraw on the canvas. Only
  // actually cache() when a filter is active, same reasoning as the image
  // element's own effect — caching an unfiltered crop risks Konva rendering the
  // uncovered part of the cache canvas as solid black instead of transparent.
  useEffect(() => {
    if (!ready || !imageNodeRef.current) return;
    if (hasFilters) {
      imageNodeRef.current.cache();
    } else {
      imageNodeRef.current.clearCache();
    }
    imageNodeRef.current.getLayer()?.batchDraw();
  }, [ready, hasFilters, data.cropX, data.cropY, data.cropWidth, data.cropHeight, data.borderRadius, element.width, element.height]);

  useEffect(() => {
    if (!ready || !imageNodeRef.current) return;
    const layer = imageNodeRef.current.getLayer();
    if (!layer) return;
    const video = videoElRef.current;
    const anim = new Konva.Animation((frame) => {
      // Outside its timeline window, a clocked clip is hidden rather than just paused —
      // matches how a static (non-timeline) element only ever shows while it's the
      // current page's content, extended here to "current time" instead of "current page."
      if (clocked && imageNodeRef.current) {
        const start = element.timelineStart ?? 0;
        const end = element.timelineEnd ?? 0;
        const active = clock.getCurrentMs() >= start && clock.getCurrentMs() < end;
        imageNodeRef.current.visible(active);
      }
      // An unclocked reverse clip has no shared clock driving it (see the clocked
      // path in timelineClock.ts's syncOne) — step currentTime backward manually
      // here instead, since <video> doesn't support negative playbackRate.
      if (!clocked && data.reverse && video) {
        const dtSec = (frame?.timeDiff ?? 16) / 1000 * (data.playbackRate ?? 1);
        const inSec = data.startTime || 0;
        const outSec = data.endTime || video.duration || 0;
        let next = video.currentTime - dtSec;
        if (next <= inSec) next = (data.loop ?? true) ? outSec : inSec;
        video.currentTime = next;
      }
      // Video frames update continuously outside React's render cycle, so a
      // brightness/contrast filter (which Konva applies to a cached raster
      // snapshot, not live) needs re-caching every frame it's active — cheap to
      // skip entirely via hasFilters when neither slider is touched (the common case).
      if (hasFilters && imageNodeRef.current) {
        imageNodeRef.current.cache();
      }
    }, layer);
    anim.start();
    animRef.current = anim;
    return () => { anim.stop(); };
  }, [ready, clocked, element.timelineStart, element.timelineEnd, clock, data.reverse, data.startTime, data.endTime, data.playbackRate, hasFilters]);

  if (!ready) {
    return (
      <Rect
        {...commonProps}
        width={element.width}
        height={element.height}
        fill="#111827"
        cornerRadius={4}
      />
    );
  }

  const video = videoElRef.current!;

  // Flip and crop mirror StaticImageElement's exact conventions (percentages of the
  // source, 0/0/100/100 = uncropped) so the same mental model applies to both.
  const flipH = !!data.flipH;
  const flipV = !!data.flipV;
  const flipProps = (flipH || flipV) ? {
    ...commonProps,
    x: commonProps.x + (flipH ? element.width : 0),
    y: commonProps.y + (flipV ? element.height : 0),
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
  } : commonProps;

  const cropXPct = data.cropX ?? 0;
  const cropYPct = data.cropY ?? 0;
  const cropWPct = data.cropWidth ?? 100;
  const cropHPct = data.cropHeight ?? 100;
  const isCropped = cropXPct !== 0 || cropYPct !== 0 || cropWPct !== 100 || cropHPct !== 100;
  const cropProp = (isCropped && video.videoWidth) ? {
    crop: {
      x: (cropXPct / 100) * video.videoWidth,
      y: (cropYPct / 100) * video.videoHeight,
      width: Math.max(1, (cropWPct / 100) * video.videoWidth),
      height: Math.max(1, (cropHPct / 100) * video.videoHeight),
    },
  } : {};

  const brightness = ((data.brightness ?? 100) - 100) / 100;
  const contrast = (data.contrast ?? 100) - 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = [];
  if (data.brightness !== undefined && data.brightness !== 100) filters.push(Konva.Filters.Brighten);
  if (data.contrast !== undefined && data.contrast !== 100) filters.push(Konva.Filters.Contrast);

  return (
    <KonvaImage
      ref={imageNodeRef}
      {...flipProps}
      {...cropProp}
      image={video}
      width={element.width}
      height={element.height}
      cornerRadius={data.borderRadius || 0}
      filters={filters}
      brightness={brightness}
      contrast={contrast}
    />
  );
}

// Audio has no visual representation on the Konva Stage — this component exists purely
// to own a detached <audio> element and register it with the shared clock. It is only
// meaningful once placed on a track (trackId set); an unclocked audio element (not
// possible to create yet outside the timeline UI) would simply never play.
function AudioElement({ element, data, clock, trackMuted }: { element: CanvasElement; data: AudioData; clock: TimelineClock; trackMuted?: boolean }) {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const clocked = !!element.trackId;

  useEffect(() => {
    const audio = document.createElement('audio');
    audio.crossOrigin = 'anonymous';
    audio.loop = clocked ? false : (data.loop ?? false);
    audio.muted = trackMuted || (data.muted ?? false);
    audio.volume = data.volume ?? 1;
    audio.src = data.src;
    if (data.startTime) audio.currentTime = data.startTime;
    // See the matching comment in VideoElement — real DOM attachment (invisible)
    // is required for Web Audio's createMediaElementSource() to reliably tap this
    // element's decoded audio during export; a fully detached element plays fine
    // on its own but silently starves the Web Audio graph of samples.
    audioElRef.current = audio;

    const handleReady = () => setReady(true);
    audio.addEventListener('loadeddata', handleReady);
    // Same reasoning as VideoElement's handleError: without this, a clip whose
    // source 404s, CORS-fails, or uses a codec this element can't decode just sits
    // at readyState 0 forever — never "ready", never registered with the clock,
    // never attempts to play, and nothing visible ever says why.
    const handleError = () => {
      const code = audio.error?.code;
      const reason = code === 1 ? 'load aborted' : code === 2 ? 'network error' : code === 3 ? 'decode error' : code === 4 ? 'format not supported' : 'unknown error';
      toast.error(`"${element.name}" failed to load (${reason}) — it won't play`);
    };
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadeddata', handleReady);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, [data.src, clocked]);

  useEffect(() => {
    const audio = audioElRef.current;
    if (!audio) return;
    audio.muted = trackMuted || (data.muted ?? false);
    audio.volume = data.volume ?? 1;
  }, [data.muted, data.volume, trackMuted]);

  // Fade in/out — continuously ramps volume near the clip's own timeline start/end
  // while clocked. This is what actually connects the Fade In/Out sliders in the
  // Audio Properties panel to real playback; before this they wrote to data.fadeIn/
  // fadeOut but nothing ever read those fields back during playback, so the sliders
  // had no audible effect no matter what they were set to.
  useEffect(() => {
    if (!clocked) return;
    return clock.subscribe(() => {
      const audio = audioElRef.current;
      if (!audio) return;
      const start = element.timelineStart ?? 0;
      const end = element.timelineEnd ?? 0;
      const nowMs = clock.getCurrentMs();
      const fadeInSec = data.fadeIn ?? 0;
      const fadeOutSec = data.fadeOut ?? 0;
      let mult = 1;
      if (fadeInSec > 0) {
        const intoClip = (nowMs - start) / 1000;
        if (intoClip < fadeInSec) mult = Math.min(mult, Math.max(0, intoClip / fadeInSec));
      }
      if (fadeOutSec > 0) {
        const toEnd = (end - nowMs) / 1000;
        if (toEnd < fadeOutSec) mult = Math.min(mult, Math.max(0, toEnd / fadeOutSec));
      }
      const base = (trackMuted || (data.muted ?? false)) ? 0 : (data.volume ?? 1);
      audio.volume = Math.max(0, Math.min(1, base * mult));
    });
  }, [clocked, clock, element.timelineStart, element.timelineEnd, data.fadeIn, data.fadeOut, data.volume, data.muted, trackMuted]);

  useEffect(() => {
    if (!clocked || !ready || !audioElRef.current) return;
    return clock.registerMedia(
      element.id,
      audioElRef.current,
      () => (element.trackId
        ? { timelineStart: element.timelineStart ?? 0, timelineEnd: element.timelineEnd ?? 0 }
        : null),
      (data.startTime || 0) * 1000
    );
  }, [clocked, ready, element.id, element.trackId, element.timelineStart, element.timelineEnd, data.startTime, clock]);

  return null;
}

function ShapeElement({ element, commonProps: rawCommonProps, data }: { element: CanvasElement; commonProps: any; data: ShapeData }) {
  const { width, height } = element;
  const fill = data.fill || '#7B2FBE';
  const stroke = data.stroke || 'transparent';
  const strokeWidth = data.strokeWidth || 0;
  const cx = width / 2;
  const cy = height / 2;

  // Shadow commonProps with a flip-adjusted version so every case below (there's one
  // per shape type) picks it up automatically without needing its own flip handling.
  const flipH = !!(data as any).flipH;
  const flipV = !!(data as any).flipV;
  const commonProps = (flipH || flipV) ? {
    ...rawCommonProps,
    x: rawCommonProps.x + (flipH ? width : 0),
    y: rawCommonProps.y + (flipV ? height : 0),
    scaleX: flipH ? -1 : 1,
    scaleY: flipV ? -1 : 1,
  } : rawCommonProps;

  // Generate polygon points scaled to width/height
  const getPolygonPoints = (sides: number, rotationDeg: number = 0): number[] => {
    const points: number[] = [];
    const angleStep = (Math.PI * 2) / sides;
    const startAngle = (rotationDeg * Math.PI) / 180 - Math.PI / 2;
    for (let i = 0; i < sides; i++) {
      const angle = startAngle + i * angleStep;
      points.push(cx + (width / 2) * Math.cos(angle), cy + (height / 2) * Math.sin(angle));
    }
    return points;
  };

  // Star points scaled to width/height
  const getStarPoints = (numPoints: number): number[] => {
    const points: number[] = [];
    const outerRx = width / 2;
    const outerRy = height / 2;
    const innerRx = outerRx * 0.4;
    const innerRy = outerRy * 0.4;
    const angleStep = Math.PI / numPoints;
    const startAngle = -Math.PI / 2;
    for (let i = 0; i < numPoints * 2; i++) {
      const angle = startAngle + i * angleStep;
      const rx = i % 2 === 0 ? outerRx : innerRx;
      const ry = i % 2 === 0 ? outerRy : innerRy;
      points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
    }
    return points;
  };

  switch (data.shapeType) {
    case 'rectangle':
      return (
        <Rect
          {...commonProps}
          width={width}
          height={height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={data.cornerRadius}
        />
      );
    case 'circle':
      return (
        <Rect
          {...commonProps}
          width={width}
          height={height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={Math.min(width, height) / 2}
        />
      );
    case 'triangle':
      return (
        <Line
          {...commonProps}
          points={getPolygonPoints(3, 180)}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
        />
      );
    case 'star':
      return (
        <Line
          {...commonProps}
          points={getStarPoints(5)}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
        />
      );
    case 'pentagon':
      return (
        <Line
          {...commonProps}
          points={getPolygonPoints(5)}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
        />
      );
    case 'hexagon':
      return (
        <Line
          {...commonProps}
          points={getPolygonPoints(6)}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
        />
      );
    case 'diamond':
      return (
        <Line
          {...commonProps}
          points={getPolygonPoints(4, 0)}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
        />
      );
    case 'heart': {
      // Heart shape using bezier-like points
      const hw = width / 2;
      const hh = height / 2;
      const k = 0.5; // curvature factor
      const points = [
        cx, cy + hh * 0.4,          // bottom point
        cx - hw, cy - hh * 0.2,     // left bulge
        cx - hw * 0.6, cy - hh,     // left top
        cx, cy - hh * 0.6,          // center dip
        cx + hw * 0.6, cy - hh,     // right top
        cx + hw, cy - hh * 0.2,     // right bulge
        cx, cy + hh * 0.4,          // close
      ];
      return (
        <Line
          {...commonProps}
          points={points}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
          tension={0.4}
        />
      );
    }
    case 'arrow': {
      // Arrow pointing right
      const headW = width * 0.35;
      const headH = height * 0.5;
      const shaftH = height * 0.25;
      const points = [
        0, cy - shaftH,
        width - headW, cy - shaftH,
        width - headW, cy - headH,
        width, cy,
        width - headW, cy + headH,
        width - headW, cy + shaftH,
        0, cy + shaftH,
      ];
      return (
        <Line
          {...commonProps}
          points={points}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
        />
      );
    }
    case 'line':
      return (
        <Line
          {...commonProps}
          points={[0, height / 2, width, height / 2]}
          stroke={fill}
          strokeWidth={strokeWidth || 3}
          lineCap="round"
        />
      );
    default:
      return (
        <Rect
          {...commonProps}
          width={width}
          height={height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={data.cornerRadius}
        />
      );
  }
}

function TableElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: TableData }) {
  const { width, height } = element;
  const { rows, cols, cells, headerRow, borderColor, headerBgColor, headerTextColor, cellTextColor } = data;
  const cellW = width / cols;
  const cellH = height / rows;

  return (
    <Group {...commonProps} width={width} height={height}>
      {/* Background */}
      <Rect width={width} height={height} fill="#FFFFFF" stroke={borderColor} strokeWidth={1} />
      {/* Cells */}
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((_, col) => {
          const isHeader = headerRow && row === 0;
          return (
            <Group key={`${row}-${col}`}>
              <Rect
                x={col * cellW}
                y={row * cellH}
                width={cellW}
                height={cellH}
                fill={isHeader ? headerBgColor : '#FFFFFF'}
                stroke={borderColor}
                strokeWidth={1}
              />
              <Text
                x={col * cellW + 8}
                y={row * cellH + cellH / 2 - 8}
                width={cellW - 16}
                text={cells?.[row]?.[col] || ''}
                fontSize={13}
                fontFamily="Inter"
                fill={isHeader ? headerTextColor : cellTextColor}
                align="center"
                verticalAlign="middle"
              />
            </Group>
          );
        })
      )}
    </Group>
  );
}

function ChartElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: ChartData }) {
  const { width, height } = element;
  const { chartType, data: chartData, showLabels, showLegend } = data;
  const padding = 40;
  const legendHeight = showLegend ? 30 : 0;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2 - legendHeight;
  const maxVal = Math.max(...(chartData || []).map((d) => d.value), 1);

  if (chartType === 'bar') {
    const barCount = chartData?.length || 0;
    const barGap = 8;
    const barW = Math.max(10, (chartW - barGap * (barCount + 1)) / barCount);

    return (
      <Group {...commonProps} width={width} height={height}>
        <Rect width={width} height={height} fill="#FFFFFF" cornerRadius={8} />
        {/* Y axis */}
        <Line points={[padding, padding, padding, padding + chartH]} stroke="#E5E5E5" strokeWidth={1} />
        {/* X axis */}
        <Line points={[padding, padding + chartH, padding + chartW, padding + chartH]} stroke="#E5E5E5" strokeWidth={1} />
        {/* Bars */}
        {chartData?.map((d, i) => {
          const barH = (d.value / maxVal) * chartH;
          const x = padding + barGap + i * (barW + barGap);
          const y = padding + chartH - barH;
          return (
            <Group key={i}>
              <Rect x={x} y={y} width={barW} height={barH} fill={d.color} cornerRadius={[4, 4, 0, 0]} />
              {showLabels && (
                <>
                  <Text x={x} y={y - 18} width={barW} text={String(d.value)} fontSize={11} fill="#666" align="center" />
                  <Text x={x} y={padding + chartH + 6} width={barW} text={d.label} fontSize={11} fill="#999" align="center" />
                </>
              )}
            </Group>
          );
        })}
        {/* Legend */}
        {showLegend && (
          <Group x={padding} y={height - 25}>
            {chartData?.map((d, i) => (
              <Group key={i} x={i * 80}>
                <Rect x={0} y={0} width={10} height={10} fill={d.color} cornerRadius={2} />
                <Text x={14} y={-1} text={d.label} fontSize={11} fill="#666" />
              </Group>
            ))}
          </Group>
        )}
      </Group>
    );
  }

  if (chartType === 'line') {
    const points: number[] = [];
    chartData?.forEach((d, i) => {
      const x = padding + (i / Math.max((chartData.length - 1), 1)) * chartW;
      const y = padding + chartH - (d.value / maxVal) * chartH;
      points.push(x, y);
    });

    return (
      <Group {...commonProps} width={width} height={height}>
        <Rect width={width} height={height} fill="#FFFFFF" cornerRadius={8} />
        <Line points={[padding, padding, padding, padding + chartH]} stroke="#E5E5E5" strokeWidth={1} />
        <Line points={[padding, padding + chartH, padding + chartW, padding + chartH]} stroke="#E5E5E5" strokeWidth={1} />
        {points.length >= 4 && (
          <Line points={points} stroke="#7B2FBE" strokeWidth={3} tension={0.3} lineCap="round" lineJoin="round" />
        )}
        {chartData?.map((d, i) => {
          const x = padding + (i / Math.max((chartData.length - 1), 1)) * chartW;
          const y = padding + chartH - (d.value / maxVal) * chartH;
          return (
            <Group key={i}>
              <Rect x={x - 5} y={y - 5} width={10} height={10} fill="#7B2FBE" cornerRadius={5} />
              {showLabels && (
                <>
                  <Text x={x - 15} y={y - 20} width={30} text={String(d.value)} fontSize={10} fill="#666" align="center" />
                  <Text x={x - 15} y={padding + chartH + 6} width={30} text={d.label} fontSize={10} fill="#999" align="center" />
                </>
              )}
            </Group>
          );
        })}
      </Group>
    );
  }

  if (chartType === 'pie' || chartType === 'doughnut') {
    const total = chartData?.reduce((sum, d) => sum + d.value, 0) || 1;
    const cx = width / 2;
    const cy = (height - legendHeight) / 2;
    const radius = Math.min(chartW, chartH) / 2 - 10;
    const innerRadius = chartType === 'doughnut' ? radius * 0.5 : 0;
    let startAngle = -Math.PI / 2;

    return (
      <Group {...commonProps} width={width} height={height}>
        <Rect width={width} height={height} fill="#FFFFFF" cornerRadius={8} />
        {chartData?.map((d, i) => {
          const sliceAngle = (d.value / total) * Math.PI * 2;
          const endAngle = startAngle + sliceAngle;
          const largeArc = sliceAngle > Math.PI ? 1 : 0;

          const x1 = cx + radius * Math.cos(startAngle);
          const y1 = cy + radius * Math.sin(startAngle);
          const x2 = cx + radius * Math.cos(endAngle);
          const y2 = cy + radius * Math.sin(endAngle);

          let path: string;
          if (innerRadius > 0) {
            const ix1 = cx + innerRadius * Math.cos(startAngle);
            const iy1 = cy + innerRadius * Math.sin(startAngle);
            const ix2 = cx + innerRadius * Math.cos(endAngle);
            const iy2 = cy + innerRadius * Math.sin(endAngle);
            path = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;
          } else {
            path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
          }

          startAngle = endAngle;

          return (
            <Group key={i}>
              <Line
                points={[]}
                fill={d.color}
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              {/* Use a path-like approach with a custom shape */}
              <Rect
                x={cx - radius}
                y={cy - radius}
                width={radius * 2}
                height={radius * 2}
                fill={d.color}
                opacity={0}
              />
            </Group>
          );
        })}
        {/* Fallback: render as colored blocks in a ring pattern */}
        {chartData?.map((d, i) => {
          const midAngle = startAngle - (chartData.slice(0, i + 1).reduce((s, dd) => s + dd.value, 0) / total) * Math.PI * 2 + ((d.value / total) * Math.PI) / 2;
          const labelR = (radius + innerRadius) / 2;
          const lx = cx + labelR * Math.cos(midAngle - Math.PI / 2);
          const ly = cy + labelR * Math.sin(midAngle - Math.PI / 2);
          return (
            <Text key={`lbl-${i}`} x={lx - 15} y={ly - 6} width={30} text={`${Math.round((d.value / total) * 100)}%`} fontSize={11} fill="#FFF" align="center" />
          );
        })}
        {showLegend && (
          <Group x={padding} y={height - 25}>
            {chartData?.map((d, i) => (
              <Group key={i} x={i * 80}>
                <Rect x={0} y={0} width={10} height={10} fill={d.color} cornerRadius={2} />
                <Text x={14} y={-1} text={d.label} fontSize={11} fill="#666" />
              </Group>
            ))}
          </Group>
        )}
      </Group>
    );
  }

  // Fallback
  return (
    <Group {...commonProps} width={width} height={height}>
      <Rect width={width} height={height} fill="#F3F4F6" cornerRadius={8} />
      <Text x={width / 2 - 40} y={height / 2 - 8} text="Chart" fontSize={14} fill="#999" />
    </Group>
  );
}
