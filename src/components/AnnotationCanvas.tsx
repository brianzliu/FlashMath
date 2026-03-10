import { useState, useRef, useCallback, useEffect } from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { cn, generateId } from "@/lib/utils";

export interface Region {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role: "question" | "answer" | null;
  pageIndex: number;
  labelNumber: number;
}

interface AnnotationCanvasProps {
  imageUrl: string;
  pageIndex: number;
  regions: Region[];
  activeMode: "question" | "answer" | null;
  onRegionAdded: (region: Region) => void;
  onRegionDeleted: (id: string) => void;
  onRegionChange?: (region: Region) => void;
  regionsByType?: Region[];
  className?: string;
}

type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface ResizeState {
  pointerId: number;
  regionId: string;
  handle: ResizeHandle;
  startPointer: { x: number; y: number };
  startRect: { x: number; y: number; width: number; height: number };
}

const MIN_REGION_SIZE = 10;

const RESIZE_HANDLES: Array<{
  handle: ResizeHandle;
  className: string;
  cursorClassName: string;
}> = [
  { handle: "nw", className: "-left-2 -top-2", cursorClassName: "cursor-nwse-resize" },
  { handle: "n", className: "left-1/2 -top-2 -translate-x-1/2", cursorClassName: "cursor-ns-resize" },
  { handle: "ne", className: "-right-2 -top-2", cursorClassName: "cursor-nesw-resize" },
  { handle: "e", className: "-right-2 top-1/2 -translate-y-1/2", cursorClassName: "cursor-ew-resize" },
  { handle: "se", className: "-right-2 -bottom-2", cursorClassName: "cursor-nwse-resize" },
  { handle: "s", className: "left-1/2 -bottom-2 -translate-x-1/2", cursorClassName: "cursor-ns-resize" },
  { handle: "sw", className: "-left-2 -bottom-2", cursorClassName: "cursor-nesw-resize" },
  { handle: "w", className: "-left-2 top-1/2 -translate-y-1/2", cursorClassName: "cursor-ew-resize" },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function AnnotationCanvas({
  imageUrl,
  pageIndex,
  regions,
  activeMode,
  onRegionAdded,
  onRegionDeleted,
  onRegionChange,
  regionsByType = [],
  className,
}: AnnotationCanvasProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const activePointerIdRef = useRef<number | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [resizingId, setResizingId] = useState<string | null>(null);
  const [imgDimensions, setImgDimensions] = useState({
    width: 0,
    height: 0,
    naturalWidth: 0,
    naturalHeight: 0,
  });

  const getRelativePos = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    if (!container || !rect) return { x: 0, y: 0 };

    const scaleX = rect.width > 0 && container.clientWidth > 0
      ? rect.width / container.clientWidth
      : 1;
    const scaleY = rect.height > 0 && container.clientHeight > 0
      ? rect.height / container.clientHeight
      : 1;

    return {
      x: (clientX - rect.left) / scaleX,
      y: (clientY - rect.top) / scaleY,
    };
  }, []);

  const updateImageMetrics = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;

    setImgDimensions({
      width: img.clientWidth,
      height: img.clientHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    });
  }, []);

  const hasImageBounds =
    imgDimensions.width > 0 &&
    imgDimensions.height > 0 &&
    imgDimensions.naturalWidth > 0 &&
    imgDimensions.naturalHeight > 0;

  const scaleRegionToDisplay = useCallback((region: Region) => {
    if (!hasImageBounds) return region;
    const scaleX = imgDimensions.width / imgDimensions.naturalWidth;
    const scaleY = imgDimensions.height / imgDimensions.naturalHeight;
    return {
      ...region,
      x: region.x * scaleX,
      y: region.y * scaleY,
      width: region.width * scaleX,
      height: region.height * scaleY,
    };
  }, [hasImageBounds, imgDimensions]);

  const scaleRegionFromDisplay = useCallback(
    (
      region: Region,
      displayRegion: { x: number; y: number; width: number; height: number }
    ) => {
      if (!hasImageBounds) return region;
      const scaleX = imgDimensions.naturalWidth / imgDimensions.width;
      const scaleY = imgDimensions.naturalHeight / imgDimensions.height;
      return {
        ...region,
        x: Math.round(displayRegion.x * scaleX),
        y: Math.round(displayRegion.y * scaleY),
        width: Math.round(displayRegion.width * scaleX),
        height: Math.round(displayRegion.height * scaleY),
      };
    },
    [hasImageBounds, imgDimensions]
  );

  const finalizeDrawing = useCallback(
    (endPos: { x: number; y: number }) => {
      if (!drawing || !activeMode) return;
      setDrawing(false);

      const x = Math.min(startPos.x, endPos.x);
      const y = Math.min(startPos.y, endPos.y);
      const width = Math.abs(endPos.x - startPos.x);
      const height = Math.abs(endPos.y - startPos.y);

      if (width < 10 || height < 10) return;

      const scaleX = imgDimensions.naturalWidth / imgDimensions.width;
      const scaleY = imgDimensions.naturalHeight / imgDimensions.height;

      const region: Region = {
        id: generateId(),
        x: Math.round(x * scaleX),
        y: Math.round(y * scaleY),
        width: Math.round(width * scaleX),
        height: Math.round(height * scaleY),
        role: activeMode,
        pageIndex,
        labelNumber: 1, // Will be overridden by parent
      };

      onRegionAdded(region);
      setSelectedId(region.id);
    },
    [drawing, activeMode, startPos, imgDimensions, pageIndex, onRegionAdded]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest(".region-box")) {
        return;
      }
      if (!activeMode) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
      const pos = getRelativePos(e.clientX, e.clientY);
      setStartPos(pos);
      setCurrentPos(pos);
      setDrawing(true);
      setSelectedId(null);
    },
    [getRelativePos, activeMode]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing || activePointerIdRef.current !== e.pointerId) return;
      setCurrentPos(getRelativePos(e.clientX, e.clientY));
    },
    [drawing, getRelativePos]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      const pos = getRelativePos(e.clientX, e.clientY);
      setCurrentPos(pos);
      finalizeDrawing(pos);
      activePointerIdRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    [finalizeDrawing, getRelativePos]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (activePointerIdRef.current !== e.pointerId) return;
      setDrawing(false);
      activePointerIdRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    },
    []
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onRegionDeleted(selectedId);
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, onRegionDeleted]);

  useEffect(() => {
    if (selectedId && !regions.some((region) => region.id === selectedId)) {
      setSelectedId(null);
    }
  }, [regions, selectedId]);

  const getResizedDisplayRect = useCallback(
    (
      startRect: { x: number; y: number; width: number; height: number },
      handle: ResizeHandle,
      dx: number,
      dy: number
    ) => {
      let left = startRect.x;
      let top = startRect.y;
      let right = startRect.x + startRect.width;
      let bottom = startRect.y + startRect.height;

      if (handle.includes("w")) {
        left = clamp(startRect.x + dx, 0, right - MIN_REGION_SIZE);
      }
      if (handle.includes("e")) {
        right = clamp(right + dx, left + MIN_REGION_SIZE, imgDimensions.width);
      }
      if (handle.includes("n")) {
        top = clamp(startRect.y + dy, 0, bottom - MIN_REGION_SIZE);
      }
      if (handle.includes("s")) {
        bottom = clamp(bottom + dy, top + MIN_REGION_SIZE, imgDimensions.height);
      }

      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    },
    [imgDimensions.height, imgDimensions.width]
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, region: Region, handle: ResizeHandle) => {
      if (!onRegionChange || !hasImageBounds) return;

      e.stopPropagation();
      e.preventDefault();
      const displayRegion = scaleRegionToDisplay(region);
      resizeStateRef.current = {
        pointerId: e.pointerId,
        regionId: region.id,
        handle,
        startPointer: getRelativePos(e.clientX, e.clientY),
        startRect: {
          x: displayRegion.x,
          y: displayRegion.y,
          width: displayRegion.width,
          height: displayRegion.height,
        },
      };
      setSelectedId(region.id);
      setResizingId(region.id);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [getRelativePos, hasImageBounds, onRegionChange, scaleRegionToDisplay]
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState || resizeState.pointerId !== e.pointerId || !onRegionChange) return;

      e.preventDefault();
      const region = regions.find((item) => item.id === resizeState.regionId);
      if (!region) return;

      const pointer = getRelativePos(e.clientX, e.clientY);
      const nextDisplayRegion = getResizedDisplayRect(
        resizeState.startRect,
        resizeState.handle,
        pointer.x - resizeState.startPointer.x,
        pointer.y - resizeState.startPointer.y
      );

      onRegionChange(scaleRegionFromDisplay(region, nextDisplayRegion));
    },
    [getRelativePos, getResizedDisplayRect, onRegionChange, regions, scaleRegionFromDisplay]
  );

  const finishResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== e.pointerId) return;

    resizeStateRef.current = null;
    setResizingId(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  useEffect(() => {
    updateImageMetrics();

    const img = imgRef.current;
    if (!img || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      updateImageMetrics();
    });

    observer.observe(img);
    return () => observer.disconnect();
  }, [imageUrl, updateImageMetrics]);

  return (
    <div className={cn("relative inline-block w-full max-w-[800px] mx-auto bg-white mb-0", className)}>
      <div
        ref={containerRef}
        className={cn("relative select-none", activeMode ? "cursor-crosshair" : "cursor-default")}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt={`Page ${pageIndex + 1}`}
          className="w-full h-auto block"
          onLoad={updateImageMetrics}
          draggable={false}
        />

        {drawing && (
          <div
            className={cn(
              "absolute border-2 border-dashed pointer-events-none",
              activeMode === "question" ? "border-primary bg-primary/20" : "border-success bg-success/20"
            )}
            style={{
              left: Math.min(startPos.x, currentPos.x),
              top: Math.min(startPos.y, currentPos.y),
              width: Math.abs(currentPos.x - startPos.x),
              height: Math.abs(currentPos.y - startPos.y),
            }}
          />
        )}

        {regions.map((region) => {
          const display = scaleRegionToDisplay(region);
          const isSelected = region.id === selectedId;

          // Compute max dropdown options
          const typeRegions = regionsByType.filter((r) => r.role === region.role);
          const maxNum = Math.max(20, typeRegions.length + 5);

          return (
            <div
              key={region.id}
              className={cn(
                "absolute border-2 transition-shadow region-box group",
                region.role === "question"
                  ? "border-primary bg-primary/10"
                  : "border-success bg-success/10",
                isSelected && "ring-2 ring-primary ring-offset-1 shadow-lg",
                resizingId === region.id && "transition-none"
              )}
              style={{
                left: display.x,
                top: display.y,
                width: display.width,
                height: display.height,
                cursor: "pointer",
                pointerEvents: "auto",
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setSelectedId(region.id);
              }}
            >
              <div className={cn(
                "absolute -top-7 left-0 text-[11px] font-bold px-1.5 py-0.5 rounded shadow-sm border opacity-100 group-hover:scale-110 origin-bottom-left transition-transform z-10 flex gap-1 items-center text-white min-w-max",
                region.role === "question" ? "bg-primary border-primary" : "bg-success border-success"
              )}>
                <span className="opacity-90">{region.role === "question" ? "Q" : "A"}</span>
                <SelectPrimitive.Root
                  value={String(region.labelNumber)}
                  onValueChange={(val) => {
                    if (onRegionChange) {
                      onRegionChange({ ...region, labelNumber: parseInt(val, 10) });
                    }
                  }}
                >
                  <SelectPrimitive.Trigger
                    className="bg-transparent border-none text-white outline-none cursor-pointer font-bold text-[11px] flex items-center gap-0.5 hover:opacity-80 transition-opacity focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <SelectPrimitive.Value />
                    <ChevronDownIcon className="h-2.5 w-2.5 opacity-70 shrink-0" />
                  </SelectPrimitive.Trigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content
                      className="bg-popover text-popover-foreground z-[9999] rounded-md border shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95"
                      position="popper"
                      sideOffset={6}
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1 cursor-default text-muted-foreground">
                        <ChevronUpIcon className="h-3 w-3" />
                      </SelectPrimitive.ScrollUpButton>
                      <SelectPrimitive.Viewport className="p-1 max-h-48 overflow-y-auto">
                        {Array.from({ length: maxNum }, (_, i) => i + 1).map((num) => (
                          <SelectPrimitive.Item
                            key={num}
                            value={String(num)}
                            className="relative flex items-center px-3 py-1.5 text-sm rounded-sm cursor-default select-none outline-none focus:bg-accent focus:text-accent-foreground data-[state=checked]:font-semibold"
                          >
                            <SelectPrimitive.ItemText>{num}</SelectPrimitive.ItemText>
                          </SelectPrimitive.Item>
                        ))}
                      </SelectPrimitive.Viewport>
                      <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1 cursor-default text-muted-foreground">
                        <ChevronDownIcon className="h-3 w-3" />
                      </SelectPrimitive.ScrollDownButton>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </SelectPrimitive.Root>
                {isSelected && (
                  <span className="bg-black/20 hover:bg-black/40 text-white rounded-full w-4 h-4 inline-flex items-center justify-center cursor-pointer ml-1 text-xs shrink-0" onClick={(e) => {
                    e.stopPropagation();
                    onRegionDeleted(region.id);
                    setSelectedId(null);
                  }}>
                    &times;
                  </span>
                )}
              </div>

              {isSelected && onRegionChange && hasImageBounds && RESIZE_HANDLES.map((resizeHandle) => (
                <div
                  key={resizeHandle.handle}
                  className={cn(
                    "absolute h-4 w-4 rounded-full border-2 border-white bg-foreground shadow-sm touch-none",
                    resizeHandle.className,
                    resizeHandle.cursorClassName
                  )}
                  onPointerDown={(e) => handleResizePointerDown(e, region, resizeHandle.handle)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={finishResize}
                  onPointerCancel={finishResize}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
