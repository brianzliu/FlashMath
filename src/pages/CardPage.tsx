import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FlashcardEditor } from "@/components/FlashcardEditor";
import type { Flashcard, CreateFlashcardInput } from "@/lib/types";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Card, CardContent } from "@/components/ui/card";

function isDataUrl(content: string): boolean {
  return content.startsWith("data:");
}

async function generateTitle(card: Flashcard): Promise<void> {
  try {
    let title: string;
    if (card.question_type === "image") {
      title = await commands.generateImageTitle(card.question_content);
    } else {
      title = await commands.generateLatexTitle(card.question_content);
    }
    if (title) {
      await commands.updateFlashcard(card.id, { title });
    }
  } catch (err) {
    console.warn("Auto title generation failed:", err);
  }
}

async function persistDataUrlImages(data: CreateFlashcardInput): Promise<CreateFlashcardInput> {
  const result = { ...data };
  
  if (data.question_type === "image" && isDataUrl(data.question_content)) {
    try {
      result.question_content = await commands.saveImageFromDataUrl(data.question_content);
    } catch {
      // Keep original if save fails
    }
  }
  
  if (data.answer_type === "image" && data.answer_content && isDataUrl(data.answer_content)) {
    try {
      result.answer_content = await commands.saveImageFromDataUrl(data.answer_content);
    } catch {
      // Keep original if save fails
    }
  }
  
  return result;
}

export default function CardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cardId = searchParams.get("id");
  const folderId = searchParams.get("folderId");
  const isEditing = Boolean(cardId);

  const [card, setCard] = useState<Flashcard | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [screenshotImage, setScreenshotImage] = useState<string | null>(null);

  // Consume pending screenshot from global store (set when shortcut fires on another page)
  const pendingScreenshot = useAppStore((s) => s.pendingScreenshot);
  const setPendingScreenshot = useAppStore((s) => s.setPendingScreenshot);

  useEffect(() => {
    if (pendingScreenshot) {
      setScreenshotImage(pendingScreenshot);
      setPendingScreenshot(null);
    }
  }, [pendingScreenshot, setPendingScreenshot]);

  useEffect(() => {
    if (cardId) {
      commands
        .getFlashcard(cardId)
        .then(setCard)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [cardId]);

  const handleScreenshot = useCallback(async () => {
    try {
      const result = await commands.takeScreenshot();
      if (result) {
        setScreenshotImage(result);
      }
    } catch (err) {
      console.error("Screenshot failed:", err);
    }
  }, []);

  const handleSave = async (data: CreateFlashcardInput) => {
    setSaving(true);
    try {
      const persistedData = await persistDataUrlImages(data);
      let savedCard: Flashcard;
      if (isEditing && cardId) {
        await commands.updateFlashcard(cardId, persistedData);
        savedCard = await commands.getFlashcard(cardId);
      } else {
        savedCard = await commands.createFlashcard({
          ...persistedData,
          folder_id: folderId,
        });
      }

      // Auto-generate title in the background (fire-and-forget)
      if (!savedCard.title) {
        generateTitle(savedCard).catch(() => {});
      }

      if (folderId) {
        navigate(`/folder?id=${folderId}`);
      } else if (card?.folder_id) {
        navigate(`/folder?id=${card.folder_id}`);
      } else {
        navigate("/");
      }
    } catch (err) {
      console.error("Failed to save flashcard:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return <p className="text-muted-foreground py-8 text-center">Loading...</p>;
  if (isEditing && !card)
    return (
      <p className="text-muted-foreground py-8 text-center">Card not found.</p>
    );

  return (
    <div className="max-w-2xl mx-auto animate-fade-up">
      <h1 className="text-2xl font-extrabold tracking-tight mb-6">
        {isEditing ? "Edit Card" : "New Card"}
      </h1>
      <Card>
        <CardContent className="p-6">
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
            onScreenshot={handleScreenshot}
            screenshotImage={screenshotImage}
            folderId={folderId || card?.folder_id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
