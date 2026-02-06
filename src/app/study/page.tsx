"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Timer } from "@/components/Timer";
import { StudyCard } from "@/components/StudyCard";
import { SessionSummary } from "@/components/SessionSummary";
import type { Flashcard, ReviewResult } from "@/lib/types";
import { Button } from "@/components/ui/button";

type SessionState = "loading" | "studying" | "revealing" | "summary";

interface CompletedCard {
  card: Flashcard;
  result: ReviewResult;
  responseTime: number;
}

function StudyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const folderId = searchParams.get("folderId") || "all";
  const { folders } = useAppStore();
  const folder = folders.find((f) => f.id === folderId);

  const [state, setState] = useState<SessionState>("loading");
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState<CompletedCard[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [startTime, setStartTime] = useState(0);

  const currentCard = dueCards[currentIndex] || null;

  const loadDueCards = useCallback(async () => {
    try {
      const cards = await commands.getDueFlashcards(
        folderId === "all" ? undefined : folderId
      );
      if (cards.length === 0) {
        setState("summary");
      } else {
        setDueCards(cards);
        setState("studying");
        setTimerRunning(true);
        setStartTime(Date.now());
      }
    } catch {
      setState("summary");
    }
  }, [folderId]);

  useEffect(() => {
    loadDueCards();
  }, [loadDueCards]);

  const handleReveal = () => {
    setState("revealing");
    setTimerRunning(false);
  };

  const handleRate = async (correct: boolean) => {
    if (!currentCard) return;

    const responseTime = (Date.now() - startTime) / 1000;

    try {
      const result = await commands.submitReview({
        flashcard_id: currentCard.id,
        correct,
        response_time_seconds: responseTime,
      });

      setCompleted((prev) => [
        ...prev,
        { card: currentCard, result, responseTime },
      ]);

      if (currentIndex + 1 < dueCards.length) {
        setCurrentIndex((prev) => prev + 1);
        setState("studying");
        setTimerRunning(true);
        setStartTime(Date.now());
      } else {
        setState("summary");
      }
    } catch (err) {
      console.error("Failed to submit review:", err);
    }
  };

  if (state === "loading") {
    return <p className="text-muted-foreground">Loading study session...</p>;
  }

  if (state === "summary") {
    return (
      <SessionSummary
        completed={completed}
        folderName={folder?.name || "All Cards"}
        onReturn={() =>
          router.push(
            folderId === "all" ? "/" : `/folder?id=${folderId}`
          )
        }
        onStudyAgain={() => {
          setCompleted([]);
          setCurrentIndex(0);
          setState("loading");
          loadDueCards();
        }}
      />
    );
  }

  if (!currentCard) {
    return <p className="text-muted-foreground">No cards to study.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            Studying: {folder?.name || "All Cards"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentIndex + 1} / {dueCards.length} cards
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setState("summary");
            setTimerRunning(false);
          }}
        >
          End session
        </Button>
      </div>

      <Timer
        totalSeconds={currentCard.timer_seconds}
        running={timerRunning}
        className="mb-6"
      />

      <StudyCard
        card={currentCard}
        showAnswer={state === "revealing"}
        onReveal={handleReveal}
        onRate={handleRate}
      />

    </div>
  );
}

export default function StudyPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading...</p>}>
      <StudyPageContent />
    </Suspense>
  );
}
