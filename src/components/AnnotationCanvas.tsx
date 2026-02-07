import { useState, useRef, useCallback, useEffect } from "react";
import { cn, generateId } from "@/lib/utils";

export interface Region {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role: "question" | "answer" | null;
}

interface AnnotationCanvasProps {
  imageUrl: string;
  onRegionsChange: (regions: Region[]) => void;
  className?: string;
}

export function AnnotationCanvas({
  imageUrl,
  onRegionsChange,
  className,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [regions, setRegions] = useState<Region[]>([]);
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

  const updateRegions = useCallback(
    (newRegions: Region[]) => {
      setRegions(newRegions);
      onRegionsChange(newRegions);
    },
    [onRegionsChange]
  );

  const getRelativePos = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // If clicking on the canvas background (not a region), deselect and start drawing
      const pos = getRelativePos(e);
      setStartPos(pos);
      setCurrentPos(pos);
      setDrawing(true);
      setSelectedId(null);
    },
    [getRelativePos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawing) return;
      setCurrentPos(getRelativePos(e));
    },
    [drawing, getRelativePos]
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
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
      role: null,
    };

    updateRegions([...regions, region]);
    setSelectedId(region.id);
  }, [drawing, startPos, currentPos, regions, imgDimensions, updateRegions]);

  const setRegionRole = useCallback(
    (id: string, role: "question" | "answer") => {
      updateRegions(
        regions.map((r) => (r.id === id ? { ...r, role } : r))
      );
    },
    [regions, updateRegions]
  );

  const removeRegion = useCallback(
    (id: string) => {
      updateRegions(regions.filter((r) => r.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [regions, updateRegions, selectedId]
  );

  // Keyboard shortcuts: Q, A, Delete/Backspace
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "q" || e.key === "Q") {
        e.preventDefault();
        setRegionRole(selectedId, "question");
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        setRegionRole(selectedId, "answer");
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeRegion(selectedId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, setRegionRole, removeRegion]);

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
    <div className={cn("relative inline-block", className)}>
      {selectedId && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Region selected &mdash;</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">Q</kbd>
          <span>question</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">A</kbd>
          <span>answer</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">Del</kbd>
          <span>remove</span>
        </div>
      )}
      <div
        ref={containerRef}
        className="relative cursor-crosshair select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDrawing(false)}
      >
        <img
          src={imageUrl}
          alt="Source for annotation"
          className="max-w-full"
          onLoad={handleImageLoad}
          draggable={false}
        />

        {/* Drawing preview */}
        {drawing && (
          <div
            className="absolute border-2 border-dashed border-primary bg-primary/10 pointer-events-none"
            style={{
              left: Math.min(startPos.x, currentPos.x),
              top: Math.min(startPos.y, currentPos.y),
              width: Math.abs(currentPos.x - startPos.x),
              height: Math.abs(currentPos.y - startPos.y),
            }}
          />
        )}

        {/* Existing regions */}
        {regions.map((region) => {
          const display = scaleRegionToDisplay(region);
          const isSelected = region.id === selectedId;
          return (
            <div
              key={region.id}
              className={cn(
                "absolute border-2 transition-shadow",
                region.role === "question"
                  ? "border-primary bg-primary/10"
                  : region.role === "answer"
                  ? "border-success bg-success/10"
                  : "border-warning bg-warning/10",
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
              {/* Toolbar */}
              <div
                className="absolute -top-8 left-0 flex gap-1 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setRegionRole(region.id, "question")}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded",
                    region.role === "question"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-foreground"
                  )}
                >
                  Q
                </button>
                <button
                  onClick={() => setRegionRole(region.id, "answer")}
                  className={cn(
                    "px-2 py-0.5 text-xs rounded",
                    region.role === "answer"
                      ? "bg-success text-white"
                      : "bg-card border border-border text-foreground"
                  )}
                >
                  A
                </button>
                <button
                  onClick={() => removeRegion(region.id)}
                  className="px-2 py-0.5 text-xs rounded bg-destructive text-destructive-foreground"
                >
                  x
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
