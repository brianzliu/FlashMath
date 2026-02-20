import { useState, useRef, useCallback, useEffect } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [imgDimensions, setImgDimensions] = useState({
    width: 0,
    height: 0,
    naturalWidth: 0,
    naturalHeight: 0,
  });

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest(".region-box")) {
        return;
      }
      if (!activeMode) return;

      const pos = getRelativePos(e);
      setStartPos(pos);
      setCurrentPos(pos);
      setDrawing(true);
      setSelectedId(null);
    },
    [getRelativePos, activeMode]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing) return;
      setCurrentPos(getRelativePos(e));
    },
    [drawing, getRelativePos]
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing || !activeMode) return;
    setDrawing(false);

    const x = Math.min(startPos.x, currentPos.x);
    const y = Math.min(startPos.y, currentPos.y);
    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

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
  }, [drawing, startPos, currentPos, imgDimensions, activeMode, pageIndex, onRegionAdded]);

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

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgDimensions({
      width: img.clientWidth,
      height: img.clientHeight,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    });
  };

  const scaleRegionToDisplay = (region: Region) => {
    if (imgDimensions.width === 0) return region;
    const scaleX = imgDimensions.width / imgDimensions.naturalWidth;
    const scaleY = imgDimensions.height / imgDimensions.naturalHeight;
    return {
      ...region,
      x: region.x * scaleX,
      y: region.y * scaleY,
      width: region.width * scaleX,
      height: region.height * scaleY,
    };
  };

  return (
    <div className={cn("relative inline-block w-full max-w-[800px] mx-auto bg-white mb-0", className)}>
      <div
        ref={containerRef}
        className={cn("relative select-none", activeMode ? "cursor-crosshair" : "cursor-default")}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDrawing(false)}
      >
        <img
          src={imageUrl}
          alt={`Page ${pageIndex + 1}`}
          className="w-full h-auto block"
          onLoad={handleImageLoad}
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

          // Compute max dropdown options and disabled state
          const typeRegions = regionsByType.filter((r) => r.role === region.role);
          const maxNum = Math.max(20, typeRegions.length + 5);
          const usedNumbers = new Set(
            typeRegions.filter((r) => r.id !== region.id).map((r) => r.labelNumber)
          );

          return (
            <div
              key={region.id}
              className={cn(
                "absolute border-2 transition-shadow region-box group",
                region.role === "question"
                  ? "border-primary bg-primary/10"
                  : "border-success bg-success/10",
                isSelected && "ring-2 ring-primary ring-offset-1 shadow-lg"
              )}
              style={{
                left: display.x,
                top: display.y,
                width: display.width,
                height: display.height,
                cursor: "pointer",
                pointerEvents: "auto",
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedId(region.id);
              }}
            >
              <div className={cn(
                "absolute -top-7 left-0 text-[11px] font-bold px-1.5 py-0.5 rounded shadow-sm border opacity-100 group-hover:scale-110 origin-bottom-left transition-transform z-10 flex gap-1 items-center text-white min-w-max",
                region.role === "question" ? "bg-primary border-primary" : "bg-success border-success"
              )}>
                <span className="opacity-90">{region.role === "question" ? "Q" : "A"}</span>
                <select
                  value={region.labelNumber}
                  onChange={(e) => {
                    if (onRegionChange) {
                      onRegionChange({ ...region, labelNumber: parseInt(e.target.value, 10) });
                    }
                  }}
                  className="bg-transparent border-none text-white outline-none cursor-pointer appearance-none p-0 pr-1 text-center font-bold"
                  onClick={(e) => e.stopPropagation()}
                >
                  {Array.from({ length: maxNum }, (_, i) => i + 1).map((num) => (
                    <option
                      key={num}
                      value={num}
                      disabled={usedNumbers.has(num)}
                      className="text-foreground bg-popover font-medium"
                    >
                      {num}
                    </option>
                  ))}
                </select>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
