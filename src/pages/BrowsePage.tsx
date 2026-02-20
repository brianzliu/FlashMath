import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import type { Flashcard, Folder } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Pencil, Trash2, FolderOpen } from "lucide-react";
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

      <p className="text-sm text-muted-foreground">
        {filteredCards.length} card{filteredCards.length !== 1 ? "s" : ""}
      </p>

      {filteredCards.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
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
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
        </div>
      )}

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

            return (
              <Card
                key={card.id}
                className="transition-all hover:shadow-sm hover:border-primary/20 cursor-pointer"
                onClick={() => setPreviewIndex(index)}
              >
                <CardContent className="p-4 flex items-center gap-4">
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
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border accent-primary"
                    aria-label="Select flashcard"
                  />
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full shrink-0",
                      isDue
                        ? "bg-primary"
                        : card.repetitions === 0
                        ? "bg-warning"
                        : "bg-success"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {card.question_type === "latex" ? (
                        <span className="font-mono text-xs">
                          {card.question_content.slice(0, 80)}
                        </span>
                      ) : (
                        <span>
                          {card.title || (
                            <span className="text-muted-foreground italic">
                              [Image card]
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      {folderName && (
                        <span className="truncate max-w-[120px]">
                          {folderName}
                        </span>
                      )}
                      <span>EF {card.ease_factor.toFixed(1)}</span>
                      <span>Rep {card.repetitions}</span>
                    </div>
                  </div>
                  <Badge
                    variant={
                      isDue
                        ? "default"
                        : card.repetitions === 0
                        ? "warning"
                        : "success"
                    }
                    className="shrink-0 text-[10px]"
                  >
                    {isDue
                      ? "Due"
                      : card.repetitions === 0
                      ? "New"
                      : formatDate(card.due_date!)}
                  </Badge>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
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
