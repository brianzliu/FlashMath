"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { cn, formatDate, daysUntil } from "@/lib/utils";
import type { Flashcard } from "@/lib/types";

function FolderPageContent() {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("id") || "";
  const { folders } = useAppStore();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);

  const folder = folders.find((f) => f.id === folderId);

  const loadFlashcards = useCallback(async () => {
    if (!folderId) return;
    try {
      const cards = await commands.getFlashcards(folderId);
      setFlashcards(cards);
    } catch {
      // Handle error
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

  const handleDeleteCard = async (id: string) => {
    try {
      await commands.deleteFlashcard(id);
      setFlashcards((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // Handle error
    }
  };

  if (!folder) {
    return <div className="text-muted-foreground">Folder not found.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{folder.name}</h1>
          <p className="text-sm text-muted-foreground">
            {flashcards.length} cards &middot; {dueCount} due
            {folder.deadline && (
              <span className="ml-2">
                &middot; Deadline: {formatDate(folder.deadline)} (
                {daysUntil(folder.deadline)} days)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {dueCount > 0 && (
            <Link
              href={`/study?folderId=${folderId}`}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Study ({dueCount})
            </Link>
          )}
          <Link
            href={`/card?folderId=${folderId}`}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            + New Card
          </Link>
        </div>
      </div>

      {folder.deadline && (
        <DeadlineProgress flashcards={flashcards} deadline={folder.deadline} />
      )}

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : flashcards.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No flashcards yet.</p>
          <Link
            href={`/card?folderId=${folderId}`}
            className="text-primary hover:underline"
          >
            Create your first card
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {flashcards.map((card) => (
            <FlashcardCard
              key={card.id}
              card={card}
              onDelete={() => handleDeleteCard(card.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
      <FolderPageContent />
    </Suspense>
  );
}

function DeadlineProgress({
  flashcards,
  deadline,
}: {
  flashcards: Flashcard[];
  deadline: string;
}) {
  const total = flashcards.length;
  if (total === 0) return null;

  const mature = flashcards.filter((c) => c.interval_days >= 7).length;
  const percent = Math.round((mature / total) * 100);
  const days = daysUntil(deadline);

  let color = "bg-success";
  if (percent < 50 && days < 7) color = "bg-destructive";
  else if (percent < 70 && days < 14) color = "bg-warning";

  return (
    <div className="mb-6 p-4 rounded-lg bg-muted">
      <div className="flex justify-between text-sm mb-2">
        <span>Mastery progress</span>
        <span>
          {mature}/{total} mature ({percent}%)
        </span>
      </div>
      <div className="w-full h-2 bg-border rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function FlashcardCard({
  card,
  onDelete,
}: {
  card: Flashcard;
  onDelete: () => void;
}) {
  const isDue = !card.due_date || new Date(card.due_date) <= new Date();

  return (
    <div className="border border-border rounded-lg p-4 bg-card hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            isDue
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isDue ? "Due" : `Due ${formatDate(card.due_date!)}`}
        </span>
        <div className="flex gap-1">
          <Link
            href={`/card?id=${card.id}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Edit
          </Link>
          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="text-sm font-mono truncate mb-2">
        {card.question_type === "latex"
          ? card.question_content.slice(0, 80)
          : "[Image]"}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Timer: {card.timer_mode}</span>
        <span>&middot;</span>
        <span>EF: {card.ease_factor.toFixed(2)}</span>
        <span>&middot;</span>
        <span>Rep: {card.repetitions}</span>
      </div>
    </div>
  );
}
