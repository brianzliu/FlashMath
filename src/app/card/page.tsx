"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlashcardEditor } from "@/components/FlashcardEditor";
import type { Flashcard, CreateFlashcardInput } from "@/lib/types";
import * as commands from "@/lib/commands";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function CardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardId = searchParams.get("id");
  const folderId = searchParams.get("folderId");
  const isEditing = Boolean(cardId);

  const [card, setCard] = useState<Flashcard | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  useEffect(() => {
    if (cardId) {
      commands
        .getFlashcard(cardId)
        .then(setCard)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [cardId]);

  const handleSave = async (data: CreateFlashcardInput) => {
    setSaving(true);
    try {
      if (isEditing && cardId) {
        await commands.updateFlashcard(cardId, data);
      } else {
        await commands.createFlashcard({
          ...data,
          folder_id: folderId,
        });
      }
      if (folderId) {
        router.push(`/folder?id=${folderId}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("Failed to save flashcard:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">Loading...</p>;
  if (isEditing && !card)
    return <p className="text-muted-foreground">Card not found.</p>;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Flashcard" : "New Flashcard"}</CardTitle>
      </CardHeader>
      <CardContent>
        <FlashcardEditor
          initialData={
            card
              ? {
                  folder_id: card.folder_id,
                  question_type: card.question_type,
                  question_content: card.question_content,
                  answer_type: card.answer_type,
                  answer_content: card.answer_content,
                  timer_mode: card.timer_mode,
                  timer_seconds: card.timer_seconds,
                }
              : folderId
              ? { folder_id: folderId }
              : undefined
          }
          onSave={handleSave}
          saving={saving}
        />
      </CardContent>
    </Card>
  );
}

export default function CardPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
      <CardPageContent />
    </Suspense>
  );
}
