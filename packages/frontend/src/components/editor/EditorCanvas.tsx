import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer, Line } from 'react-konva';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement, Page, TextData, ImageData, ShapeData, TableData, ChartData } from '../../types';
import Konva from 'konva';

interface EditorCanvasProps {
  page: Page;
}

export default function EditorCanvas({ page }: EditorCanvasProps) {
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
    zoom, selectedElementIds, showGrid, gridSize, snapEnabled, showGuides,
    panX, panY,
    selectElement, deselectAll, moveElement, updateElement, setZoom, setPan,
    setHoveredElement, pushHistory, setViewportCenter,
  } = useEditorStore();

  const sortedElements = [...page.elements]
    .sort((a, b) => a.zIndex - b.zIndex)
    .filter((e) => e.visible);

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
    const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    setZoom(Math.max(0.1, Math.min(5, newScale)));
  }, [zoom, setZoom]);

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
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
    if (isPanning) {
      const evt = e.evt as MouseEvent;
      const dx = evt.clientX - panStart.x - panX;
      const dy = evt.clientY - panStart.y - panY;
      setPan(panX + dx, panY + dy);
    }
  };

  const handleStageMouseUp = () => {
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
      draggable: !element.locked,
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
      case 'text': {
        const data = element.data as TextData;
        return (
          <Text
            key={element.id}
            {...commonProps}
            text={data.content}
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
            visible={!isTextEdit}
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
    <div ref={containerRef} className="w-full h-full">
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
        style={{ cursor: isPanning ? 'grabbing' : 'default' }}
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

          <Transformer
            ref={transformerRef}
            borderStroke="#7B2FBE"
            borderStrokeWidth={2}
            anchorStroke="#7B2FBE"
            anchorFill="#FFFFFF"
            anchorSize={10}
            anchorCornerRadius={2}
            rotateAnchorOffset={25}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']}
            keepRatio={false}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 20 || newBox.height < 20) return oldBox;
              if (shiftHeld) {
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

  return (
    <KonvaImage
      ref={imageRef}
      {...commonProps}
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

function ShapeElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: ShapeData }) {
  const { width, height } = element;
  const fill = data.fill || '#7B2FBE';
  const stroke = data.stroke || 'transparent';
  const strokeWidth = data.strokeWidth || 0;
  const cx = width / 2;
  const cy = height / 2;

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
