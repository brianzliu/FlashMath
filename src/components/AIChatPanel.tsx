import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { sendChat, setOnProposedCards, type ChatMessage } from "@/lib/ai-chat";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import type { CreateFlashcardInput } from "@/lib/types";
import { X, SendHorizonal, Sparkles, Bot, Loader2, Trash2, Check, FileStack, Pencil } from "lucide-react";
import katex from "katex";

/* ── tiny markdown renderer with KaTeX ──────────────────────── */

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    key++;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={key} className="ml-4 list-disc text-[13px] leading-relaxed">
          {inlineFormat(line.slice(2))}
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(
        <li key={key} className="ml-4 list-decimal text-[13px] leading-relaxed">
          {inlineFormat(line.replace(/^\d+\.\s/, ""))}
        </li>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key} className="h-2" />);
    } else {
      elements.push(
        <p key={key} className="text-[13px] leading-relaxed">
          {inlineFormat(line)}
        </p>
      );
    }
  }
  return elements;
}

function InlineLatex({ latex, display }: { latex: string; display: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        trust: true,
      });
    } catch {
      return `<span class="text-destructive text-xs">[LaTeX error]</span>`;
    }
  }, [latex, display]);

  return (
    <span
      className={cn(display ? "block my-1" : "inline")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function inlineFormat(text: string): React.ReactNode[] {
  // Handle $$display latex$$, $inline latex$, **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  const regex = /(\$\$(.+?)\$\$|\$(.+?)\$|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    key++;
    if (match[2]) {
      // $$display latex$$
      parts.push(<InlineLatex key={key} latex={match[2]} display={true} />);
    } else if (match[3]) {
      // $inline latex$
      parts.push(<InlineLatex key={key} latex={match[3]} display={false} />);
    } else if (match[4]) {
      parts.push(<strong key={key} className="font-bold">{match[4]}</strong>);
    } else if (match[5]) {
      parts.push(<em key={key} className="italic">{match[5]}</em>);
    } else if (match[6]) {
      parts.push(
        <code key={key} className="rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-mono text-primary">
          {match[6]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

/* ── tool-name display labels ────────────────────────────────── */

const TOOL_LABELS: Record<string, string> = {
  get_all_folders: "Looking up your decks",
  get_flashcards: "Reading flashcards",
  get_due_flashcards: "Checking due cards",
  get_study_stats: "Pulling study stats",
  get_flashcard_detail: "Inspecting card details",
  get_review_history: "Reviewing your history",
  create_flashcard: "Creating a flashcard",
  propose_flashcards: "Preparing flashcards for review",
  set_editor_question: "Writing question",
  set_editor_answer: "Writing answer",
  set_editor_timer: "Setting timer",
  clear_editor_field: "Clearing field",
  get_editor_content: "Reading editor",
};

/* ── suggestion chips ────────────────────────────────────────── */

const SUGGESTIONS = [
  { label: "How am I doing?", emoji: "\u{1F4CA}" },
  { label: "What's due today?", emoji: "\u{23F0}" },
  { label: "My hardest cards", emoji: "\u{1F525}" },
  { label: "Study tips", emoji: "\u{1F4A1}" },
];

const EDITOR_SUGGESTIONS = [
  { label: "Create 5 cards on calculus", emoji: "\u{2728}" },
  { label: "Generate cards on this topic", emoji: "\u{1F4DD}" },
  { label: "Help me write this card", emoji: "\u{1F91D}" },
  { label: "What's due today?", emoji: "\u{23F0}" },
];

/* ── component ───────────────────────────────────────────────── */

interface AIChatPanelProps {
  open: boolean;
  onClose: () => void;
}

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AIChatPanel({ open, onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Editor context & proposed cards
  const editorContext = useAppStore((s) => s.aiEditorContext);
  const pendingAiCards = useAppStore((s) => s.pendingAiCards);
  const setPendingAiCards = useAppStore((s) => s.setPendingAiCards);
  const [savingCards, setSavingCards] = useState(false);

  // Register proposed card callback
  useEffect(() => {
    setOnProposedCards((cards) => {
      setPendingAiCards(cards);
    });
    return () => setOnProposedCards(null);
  }, [setPendingAiCards]);

  const handleConfirmCards = useCallback(async () => {
    if (pendingAiCards.length === 0) return;
    setSavingCards(true);
    try {
      let created = 0;
      for (const card of pendingAiCards) {
        const input: CreateFlashcardInput = {
          folder_id: card.folderId,
          question_type: "latex",
          question_content: card.question,
          answer_type: "latex",
          answer_content: card.answer,
        };
        await commands.createFlashcard(input);
        created++;
      }
      setPendingAiCards([]);
      // Add a confirmation message
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Created **${created} flashcard${created !== 1 ? "s" : ""}** successfully! They're ready for review.`,
        },
      ]);
    } catch (err) {
      console.error("Failed to save cards:", err);
    } finally {
      setSavingCards(false);
    }
  }, [pendingAiCards, setPendingAiCards]);

  const handleDismissCards = useCallback(() => {
    setPendingAiCards([]);
  }, [setPendingAiCards]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, pendingAiCards, scrollToBottom]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;

      const userMsg: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
      };
      setMessages((prev) => [...prev, userMsg]);

      const newHistory: ChatMessage[] = [
        ...chatHistory,
        { role: "user", content: text.trim() },
      ];
      setChatHistory(newHistory);
      setInput("");
      setLoading(true);
      setToolStatus(null);

      try {
        const response = await sendChat(newHistory, (toolName) => {
          setToolStatus(TOOL_LABELS[toolName] || toolName);
        });

        const assistantMsg: DisplayMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.content || "",
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setChatHistory((prev) => [
          ...prev,
          { role: "assistant", content: response.content || "" },
        ]);
      } catch (err) {
        const errMsg: DisplayMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}.\n\nMake sure your LLM is configured in **Settings**.`,
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
        setToolStatus(null);
      }
    },
    [chatHistory, loading]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setChatHistory([]);
  };

  if (!open) return null;

  return (
    <aside
      className={cn(
        "flex h-screen w-[380px] shrink-0 flex-col",
        "border-l border-border/60 bg-card"
      )}
    >
      {/* ── Header Actions ─────────────────────────────────────── */}
      <div className="absolute top-0 right-0 z-10 flex items-center justify-end gap-1 p-3 pointer-events-none w-full">
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="pointer-events-auto rounded-lg p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Clear chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={onClose}
          className="pointer-events-auto rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Messages ───────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth">
        {messages.length === 0 && !loading ? (
          <EmptyState onSuggestion={send} editorContext={editorContext} />
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isLatest={i === messages.length - 1}
            />
          ))
        )}

        {loading && <ThinkingIndicator toolStatus={toolStatus} />}

        {/* ── Proposed cards for confirmation ── */}
        {pendingAiCards.length > 0 && (
          <ProposedCardsPreview
            cards={pendingAiCards}
            onConfirm={handleConfirmCards}
            onDismiss={handleDismissCards}
            saving={savingCards}
          />
        )}
      </div>

      {/* ── Editor context banner ─────────────────────── */}
      {editorContext && (
        <div className="border-t border-border/30 px-4 py-2 bg-primary/[0.03] flex items-center gap-2">
          <Pencil className="h-3 w-3 text-primary/60 shrink-0" />
          <span className="text-[11px] text-muted-foreground truncate">
            {editorContext.isEditing ? "Editing" : "Creating"} card
            {editorContext.folderName && (
              <> in <strong className="text-foreground/80">{editorContext.folderName}</strong></>
            )}
          </span>
        </div>
      )}

      {/* ── Input ──────────────────────────────────────── */}
      <div className="border-t border-border/50 px-4 py-3">
        <div
          className={cn(
            "flex items-end gap-2 rounded-2xl border border-border/70 bg-background px-4 py-2.5",
            "transition-shadow duration-200",
            "focus-within:border-primary/40 focus-within:shadow-[0_0_0_3px_hsl(var(--primary)/0.08)]"
          )}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your flashcards..."
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent text-[13px] placeholder:text-muted-foreground/50",
              "outline-none max-h-28 leading-[1.6] py-0.5",
              "scrollbar-none"
            )}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            disabled={loading}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200",
              input.trim() && !loading
                ? "bg-primary text-white shadow-sm hover:opacity-90 scale-100"
                : "bg-muted text-muted-foreground/40 scale-95"
            )}
          >
            <SendHorizonal className="h-4 w-4" />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-2 select-none">
          AI can make mistakes. Verify important info.
        </p>
      </div>
    </aside>
  );
}

/* ── Sub-components ──────────────────────────────────────────── */

function EmptyState({ onSuggestion, editorContext }: {
  onSuggestion: (text: string) => void;
  editorContext?: { folderId: string | null; folderName: string | null; isEditing: boolean } | null;
}) {
  const suggestions = editorContext ? EDITOR_SUGGESTIONS : SUGGESTIONS;

  const memoizedGreeting = useMemo(() => {
    const hour = new Date().getHours();
    let timeGreeting = "Good evening";
    if (hour < 12) timeGreeting = "Good morning";
    else if (hour < 18) timeGreeting = "Good afternoon";

    const options = [
      `${timeGreeting}! Let's kick it off with one of these options.`,
      `${timeGreeting}! Ready to dive in? Pick a starting point.`,
      `${timeGreeting}! How can I help you today? Here are some ideas:`,
      `${timeGreeting}! Let's get started. Try one of these:`
    ];
    return options[Math.floor(Math.random() * options.length)];
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 pb-8 animate-fade-up">
      <p className="text-[13px] text-foreground/80 leading-relaxed mb-6 max-w-[280px] font-medium">
        {memoizedGreeting}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onSuggestion(s.label)}
            className={cn(
              "group flex items-center gap-1.5 rounded-full border border-border/70",
              "bg-background px-3.5 py-2 text-[12px] font-medium text-foreground/80",
              "hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
              "transition-all duration-200 hover:shadow-sm"
            )}
          >
            <span className="text-sm">{s.emoji}</span>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isLatest,
}: {
  message: DisplayMessage;
  isLatest: boolean;
}) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex",
        isUser ? "justify-end" : "justify-start",
        isLatest && "animate-fade-up"
      )}
    >
      <div
        className={cn(
          "max-w-[88%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-primary text-white rounded-br-md"
            : "bg-muted/70 text-foreground rounded-bl-md border border-border/40"
        )}
      >
        {isUser ? (
          <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="space-y-1 [&_.katex]:text-[13px]">{renderMarkdown(message.content)}</div>
        )}
      </div>
    </div>
  );
}

function ThinkingIndicator({ toolStatus }: { toolStatus: string | null }) {
  return (
    <div className="flex justify-start animate-fade-up">
      <div className="flex items-center gap-2.5 rounded-2xl rounded-bl-md bg-muted/70 border border-border/40 px-4 py-3">
        <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
        <span className="text-[12px] text-muted-foreground font-medium">
          {toolStatus ? (
            <span className="flex items-center gap-1.5">
              {toolStatus}
              <span className="inline-flex gap-0.5">
                <span className="h-1 w-1 rounded-full bg-primary/50 animate-bounce [animation-delay:0ms]" />
                <span className="h-1 w-1 rounded-full bg-primary/50 animate-bounce [animation-delay:150ms]" />
                <span className="h-1 w-1 rounded-full bg-primary/50 animate-bounce [animation-delay:300ms]" />
              </span>
            </span>
          ) : (
            "Thinking..."
          )}
        </span>
      </div>
    </div>
  );
}

function ProposedCardsPreview({
  cards,
  onConfirm,
  onDismiss,
  saving,
}: {
  cards: Array<{ question: string; answer: string; folderId: string | null }>;
  onConfirm: () => void;
  onDismiss: () => void;
  saving: boolean;
}) {
  return (
    <div className="animate-fade-up rounded-2xl border border-primary/20 bg-primary/[0.03] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <FileStack className="h-4 w-4 text-primary" />
        <span className="text-[13px] font-bold">
          {cards.length} card{cards.length !== 1 ? "s" : ""} ready to create
        </span>
      </div>

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
        {cards.map((card, i) => (
          <div
            key={i}
            className="rounded-xl bg-background border border-border/40 px-3 py-2"
          >
            <p className="text-[12px] font-medium text-foreground/80 truncate">
              <span className="text-primary/60 font-bold mr-1">Q:</span>
              {card.question.slice(0, 100)}
              {card.question.length > 100 && "..."}
            </p>
            {card.answer && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                <span className="text-success/60 font-bold mr-1">A:</span>
                {card.answer.slice(0, 100)}
                {card.answer.length > 100 && "..."}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={saving}
          className={cn(
            "flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-bold",
            "bg-primary text-white hover:opacity-90 transition-opacity",
            saving && "opacity-60"
          )}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving..." : "Create All"}
        </button>
        <button
          onClick={onDismiss}
          disabled={saving}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-medium",
            "bg-muted text-muted-foreground hover:text-foreground transition-colors"
          )}
        >
          <X className="h-3.5 w-3.5" />
          Dismiss
        </button>
      </div>
    </div>
  );
}
