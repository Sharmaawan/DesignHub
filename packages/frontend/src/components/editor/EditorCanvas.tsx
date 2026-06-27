import { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Group, Transformer, Line, RegularPolygon, Star } from 'react-konva';
import { useEditorStore } from '../../stores/editorStore';
import { CanvasElement, Page, TextData, ImageData, ShapeData } from '../../types';
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

  const {
    zoom, selectedElementIds, showGrid, gridSize, snapEnabled, showGuides,
    panX, panY,
    selectElement, deselectAll, moveElement, updateElement, setZoom, setPan,
    setHoveredElement, pushHistory,
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

  useEffect(() => {
    if (containerSize.width > 0 && containerSize.height > 0) {
      const scale = Math.min(
        (containerSize.width - 100) / page.width,
        (containerSize.height - 100) / page.height,
        1
      ) * 0.8;
      setZoom(scale);
      setPan(
        (containerSize.width - page.width * scale) / 2,
        (containerSize.height - page.height * scale) / 2
      );
    }
  }, [containerSize, page.width, page.height, setZoom, setPan]);

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
        textarea.style.fontSize = `${data.fontSize * zoom}px`;
        textarea.style.fontFamily = data.fontFamily;
        textarea.style.fontWeight = String(data.fontWeight);
        textarea.style.fontStyle = data.fontStyle;
        textarea.style.textAlign = data.textAlign;
        textarea.style.color = data.color;
        textarea.style.lineHeight = String(data.lineHeight);
        textarea.style.letterSpacing = `${data.letterSpacing}px`;
        textarea.style.background = 'transparent';
        textarea.style.border = '2px solid #7B2FBE';
        textarea.style.borderRadius = '4px';
        textarea.style.padding = '4px';
        textarea.style.outline = 'none';
        textarea.style.resize = 'none';
        textarea.style.zIndex = '10000';
        textarea.style.transformOrigin = 'left top';

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
            shadowColor={data.shadow?.color}
            shadowBlur={data.shadow?.blur}
            shadowOffsetX={data.shadow?.offsetX}
            shadowOffsetY={data.shadow?.offsetY}
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
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 20 || newBox.height < 20) return oldBox;
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

  useEffect(() => {
    if (data.src) {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setImage(img);
      img.src = data.src;
    }
  }, [data.src]);

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

  return (
    <KonvaImage
      {...commonProps}
      image={image}
      width={element.width}
      height={element.height}
      cornerRadius={data.borderRadius}
    />
  );
}

function ShapeElement({ element, commonProps, data }: { element: CanvasElement; commonProps: any; data: ShapeData }) {
  const { width, height } = element;
  const fill = data.fill || '#7B2FBE';
  const stroke = data.stroke || 'transparent';
  const strokeWidth = data.strokeWidth || 0;

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
        <Group {...commonProps}>
          <Rect
            x={-Math.min(width, height) / 2}
            y={-Math.min(width, height) / 2}
            width={Math.min(width, height)}
            height={Math.min(width, height)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            cornerRadius={Math.min(width, height) / 2}
          />
        </Group>
      );
    case 'triangle':
      return (
        <Group {...commonProps}>
          <RegularPolygon
            sides={3}
            radius={Math.min(width, height) / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            rotation={180}
          />
        </Group>
      );
    case 'star':
      return (
        <Group {...commonProps}>
          <Star
            numPoints={5}
            innerRadius={Math.min(width, height) / 4}
            outerRadius={Math.min(width, height) / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </Group>
      );
    case 'pentagon':
      return (
        <Group {...commonProps}>
          <RegularPolygon
            sides={5}
            radius={Math.min(width, height) / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </Group>
      );
    case 'hexagon':
      return (
        <Group {...commonProps}>
          <RegularPolygon
            sides={6}
            radius={Math.min(width, height) / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        </Group>
      );
    case 'diamond':
      return (
        <Group {...commonProps}>
          <RegularPolygon
            sides={4}
            radius={Math.min(width, height) / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            rotation={45}
          />
        </Group>
      );
    case 'line':
      return (
        <Line
          {...commonProps}
          points={[0, 0, width, 0]}
          stroke={fill}
          strokeWidth={strokeWidth || 3}
          lineCap="round"
        />
      );
    case 'heart':
      return (
        <Group {...commonProps}>
          <Text
            text="❤"
            fontSize={Math.min(width, height)}
            fill={fill}
          />
        </Group>
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
