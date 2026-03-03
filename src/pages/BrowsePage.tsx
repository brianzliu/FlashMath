import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import type { Flashcard, Folder } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { ImageDisplay } from "@/components/ImageDisplay";
import { LaTeXRenderer } from "@/components/LaTeXRenderer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Pencil, Trash2, FolderOpen, Clock } from "lucide-react";
import { CardPreviewModal } from "@/components/CardPreviewModal";
import { unlinkFlashcardFromImports } from "@/lib/import-library";
import { confirmDestructive } from "@/lib/dialogs";

type SortMode = "newest" | "oldest" | "due-first" | "ease-asc" | "ease-desc";
type FilterMode = "all" | "due" | "not-due" | "new";

export default function BrowsePage() {
  const { folders, setFolders } = useAppStore();
  const [allCards, setAllCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    Promise.all([commands.getFlashcards(), commands.getFolders()])
      .then(([cards, loadedFolders]) => {
        if (!active) return;
        setAllCards(cards);
        setFolders(loadedFolders);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setFolders]);

  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    for (const f of folders) map.set(f.id, f);
    return map;
  }, [folders]);

  const filteredCards = useMemo(() => {
    let cards = [...allCards];

    if (selectedFolder !== "all") {
      cards = cards.filter((c) => c.folder_id === selectedFolder);
    }

    const now = new Date();
    if (filterMode === "due") {
      cards = cards.filter((c) => !c.due_date || new Date(c.due_date) <= now);
    } else if (filterMode === "not-due") {
      cards = cards.filter((c) => c.due_date && new Date(c.due_date) > now);
    } else if (filterMode === "new") {
      cards = cards.filter((c) => c.repetitions === 0);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      cards = cards.filter(
        (c) =>
          c.question_content.toLowerCase().includes(q) ||
          (c.answer_content && c.answer_content.toLowerCase().includes(q))
      );
    }

    cards.sort((a, b) => {
      switch (sortMode) {
        case "newest":
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        case "oldest":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "due-first": {
          const dueA = a.due_date ? new Date(a.due_date).getTime() : 0;
          const dueB = b.due_date ? new Date(b.due_date).getTime() : 0;
          return dueA - dueB;
        }
        case "ease-asc":
          return a.ease_factor - b.ease_factor;
        case "ease-desc":
          return b.ease_factor - a.ease_factor;
        default:
          return 0;
      }
    });

    return cards;
  }, [allCards, selectedFolder, filterMode, search, sortMode]);

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDestructive(
      "Delete this flashcard? This action cannot be undone.",
      "Delete Flashcard"
    );
    if (!confirmed) {
      return;
    }
    try {
      await commands.deleteFlashcard(id);
      await unlinkFlashcardFromImports(id);
      setAllCards((prev) => prev.filter((c) => c.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch {
      /* noop */
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const confirmed = await confirmDestructive(
      `Delete ${ids.length} selected flashcards? This cannot be undone.`,
      "Delete Selected Flashcards"
    );
    if (!confirmed) {
      return;
    }
    try {
      await Promise.all(ids.map((id) => commands.deleteFlashcard(id)));
      await Promise.all(ids.map((id) => unlinkFlashcardFromImports(id)));
      setAllCards((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    } catch {
      /* noop */
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Browse Cards
        </h1>
        <p className="text-muted-foreground mt-1">
          Search, filter, and manage all your flashcards.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards..."
            className="pl-9 h-9"
          />
        </div>

        <select
          value={selectedFolder}
          onChange={(e) => setSelectedFolder(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="all">All Decks</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <div className="flex rounded-lg border border-input overflow-hidden">
          {(
            [
              ["all", "All"],
              ["due", "Due"],
              ["not-due", "Upcoming"],
              ["new", "New"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilterMode(value)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                filterMode === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="due-first">Due soonest</option>
          <option value="ease-asc">Hardest first</option>
          <option value="ease-desc">Easiest first</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}
        </p>

        {filteredCards.length > 0 && (
          <div className="ml-auto flex items-center justify-end gap-2 shrink-0">
            <div className="w-[11.5rem]">
              <Button
                size="sm"
                variant="destructive"
                className={cn(
                  "w-full justify-center transition-opacity",
                  selectedIds.size === 0 && "invisible pointer-events-none"
                )}
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Selected ({selectedIds.size})
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="min-w-[8.5rem] justify-center"
              onClick={() => {
                setSelectedIds(
                  selectedIds.size === filteredCards.length
                    ? new Set()
                    : new Set(filteredCards.map((c) => c.id))
                );
              }}
            >
              {selectedIds.size === filteredCards.length ? "Clear Selection" : "Select Visible"}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center">
          Loading cards...
        </p>
      ) : filteredCards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {search ? "No cards match your search." : "No cards found."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredCards.map((card, index) => {
            const isDue =
              !card.due_date || new Date(card.due_date) <= new Date();
            const folderName = card.folder_id
              ? folderMap.get(card.folder_id)?.name
              : null;
            const hasAnswer = Boolean(card.answer_content);
            const statusLabel = isDue
              ? "Due"
              : card.repetitions === 0
              ? "New"
              : formatDate(card.due_date!);
            const statusVariant = isDue
              ? "default"
              : card.repetitions === 0
              ? "warning"
              : "success";

            return (
              <Card
                key={card.id}
                className="cursor-pointer overflow-hidden transition-all hover:border-primary/20 hover:shadow-sm"
                onClick={() => setPreviewIndex(index)}
              >
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="truncate text-sm font-semibold">
                        {card.title
                          ? card.title
                          : card.question_type === "latex"
                          ? card.question_content.slice(0, 80)
                          : "[Image]"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant={statusVariant} className="shrink-0 text-[10px]">
                          {statusLabel}
                        </Badge>
                        {folderName && (
                          <span className="truncate max-w-[140px]">{folderName}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatTimer(card.timer_seconds)}
                        </span>
                        <span>EF {card.ease_factor.toFixed(1)}</span>
                        <span>Rep {card.repetitions}</span>
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label
                        className={cn(
                          "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-background px-2 transition-colors hover:bg-accent",
                          selectedIds.has(card.id) && "border-primary bg-primary/10"
                        )}
                        title={selectedIds.has(card.id) ? "Deselect card" : "Select card"}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(card.id)}
                          onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(card.id)) {
                                next.delete(card.id);
                              } else {
                                next.add(card.id);
                              }
                              return next;
                            });
                          }}
                          className="h-4 w-4 rounded border-border accent-primary"
                          aria-label="Select flashcard"
                        />
                      </label>
                      <Button
                        variant="ghost"
                        size="icon"
                        asChild
                        className="h-8 w-8"
                      >
                        <Link to={`/card?id=${card.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-destructive"
                        onClick={() => handleDelete(card.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 p-4 lg:grid-cols-2">
                    <PreviewColumn
                      label="Question"
                      type={card.question_type}
                      content={card.question_content}
                      emptyLabel="No question"
                    />
                    <PreviewColumn
                      label="Answer"
                      type={card.answer_type || "latex"}
                      content={card.answer_content}
                      emptyLabel="No answer"
                      muted={!hasAnswer}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {previewIndex !== null && (
        <CardPreviewModal
          cards={filteredCards}
          currentIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </div>
  );
}

function PreviewColumn({
  label,
  type,
  content,
  emptyLabel,
  muted = false,
}: {
  label: string;
  type: string;
  content: string | null;
  emptyLabel: string;
  muted?: boolean;
}) {
  const images = type === "image" && content ? getImageSources(content) : [];

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border border-border/70 bg-muted/20 p-3",
        muted && "opacity-80"
      )}
    >
      <div className="mb-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
      </div>
      {!content ? (
        <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-border/60 bg-background px-3 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : type === "image" ? (
        <div
          className={cn(
            "grid gap-2",
            images.length === 1 ? "grid-cols-1" : "grid-cols-2"
          )}
        >
          {images.map((src, index) => (
            <div
              key={`${label}-${index}`}
              className="overflow-hidden rounded-lg border border-border/60 bg-background"
            >
              <ImageDisplay
                src={src}
                alt={`${label} ${index + 1}`}
                className="h-32 w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-background p-3.5">
          <div className="max-h-32 overflow-hidden text-sm leading-6">
            <LaTeXRenderer content={content} />
          </div>
        </div>
      )}
    </div>
  );
}

function getImageSources(content: string): string[] {
  return content.split("|||").filter(Boolean);
}

function formatTimer(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${seconds}s`;
}
