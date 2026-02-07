import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface LaTeXRendererProps {
  content: string;
  display?: boolean;
  className?: string;
}

export function LaTeXRenderer({
  content,
  display = true,
  className,
}: LaTeXRendererProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(content, {
        displayMode: display,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `<span class="text-destructive">Failed to render LaTeX</span>`;
    }
  }, [content, display]);

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
