"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { cn, formatDate, daysUntil } from "@/lib/utils";
import type { Flashcard, Folder } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function FolderPageContent() {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("id") || "";
  const { folders, setFolders } = useAppStore();
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [folderLoading, setFolderLoading] = useState(true);

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

  if (folderLoading) {
    return <div className="text-muted-foreground">Loading folder...</div>;
  }

  if (!folder) {
    return (
      <div className="text-muted-foreground">
        Folder not found. Try selecting one from the sidebar.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>{folder.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {flashcards.length} cards &middot; {dueCount} due today
              </p>
            </div>
            <div className="flex gap-2">
              {dueCount > 0 && (
                <Button asChild>
                  <Link href={`/study?folderId=${folderId}`}>
                    Study ({dueCount})
                  </Link>
                </Button>
              )}
              <Button variant="secondary" asChild>
                <Link href={`/card?folderId=${folderId}`}>New card</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/import/pdf?folderId=${folderId}`}>Import PDF</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/import/image?folderId=${folderId}`}>
                  Import Image
                </Link>
              </Button>
            </div>
          </div>
          {folder.deadline && (
            <Badge variant="warning">
              Deadline {formatDate(folder.deadline)} ({daysUntil(folder.deadline)}{" "}
              days left)
            </Badge>
          )}
        </CardHeader>
        {folder.deadline && (
          <>
            <Separator />
            <CardContent className="pt-6">
              <DeadlineProgress
                flashcards={flashcards}
                deadline={folder.deadline}
              />
            </CardContent>
          </>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cards</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading cards...</p>
          ) : flashcards.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-center text-muted-foreground">
              <p>No flashcards yet.</p>
              <Button variant="link" asChild className="mt-2">
                <Link href={`/card?folderId=${folderId}`}>
                  Create your first card
                </Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {flashcards.map((card) => (
                <FlashcardCard
                  key={card.id}
                  card={card}
                  onDelete={() => handleDeleteCard(card.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-muted-foreground">Mastery progress</span>
        <span className="text-foreground">
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
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant={isDue ? "default" : "secondary"}>
            {isDue ? "Due" : `Due ${formatDate(card.due_date!)}`}
          </Badge>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/card?id=${card.id}`}>Edit</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>

        <div className="text-sm font-mono truncate">
          {card.question_type === "latex"
            ? card.question_content.slice(0, 80)
            : "[Image]"}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Timer: {card.timer_mode}</span>
          <span>&middot;</span>
          <span>EF: {card.ease_factor.toFixed(2)}</span>
          <span>&middot;</span>
          <span>Rep: {card.repetitions}</span>
        </div>
      </CardContent>
    </Card>
  );
}
