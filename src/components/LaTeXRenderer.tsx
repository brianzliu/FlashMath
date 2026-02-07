import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface LaTeXRendererProps {
  content: string;
  className?: string;
}

/**
 * Segment of parsed content — either plain text or a LaTeX math expression.
 */
interface Segment {
  type: "text" | "math";
  value: string;
  display: boolean; // true for $$ (display mode), false for $ (inline)
}

/**
 * Parse a string into segments of plain text and LaTeX math.
 * Supports:
 *   $$...$$ → display math (block)
 *   $...$   → inline math
 *
 * Escaped dollars (\$) are treated as literal dollar signs.
 */
function parseContent(content: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < content.length) {
    // Check for escaped dollar
    if (content[i] === "\\" && content[i + 1] === "$") {
      // Append literal $ to the last text segment (or create one)
      if (segments.length > 0 && segments[segments.length - 1].type === "text") {
        segments[segments.length - 1].value += "$";
      } else {
        segments.push({ type: "text", value: "$", display: false });
      }
      i += 2;
      continue;
    }

    // Check for $$ (display math)
    if (content[i] === "$" && content[i + 1] === "$") {
      const start = i + 2;
      const end = content.indexOf("$$", start);
      if (end !== -1) {
        const math = content.slice(start, end);
        if (math.trim()) {
          segments.push({ type: "math", value: math, display: true });
        }
        i = end + 2;
        continue;
      }
    }

    // Check for $ (inline math)
    if (content[i] === "$") {
      const start = i + 1;
      // Find the closing $ (not $$)
      let end = -1;
      for (let j = start; j < content.length; j++) {
        if (content[j] === "\\" && content[j + 1] === "$") {
          j++; // skip escaped dollar
          continue;
        }
        if (content[j] === "$") {
          end = j;
          break;
        }
      }
      if (end !== -1 && end > start) {
        const math = content.slice(start, end);
        if (math.trim()) {
          segments.push({ type: "math", value: math, display: false });
        }
        i = end + 1;
        continue;
      }
    }

    // Regular text character — accumulate into last text segment
    if (segments.length > 0 && segments[segments.length - 1].type === "text") {
      segments[segments.length - 1].value += content[i];
    } else {
      segments.push({ type: "text", value: content[i], display: false });
    }
    i++;
  }

  return segments;
}

/**
 * Render a single LaTeX math expression to HTML.
 */
function renderMath(latex: string, display: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      trust: true,
    });
  } catch {
    return `<span class="text-destructive text-xs">[LaTeX error]</span>`;
  }
}

/**
 * Escape HTML special characters in plain text.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * LaTeXRenderer — renders mixed text/math content.
 *
 * Math expressions must be wrapped in dollar signs:
 *   - $...$   for inline math
 *   - $$...$$ for display (block) math
 *
 * Everything outside dollar signs is rendered as plain text.
 *
 * If the entire content has NO dollar delimiters, it's rendered as plain text.
 * This prevents the old behavior of rendering everything as math.
 */
export function LaTeXRenderer({ content, className }: LaTeXRendererProps) {
  const html = useMemo(() => {
    if (!content) return "";

    const segments = parseContent(content);

    // Build HTML from segments
    return segments
      .map((seg) => {
        if (seg.type === "math") {
          return renderMath(seg.value, seg.display);
        }
        // Plain text: preserve whitespace/newlines
        return escapeHtml(seg.value).replace(/\n/g, "<br/>");
      })
      .join("");
  }, [content]);

  return (
    <div
      className={className}
      style={{ lineHeight: 1.7, fontSize: "inherit" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
