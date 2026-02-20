import { useState, useEffect } from "react";
import * as commands from "@/lib/commands";

interface ImageDisplayProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function ImageDisplay({ src, alt = "Image", className, style }: ImageDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const isDataUrl = src.startsWith("data:");
  const isFilePath = !isDataUrl && (src.startsWith("/") || src.match(/^[A-Za-z]:\\/));

  useEffect(() => {
    if (isDataUrl) {
      setDataUrl(src);
      return;
    }

    if (!isFilePath) {
      setDataUrl(src);
      return;
    }

    let mounted = true;
    commands
      .getImageAsDataUrl(src)
      .then((url) => {
        if (mounted) setDataUrl(url);
      })
      .catch(() => {
        if (mounted) setError(true);
      });

    return () => {
      mounted = false;
    };
  }, [src, isDataUrl, isFilePath]);

  if (error) {
    return (
      <div className={`${className} bg-muted/50 rounded-lg flex items-center justify-center p-4`}>
        <span className="text-muted-foreground text-sm">Failed to load image</span>
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div className={`${className} bg-muted/50 rounded-lg flex items-center justify-center p-4`}>
        <span className="text-muted-foreground text-sm">Loading...</span>
      </div>
    );
  }

  return <img src={dataUrl} alt={alt} className={className} style={style} />;
}

export function isImagePath(content: string): boolean {
  if (content.startsWith("data:")) return true;
  if (content.startsWith("/") || content.match(/^[A-Za-z]:\\/)) return true;
  return false;
}
