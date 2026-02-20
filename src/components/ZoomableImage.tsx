import { useCallback, useEffect, useRef, useState } from "react";
import { ImageDisplay } from "./ImageDisplay";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ZoomableImageProps {
  src: string;
  alt?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.3;

export function ZoomableImage({ src, alt = "Flashcard content" }: ZoomableImageProps) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const isZoomed = scale > 1;

  const clampTranslate = useCallback(
    (tx: number, ty: number, s: number) => {
      if (s <= 1) return { x: 0, y: 0 };
      const container = containerRef.current;
      if (!container) return { x: tx, y: ty };
      const rect = container.getBoundingClientRect();
      const maxX = (rect.width * (s - 1)) / 2;
      const maxY = (rect.height * (s - 1)) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, tx)),
        y: Math.max(-maxY, Math.min(maxY, ty)),
      };
    },
    []
  );

  const handleZoomIn = () => {
    setScale((s) => {
      const next = Math.min(MAX_SCALE, s + ZOOM_STEP);
      setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  };

  const handleZoomOut = () => {
    setScale((s) => {
      const next = Math.max(MIN_SCALE, s - ZOOM_STEP);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      else setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setScale((s) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s + delta));
        if (next <= 1) setTranslate({ x: 0, y: 0 });
        else setTranslate((t) => clampTranslate(t.x, t.y, next));
        return next;
      });
    },
    [clampTranslate]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isZoomed) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateStart.current = { ...translate };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [isZoomed, translate]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setTranslate(
        clampTranslate(
          translateStart.current.x + dx,
          translateStart.current.y + dy,
          scale
        )
      );
    },
    [isDragging, scale, clampTranslate]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [src]);

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      <div
        ref={containerRef}
        className={cn(
          "relative overflow-hidden rounded-lg w-full flex items-center justify-center",
          "max-h-[70vh]",
          isZoomed ? "cursor-grab" : "cursor-default",
          isDragging && "cursor-grabbing"
        )}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <ImageDisplay
          src={src}
          alt={alt}
          className="max-w-full max-h-[70vh] rounded-lg select-none pointer-events-none"
          style={{
            transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
            transition: isDragging ? "none" : "transform 0.15s ease-out",
          }}
        />
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleZoomOut}
          disabled={scale <= MIN_SCALE}
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleZoomIn}
          disabled={scale >= MAX_SCALE}
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        {isZoomed && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 ml-1"
            onClick={handleReset}
            title="Reset zoom"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            <span className="text-xs">Reset</span>
          </Button>
        )}
      </div>
    </div>
  );
}
