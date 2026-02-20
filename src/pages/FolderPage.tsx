import { useState, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { cn, formatDate, daysUntil } from "@/lib/utils";
import type { Flashcard, Folder } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Plus,
  BookOpen,
  FileImage,
  FileText,
  Pencil,
  Trash2,
  Calendar,
  Target,
  Clock,
  RotateCcw,
} from "lucide-react";
import { CardPreviewModal } from "@/components/CardPreviewModal";
import { unlinkFlashcardFromImports } from "@/lib/import-library";

export default function FolderPage() {
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("id") || "";
  const { folders, setFolders, updateFolder } = useAppStore();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [folderLoading, setFolderLoading] = useState(true);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const existing = folders.find((f) => f.id === folderId) || null;
    if (existing) {
      setFolder(existing);
      setFolderLoading(false);
      return;
    }
    if (!folderId) {
      setFolder(null);
      setFolderLoading(false);
      return;
    }
    commands
      .getFolders()
      .then((loaded) => {
        if (!active) return;
        setFolders(loaded);
        setFolder(loaded.find((f) => f.id === folderId) || null);
      })
      .catch(() => {
        if (active) setFolder(null);
      })
      .finally(() => {
        if (active) setFolderLoading(false);
      });
    return () => {
      active = false;
    };
  }, [folderId, folders, setFolders]);

  const loadFlashcards = useCallback(async () => {
    if (!folderId) return;
    try {
      const cards = await commands.getFlashcards(folderId);
      setFlashcards(cards);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    loadFlashcards();
  }, [loadFlashcards]);

  const dueCount = flashcards.filter((c) => {
    if (!c.due_date) return true;
    return new Date(c.due_date) <= new Date();
  }).length;

  const matureCount = flashcards.filter((c) => c.interval_days >= 7).length;
  const masteryPercent =
    flashcards.length > 0
      ? Math.round((matureCount / flashcards.length) * 100)
      : 0;

  const handleDeleteCard = async (id: string) => {
    if (!window.confirm("Delete this flashcard? This action cannot be undone.")) {
      return;
    }
    try {
      await commands.deleteFlashcard(id);
      await unlinkFlashcardFromImports(id);
      setFlashcards((prev) => prev.filter((c) => c.id !== id));
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
    if (!window.confirm(`Delete ${ids.length} selected flashcards? This cannot be undone.`)) {
      return;
    }
    try {
      await Promise.all(ids.map((id) => commands.deleteFlashcard(id)));
      await Promise.all(ids.map((id) => unlinkFlashcardFromImports(id)));
      setFlashcards((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
    } catch {
      /* noop */
    }
  };

  const handleSetDeadline = async () => {
    if (!deadlineInput || !folderId) return;
    try {
      await commands.setFolderDeadline(folderId, deadlineInput);
      updateFolder(folderId, { deadline: deadlineInput });
      setFolder((prev) =>
        prev ? { ...prev, deadline: deadlineInput } : prev
      );
      setShowDeadlinePicker(false);
    } catch {
      /* noop */
    }
  };

  const handleClearDeadline = async () => {
    if (!folderId) return;
    try {
      await commands.setFolderDeadline(folderId, null);
      updateFolder(folderId, { deadline: null });
      setFolder((prev) => (prev ? { ...prev, deadline: null } : prev));
      setShowDeadlinePicker(false);
    } catch {
      /* noop */
    }
  };

  if (folderLoading)
    return (
      <p className="text-muted-foreground py-8 text-center">Loading deck...</p>
    );

  if (!folder)
    return (
      <div className="text-center py-12 text-muted-foreground">
        Deck not found. Select one from the sidebar.
      </div>
    );

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {folder.name}
          </h1>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
            <span>{flashcards.length} cards</span>
            {dueCount > 0 && (
              <span className="text-primary font-semibold">{dueCount} due</span>
            )}
            {folder.deadline && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {daysUntil(folder.deadline)}d left
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {dueCount > 0 && (
            <Button asChild>
              <Link to={`/study?folderId=${folderId}`}>
                <BookOpen className="h-4 w-4 mr-1.5" />
                Study ({dueCount})
              </Link>
            </Button>
          )}
          {flashcards.length > 0 && (
            <Button variant="outline" asChild>
              <Link to={`/study?folderId=${folderId}&mode=all`}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Review All
              </Link>
            </Button>
          )}
          <Button variant="secondary" asChild>
            <Link to={`/card?folderId=${folderId}`}>
              <Plus className="h-4 w-4 mr-1.5" />
              New Card
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">Mastery</span>
              </div>
              <span className="text-sm font-bold text-primary">
                {masteryPercent}%
              </span>
            </div>
            <div className="w-full h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${masteryPercent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {matureCount}/{flashcards.length} cards mature (7+ day interval)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-warning" />
                <span className="text-sm font-bold">Deadline</span>
              </div>
              <button
                onClick={() => setShowDeadlinePicker(!showDeadlinePicker)}
                className="text-xs text-primary hover:underline"
              >
                {folder.deadline ? "Change" : "Set deadline"}
              </button>
            </div>
            {folder.deadline ? (
              <div>
                <p className="text-lg font-bold">
                  {formatDate(folder.deadline)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {daysUntil(folder.deadline)} days remaining
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No deadline set.
              </p>
            )}
            {showDeadlinePicker && (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  type="date"
                  value={deadlineInput}
                  onChange={(e) => setDeadlineInput(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button size="sm" className="h-8" onClick={handleSetDeadline}>
                  Set
                </Button>
                {folder.deadline && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={handleClearDeadline}
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/import/pdf?folderId=${folderId}`}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Import PDF
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/import/image?folderId=${folderId}`}>
            <FileImage className="h-3.5 w-3.5 mr-1.5" />
            Import Image
          </Link>
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-bold">Cards</h2>
          {flashcards.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedIds(
                    selectedIds.size === flashcards.length
                      ? new Set()
                      : new Set(flashcards.map((c) => c.id))
                  );
                }}
              >
                {selectedIds.size === flashcards.length ? "Clear Selection" : "Select All"}
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
        </div>
        {loading ? (
          <p className="text-muted-foreground py-4 text-center">
            Loading cards...
          </p>
        ) : flashcards.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-muted-foreground">No cards in this deck.</p>
              <Button variant="secondary" asChild>
                <Link to={`/card?folderId=${folderId}`}>
                  Create your first card
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {flashcards.map((card, index) => (
              <FlashcardRow
                key={card.id}
                card={card}
                onDelete={() => handleDeleteCard(card.id)}
                onClick={() => setPreviewIndex(index)}
                selected={selectedIds.has(card.id)}
                onToggleSelect={() => {
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
              />
            ))}
          </div>
        )}
      </div>

      {previewIndex !== null && (
        <CardPreviewModal
          cards={flashcards}
          currentIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onNavigate={setPreviewIndex}
        />
      )}
    </div>
  );
}

function FlashcardRow({
  card,
  onDelete,
  onClick,
  selected,
  onToggleSelect,
}: {
  card: Flashcard;
  onDelete: () => void;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const isDue = !card.due_date || new Date(card.due_date) <= new Date();

  return (
    <Card className="transition-all hover:shadow-sm hover:border-primary/20 cursor-pointer" onClick={onClick}>
      <CardContent className="p-4 flex items-center gap-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
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
          <p className="text-sm font-medium truncate">
            {card.title
              ? card.title
              : card.question_type === "latex"
              ? card.question_content.slice(0, 80)
              : "[Image]"}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatTimer(card.timer_seconds)}
            </span>
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
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to={`/card?id=${card.id}`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
