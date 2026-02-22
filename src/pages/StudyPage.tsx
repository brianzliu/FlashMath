import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Timer } from "@/components/Timer";
import { StudyCard } from "@/components/StudyCard";
import { SessionSummary } from "@/components/SessionSummary";
import type { Flashcard, ReviewResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type SessionState = "loading" | "studying" | "revealing" | "summary";

interface CompletedCard {
  card: Flashcard;
  result: ReviewResult;
  responseTime: number;
}

export default function StudyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const folderId = searchParams.get("folderId") || "all";
  const reviewAll = searchParams.get("mode") === "all";
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
      let cards: Flashcard[];
      if (reviewAll) {
        cards = await commands.getFlashcards(
          folderId === "all" ? undefined : folderId
        );
      } else {
        cards = await commands.getDueFlashcards(
          folderId === "all" ? undefined : folderId
        );
      }
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
  }, [folderId, reviewAll]);

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
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (state === "summary") {
    return (
      <SessionSummary
        completed={completed}
        folderName={folder?.name || "All Cards"}
        onReturn={() =>
          navigate(folderId === "all" ? "/" : `/folder?id=${folderId}`)
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
    return (
      <p className="text-muted-foreground py-8 text-center">
        No cards to study.
      </p>
    );
  }

  return (
    <div className="max-w-[1400px] w-full mx-auto space-y-6 animate-fade-up flex flex-col justify-start min-h-[calc(100vh-8rem)] px-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">
            {folder?.name || "All Cards"}
            {reviewAll && <span className="text-muted-foreground font-normal text-sm ml-2">Review</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            Card {currentIndex + 1} of {dueCards.length}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            setState("summary");
            setTimerRunning(false);
          }}
          title="End session"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-1">
        {dueCards.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i < currentIndex
              ? "bg-primary"
              : i === currentIndex
                ? "bg-primary/50"
                : "bg-border"
              }`}
          />
        ))}
      </div>

      <Timer totalSeconds={currentCard.timer_seconds} running={timerRunning} />

      <StudyCard
        card={currentCard}
        showAnswer={state === "revealing"}
        onReveal={handleReveal}
        onRate={handleRate}
      />
    </div>
  );
}
