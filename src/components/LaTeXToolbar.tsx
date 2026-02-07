import { useState, useCallback, useMemo } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";

interface LaTeXToolbarProps {
  /** Insert LaTeX snippet at cursor in the target textarea */
  onInsert: (snippet: string, wrapInDollars?: boolean) => void;
  className?: string;
}

interface SymbolItem {
  label: string; // Display label (rendered as KaTeX)
  snippet: string; // What gets inserted
  title: string; // Tooltip
}

interface SymbolGroup {
  name: string;
  symbols: SymbolItem[];
}

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    name: "Common",
    symbols: [
      { label: "\\frac{a}{b}", snippet: "\\frac{}{}", title: "Fraction" },
      { label: "x^{n}", snippet: "^{}", title: "Superscript" },
      { label: "x_{n}", snippet: "_{}", title: "Subscript" },
      { label: "\\sqrt{x}", snippet: "\\sqrt{}", title: "Square root" },
      { label: "\\sqrt[n]{x}", snippet: "\\sqrt[]{}", title: "Nth root" },
      { label: "\\pm", snippet: "\\pm ", title: "Plus/minus" },
      { label: "\\cdot", snippet: "\\cdot ", title: "Dot multiply" },
      { label: "\\times", snippet: "\\times ", title: "Times" },
      { label: "\\div", snippet: "\\div ", title: "Division" },
      { label: "\\neq", snippet: "\\neq ", title: "Not equal" },
      { label: "\\leq", snippet: "\\leq ", title: "Less than or equal" },
      { label: "\\geq", snippet: "\\geq ", title: "Greater than or equal" },
      { label: "\\approx", snippet: "\\approx ", title: "Approximately" },
      { label: "\\infty", snippet: "\\infty ", title: "Infinity" },
      { label: "\\ldots", snippet: "\\ldots ", title: "Dots" },
    ],
  },
  {
    name: "Calculus",
    symbols: [
      { label: "\\int", snippet: "\\int ", title: "Integral" },
      { label: "\\int_{a}^{b}", snippet: "\\int_{}^{} ", title: "Definite integral" },
      { label: "\\frac{d}{dx}", snippet: "\\frac{d}{dx} ", title: "Derivative" },
      { label: "\\frac{\\partial}{\\partial x}", snippet: "\\frac{\\partial}{\\partial x} ", title: "Partial derivative" },
      { label: "\\sum", snippet: "\\sum ", title: "Summation" },
      { label: "\\sum_{i=0}^{n}", snippet: "\\sum_{i=0}^{n} ", title: "Summation with bounds" },
      { label: "\\prod", snippet: "\\prod ", title: "Product" },
      { label: "\\lim_{x \\to a}", snippet: "\\lim_{x \\to } ", title: "Limit" },
      { label: "\\to", snippet: "\\to ", title: "Arrow" },
      { label: "\\nabla", snippet: "\\nabla ", title: "Nabla/gradient" },
    ],
  },
  {
    name: "Greek",
    symbols: [
      { label: "\\alpha", snippet: "\\alpha ", title: "Alpha" },
      { label: "\\beta", snippet: "\\beta ", title: "Beta" },
      { label: "\\gamma", snippet: "\\gamma ", title: "Gamma" },
      { label: "\\delta", snippet: "\\delta ", title: "Delta" },
      { label: "\\epsilon", snippet: "\\epsilon ", title: "Epsilon" },
      { label: "\\theta", snippet: "\\theta ", title: "Theta" },
      { label: "\\lambda", snippet: "\\lambda ", title: "Lambda" },
      { label: "\\mu", snippet: "\\mu ", title: "Mu" },
      { label: "\\pi", snippet: "\\pi ", title: "Pi" },
      { label: "\\sigma", snippet: "\\sigma ", title: "Sigma" },
      { label: "\\phi", snippet: "\\phi ", title: "Phi" },
      { label: "\\omega", snippet: "\\omega ", title: "Omega" },
      { label: "\\Delta", snippet: "\\Delta ", title: "Capital Delta" },
      { label: "\\Sigma", snippet: "\\Sigma ", title: "Capital Sigma" },
      { label: "\\Omega", snippet: "\\Omega ", title: "Capital Omega" },
    ],
  },
  {
    name: "Brackets",
    symbols: [
      { label: "\\left( \\right)", snippet: "\\left( \\right)", title: "Parentheses" },
      { label: "\\left[ \\right]", snippet: "\\left[ \\right]", title: "Brackets" },
      { label: "\\left\\{ \\right\\}", snippet: "\\left\\{ \\right\\}", title: "Braces" },
      { label: "\\left| \\right|", snippet: "\\left| \\right|", title: "Absolute value" },
      { label: "\\binom{n}{k}", snippet: "\\binom{}{}", title: "Binomial" },
      { label: "\\begin{pmatrix} \\end{pmatrix}", snippet: "\\begin{pmatrix}  \\\\  \\end{pmatrix}", title: "Matrix" },
    ],
  },
  {
    name: "Trig & Log",
    symbols: [
      { label: "\\sin", snippet: "\\sin ", title: "Sine" },
      { label: "\\cos", snippet: "\\cos ", title: "Cosine" },
      { label: "\\tan", snippet: "\\tan ", title: "Tangent" },
      { label: "\\arcsin", snippet: "\\arcsin ", title: "Arcsine" },
      { label: "\\arccos", snippet: "\\arccos ", title: "Arccosine" },
      { label: "\\arctan", snippet: "\\arctan ", title: "Arctangent" },
      { label: "\\ln", snippet: "\\ln ", title: "Natural log" },
      { label: "\\log", snippet: "\\log ", title: "Logarithm" },
      { label: "e^{x}", snippet: "e^{}", title: "Exponential" },
    ],
  },
  {
    name: "Sets & Logic",
    symbols: [
      { label: "\\in", snippet: "\\in ", title: "Element of" },
      { label: "\\notin", snippet: "\\notin ", title: "Not element of" },
      { label: "\\subset", snippet: "\\subset ", title: "Subset" },
      { label: "\\cup", snippet: "\\cup ", title: "Union" },
      { label: "\\cap", snippet: "\\cap ", title: "Intersection" },
      { label: "\\emptyset", snippet: "\\emptyset ", title: "Empty set" },
      { label: "\\forall", snippet: "\\forall ", title: "For all" },
      { label: "\\exists", snippet: "\\exists ", title: "There exists" },
      { label: "\\mathbb{R}", snippet: "\\mathbb{R}", title: "Real numbers" },
      { label: "\\Rightarrow", snippet: "\\Rightarrow ", title: "Implies" },
      { label: "\\Leftrightarrow", snippet: "\\Leftrightarrow ", title: "If and only if" },
    ],
  },
];

function MiniKaTeX({ latex }: { latex: string }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return latex;
    }
  }, [latex]);

  return (
    <span
      className="inline-block"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function LaTeXToolbar({ onInsert, className }: LaTeXToolbarProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);

  const handleInsert = useCallback(
    (snippet: string) => {
      onInsert(snippet, false);
    },
    [onInsert]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, snippet: string) => {
      e.dataTransfer.setData("text/plain", snippet);
      e.dataTransfer.effectAllowed = "copy";
    },
    []
  );

  const group = SYMBOL_GROUPS[activeGroup];

  return (
    <div className={cn("rounded-lg border border-border bg-muted/20 overflow-hidden", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none">fx</span>
          <span>LaTeX Symbols</span>
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border">
          {/* Group tabs */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-border">
            {SYMBOL_GROUPS.map((g, idx) => (
              <button
                key={g.name}
                type="button"
                onClick={() => setActiveGroup(idx)}
                className={cn(
                  "px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors shrink-0",
                  activeGroup === idx
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {g.name}
              </button>
            ))}
          </div>

          {/* Symbols grid */}
          <div className="p-2 grid grid-cols-5 gap-1 max-h-[160px] overflow-y-auto">
            {group.symbols.map((sym) => (
              <button
                key={sym.snippet}
                type="button"
                draggable
                title={sym.title}
                onClick={() => handleInsert(sym.snippet)}
                onDragStart={(e) => handleDragStart(e, sym.snippet)}
                className={cn(
                  "flex items-center justify-center rounded-md px-1.5 py-2 text-sm",
                  "bg-background border border-transparent",
                  "hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm",
                  "active:scale-95 transition-all cursor-grab active:cursor-grabbing",
                  "select-none"
                )}
              >
                <MiniKaTeX latex={sym.label} />
              </button>
            ))}
          </div>

          {/* Wrap hint */}
          <div className="px-3 py-1.5 border-t border-border bg-muted/30">
            <p className="text-[10px] text-muted-foreground">
              Use <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">$...$</code> for inline math,{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">$$...$$</code> for display math.
              Click or drag symbols into the editor.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
