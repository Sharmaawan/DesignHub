import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer, Line } from 'react-konva';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement, Page, TextData, ImageData, ShapeData, TableData, ChartData, VideoData } from '../../types';
import Konva from 'konva';

interface EditorCanvasProps {
  page: Page;
  // Preview mode needs its own zoom/pan (fit-to-frame) and needs grid/rulers/guides
  // forced off, independent of whatever the live editor's global view state happens
  // to be — passing them in here avoids having to temporarily mutate (and restore)
  // shared store state, which is what made the earlier preview attempt fragile.
  zoomOverride?: number;
  panOverride?: { x: number; y: number };
  hideChrome?: boolean;
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

export default function EditorCanvas({ page, zoomOverride, panOverride, hideChrome }: EditorCanvasProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [shiftHeld, setShiftHeld] = useState(false);

  const {
    zoom: storeZoom, selectedElementIds, showGrid: storeShowGrid, gridSize, snapEnabled,
    showGuides: storeShowGuides, showRulers: storeShowRulers,
    panX: storePanX, panY: storePanY,
    selectElement, deselectAll, moveElement, updateElement, setZoom, setPan,
    setHoveredElement, pushHistory, setViewportCenter,
    activeTool, drawColor, drawWidth, addDrawing,
  } = useEditorStore();
  const [currentStroke, setCurrentStroke] = useState<number[]>([]);
  const isDrawingRef = useRef(false);

  const zoom = zoomOverride ?? storeZoom;
  const panX = panOverride?.x ?? storePanX;
  const panY = panOverride?.y ?? storePanY;
  const showGrid = hideChrome ? false : storeShowGrid;
  const showGuides = hideChrome ? false : storeShowGuides;
  const showRulers = hideChrome ? false : storeShowRulers;

  const sortedElements = [...page.elements]
    .sort((a, b) => a.zIndex - b.zIndex)
    .filter((e) => e.visible);

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

  useEffect(() => {
    if (containerSize.width > 0 && containerSize.height > 0) {
      const scale = Math.min(
        (containerSize.width - 100) / page.width,
        (containerSize.height - 100) / page.height,
        1
      ) * 0.8;
      setZoom(scale);
      const newPanX = (containerSize.width - page.width * scale) / 2;
      const newPanY = (containerSize.height - page.height * scale) / 2;
      setPan(newPanX, newPanY);
      // Update viewport center so new elements spawn centered
      setViewportCenter(page.width / 2, page.height / 2);
    }
  }, [containerSize, page.width, page.height, setZoom, setPan, setViewportCenter]);

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage) return;
    const nodes = selectedElementIds
      .map((id) => stage.findOne('#' + id))
      .filter(Boolean);
    transformer.nodes(nodes as any);
    transformer.getLayer()?.batchDraw();
  }, [selectedElementIds]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const scaleBy = 1.1;
    const oldScale = zoom;
    const newScale = Math.max(0.1, Math.min(5, e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy));
    // Anchor the zoom to the viewport center — without adjusting pan here, scaling
    // happens around the Stage's own (0,0), which visibly drags the page toward
    // wherever that point currently sits on screen instead of zooming in place.
    const cx = containerSize.width / 2;
    const cy = containerSize.height / 2;
    const stageX = (cx - panX) / oldScale;
    const stageY = (cy - panY) / oldScale;
    setZoom(newScale);
    setPan(cx - stageX * newScale, cy - stageY * newScale);
  }, [zoom, panX, panY, containerSize, setZoom, setPan]);

  // Eraser deliberately never touches images/text/shapes — it only deletes your own
  // pen/highlighter strokes that come within reach of the cursor, checked against each
  // stroke's own recorded points (converted back to page coordinates via its element's
  // x/y). A pixel-level canvas erase (destination-out) would have cut through whatever
  // artwork happened to be underneath, which isn't what an annotation eraser should do.
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
    if (activeTool !== 'select') {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (!pos) return;
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

      const evt = e.evt as MouseEvent;
      if (evt.button === 1) {
        setIsPanning(true);
        setPanStart({ x: evt.clientX - panX, y: evt.clientY - panY });
      }
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isDrawingRef.current) {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (!pos) return;
      if (activeTool === 'eraser') eraseNear(pos.x, pos.y);
      else setCurrentStroke((prev) => [...prev, pos.x, pos.y]);
      return;
    }
    if (isPanning) {
      const evt = e.evt as MouseEvent;
      const dx = evt.clientX - panStart.x - panX;
      const dy = evt.clientY - panStart.y - panY;
      setPan(panX + dx, panY + dy);
    }
  };

  const handleStageMouseUp = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (activeTool !== 'eraser' && currentStroke.length >= 4) {
        addDrawing(currentStroke, activeTool as 'pen' | 'highlighter', drawColor, drawWidth);
      }
      setCurrentStroke([]);
      return;
    }
    if (isPanning) {
      setIsPanning(false);
    }
    if (dragStart) {
      pushHistory();
      setDragStart(null);
    }
  };

  const handleElementClick = (e: Konva.KonvaEventObject<MouseEvent>, id: string) => {
    e.cancelBubble = true;
    const element = page.elements.find((el) => el.id === id);
    if (element?.locked) return;
    selectElement(id, e.evt.shiftKey);
  };

  const handleElementDblClick = (e: Konva.KonvaEventObject<MouseEvent>, element: CanvasElement) => {
    if (element.type === 'text') {
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
        textarea.style.background = 'rgba(255,255,255,0.9)';
        textarea.style.border = '2px solid #7B2FBE';
        textarea.style.borderRadius = '4px';
        textarea.style.padding = '4px';
        textarea.style.outline = 'none';
        textarea.style.resize = 'none';
        textarea.style.zIndex = '10000';
        textarea.style.transformOrigin = 'left top';
        textarea.style.overflow = 'hidden';
        textarea.style.wordWrap = 'break-word';

        textarea.focus();

        const finishEdit = () => {
          updateElement(element.id, {
            data: { ...data, content: textarea.value } as TextData,
          });
          textarea.remove();
          setEditingTextId(null);
          useEditorStore.setState({ isEditing: false });
          pushHistory();
        };

        textarea.addEventListener('blur', finishEdit);
        textarea.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter' && !ke.shiftKey) {
            ke.preventDefault();
            finishEdit();
          }
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
  };

  const handleElementDragStart = (e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    setDragStart({ x: e.target.x(), y: e.target.y() });
  };

  const handleElementDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    if (snapEnabled) {
      const node = e.target;
      let newX = node.x();
      let newY = node.y();

      const snapThreshold = 5 / zoom;
      const snapPoints = [0, page.width / 2, page.width, page.height / 2, page.height];

      for (const snapY of snapPoints) {
        if (Math.abs(newY - snapY) < snapThreshold) {
          newY = snapY;
        }
      }
      for (const snapX of snapPoints) {
        if (Math.abs(newX - snapX) < snapThreshold) {
          newX = snapX;
        }
      }
      node.x(newX);
      node.y(newY);
    }
  };

  const handleElementDragEnd = (e: Konva.KonvaEventObject<DragEvent>, id: string) => {
    moveElement(id, e.target.x(), e.target.y());
    pushHistory();
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
      draggable: !element.locked && activeTool === 'select',
      ...(element.shadow ? {
        shadowColor: element.shadow.color,
        shadowBlur: element.shadow.blur,
        shadowOffsetX: element.shadow.offsetX,
        shadowOffsetY: element.shadow.offsetY,
        shadowOpacity: element.shadow.opacity,
      } : {}),
      onClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleElementClick(e, element.id),
      onDblClick: (e: Konva.KonvaEventObject<MouseEvent>) => handleElementDblClick(e, element),
      onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => handleElementDragStart(e, element.id),
      onDragMove: handleElementDragMove,
      onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleElementDragEnd(e, element.id),
      onTransformEnd: (e: Konva.KonvaEventObject<Event>) => handleTransformEnd(e, element.id),
      onMouseEnter: () => setHoveredElement(element.id),
      onMouseLeave: () => setHoveredElement(null),
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
    <div ref={containerRef} className="w-full h-full relative">
      {showRulers && containerSize.width > 0 && (
        <Ruler zoom={zoom} panX={panX} panY={panY} width={containerSize.width} height={containerSize.height} />
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
        draggable={isPanning}
        onDragEnd={(e) => {
          if (isPanning) {
            setPan(e.target.x(), e.target.y());
          }
        }}
        style={{ cursor: isPanning ? 'grabbing' : activeTool !== 'select' ? 'crosshair' : 'default' }}
      >
        <Layer>
          <Rect
            name="canvas-bg"
            x={0}
            y={0}
            width={page.width}
            height={page.height}
            fill={page.backgroundColor}
            shadowColor="rgba(0,0,0,0.15)"
            shadowBlur={20}
            shadowOffsetX={0}
            shadowOffsetY={4}
            cornerRadius={2}
          />

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

          <Transformer
            ref={transformerRef}
            borderStroke="#7B2FBE"
            borderStrokeWidth={2}
            anchorStroke="#7B2FBE"
            anchorFill="#FFFFFF"
            anchorSize={10}
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
        </Layer>
      </Stage>
    </div>
  );
}

function AnimatedTextElement({ element, commonProps, data, isTextEdit }: {
  element: CanvasElement;
  commonProps: any;
  data: TextData & { animation?: string };
  isTextEdit: boolean;
}) {
  const textRef = useRef<Konva.Text>(null);
  const [displayText, setDisplayText] = useState(data.content);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const applyTextTransform = (text: string) => {
    switch (data.textTransform) {
      case 'uppercase': return text.toUpperCase();
      case 'lowercase': return text.toLowerCase();
      case 'capitalize': return text.replace(/\b\w/g, (c) => c.toUpperCase());
      default: return text;
    }
  };

  // Keep displayed text in sync with content
  useEffect(() => {
    if (data.animation !== 'typewriter') setDisplayText(data.content);
  }, [data.content, data.animation]);

  // Run animation — deferred so React-Konva finishes reconciling before we touch the node
  useEffect(() => {
    clearTimeout(timerRef.current);
    clearInterval(intervalRef.current);

    const anim = data.animation;
    if (!anim || anim === 'none') {
      setDisplayText(data.content);
      return;
    }

    if (anim === 'typewriter') {
      setDisplayText('');
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        setDisplayText(data.content.slice(0, i));
        if (i >= data.content.length) clearInterval(intervalRef.current);
      }, 60);
      return () => { clearInterval(intervalRef.current); };
    }

    // Defer past React's reconciliation so imperative opacity changes aren't overwritten
    timerRef.current = setTimeout(() => {
      const node = textRef.current;
      if (!node) return;

      // Reset node to clean state before each animation
      node.stopDrag();
      node.offsetX(0);
      node.offsetY(0);
      node.scaleX(1);
      node.scaleY(1);
      node.opacity(element.opacity);

      switch (anim) {
        case 'fadeIn':
          node.opacity(0);
          node.to({ opacity: element.opacity, duration: 0.9, easing: Konva.Easings.EaseInOut });
          break;
        case 'slideUp':
          node.offsetY(-60);
          node.opacity(0);
          node.to({ offsetY: 0, opacity: element.opacity, duration: 0.6, easing: Konva.Easings.EaseOut });
          break;
        case 'slideLeft':
          node.offsetX(-80);
          node.opacity(0);
          node.to({ offsetX: 0, opacity: element.opacity, duration: 0.6, easing: Konva.Easings.EaseOut });
          break;
        case 'zoom':
          node.scaleX(0.1);
          node.scaleY(0.1);
          node.opacity(0);
          node.to({ scaleX: 1, scaleY: 1, opacity: element.opacity, duration: 0.5, easing: Konva.Easings.EaseOut });
          break;
        case 'bounce':
          node.offsetY(-60);
          node.to({ offsetY: 0, duration: 0.9, easing: Konva.Easings.BounceEaseOut });
          break;
        case 'pulse':
          node.to({ scaleX: 1.08, scaleY: 1.08, duration: 0.4, easing: Konva.Easings.EaseInOut, onFinish: () => {
            node.to({ scaleX: 1, scaleY: 1, duration: 0.4, easing: Konva.Easings.EaseInOut });
          }});
          break;
      }
    }, 30);

    return () => { clearTimeout(timerRef.current); };
  // Re-run whenever the animation type or element identity changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id, data.animation]);

  const text = applyTextTransform(displayText);

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
            fontStyle={data.fontStyle === 'italic' ? 'italic' : 'normal'}
            fontWeight={data.fontWeight as any}
            fill={data.color}
            stroke={data.outline?.color}
            strokeWidth={data.outline?.width ?? 0}
          />
        ))}
      </Group>
    );
  }

  return (
    <Text
      ref={textRef}
      {...commonProps}
      text={text}
      fontFamily={data.fontFamily}
      fontSize={data.fontSize}
      fontStyle={data.fontStyle === 'italic' ? 'italic' : 'normal'}
      fontWeight={data.fontWeight as any}
      fill={data.color}
      width={element.width}
      height={element.height}
      align={data.textAlign}
      lineHeight={data.lineHeight}
      letterSpacing={data.letterSpacing}
      textDecoration={data.textDecoration}
      stroke={data.outline?.color}
      strokeWidth={data.outline?.width ?? 0}
      visible={!isTextEdit}
    />
  );
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

function ImageElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: ImageData }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imageRef = useRef<any>(null);

  useEffect(() => {
    if (data.src) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setImage(img);
      img.src = data.src;
    }
  }, [data.src]);

  useEffect(() => {
    if (imageRef.current && image) {
      imageRef.current.cache();
      imageRef.current.getLayer()?.batchDraw();
    }
  }, [image, data.brightness, data.contrast, data.saturation, data.hue, data.blur, data.borderRadius, element.width, element.height]);

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

  const brightness = ((data.brightness || 100) - 100) / 100;
  const contrast = ((data.contrast || 100) - 100) / 100;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters: any[] = [];
  if (data.brightness !== undefined && data.brightness !== 100) filters.push(Konva.Filters.Brighten);
  if (data.contrast !== undefined && data.contrast !== 100) filters.push(Konva.Filters.Contrast);
  if (data.hue !== undefined && data.hue !== 0) filters.push(Konva.Filters.HSL);
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

  return (
    <KonvaImage
      ref={imageRef}
      {...flipProps}
      {...cropProp}
      image={image}
      width={element.width}
      height={element.height}
      cornerRadius={data.borderRadius}
      filters={filters}
      brightness={brightness}
      contrast={contrast}
      hue={data.hue || 0}
      blurRadius={data.blur || 0}
      saturation={((data.saturation || 100) - 100) / 100}
    />
  );
}

// Konva has no native video node — the standard technique (same one Konva's own docs
// use) is to hand a live <video> element to a Konva.Image as its image source and keep
// redrawing the layer on every animation frame, so each redraw just samples whatever
// frame the video is currently showing.
function VideoElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: VideoData }) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const imageNodeRef = useRef<Konva.Image>(null);
  const animRef = useRef<Konva.Animation | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = data.loop ?? true;
    video.muted = data.muted ?? true;
    video.playsInline = true;
    video.src = data.src;
    if (data.startTime) video.currentTime = data.startTime;
    videoElRef.current = video;

    const handleReady = () => {
      setReady(true);
      if (data.autoplay ?? true) video.play().catch(() => { /* browser blocked autoplay — still shows first frame */ });
    };
    video.addEventListener('loadeddata', handleReady);

    return () => {
      video.removeEventListener('loadeddata', handleReady);
      video.pause();
      video.src = '';
    };
  }, [data.src]);

  useEffect(() => {
    const video = videoElRef.current;
    if (video) video.muted = data.muted ?? true;
  }, [data.muted]);

  useEffect(() => {
    const video = videoElRef.current;
    if (video) video.loop = data.loop ?? true;
  }, [data.loop]);

  useEffect(() => {
    if (!ready || !imageNodeRef.current) return;
    const layer = imageNodeRef.current.getLayer();
    if (!layer) return;
    const anim = new Konva.Animation(() => {}, layer);
    anim.start();
    animRef.current = anim;
    return () => { anim.stop(); };
  }, [ready]);

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

  return (
    <KonvaImage
      ref={imageNodeRef}
      {...commonProps}
      image={videoElRef.current!}
      width={element.width}
      height={element.height}
    />
  );
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
