import { useState } from "react";
import type { Flashcard } from "@/lib/types";
import { LaTeXRenderer } from "./LaTeXRenderer";
import { ImageDisplay } from "./ImageDisplay";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { X, ChevronLeft, ChevronRight, Eye, EyeOff, Pencil } from "lucide-react";
import { Link } from "react-router-dom";

interface CardPreviewModalProps {
  cards: Flashcard[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

function FlashcardContent({ type, content }: { type: string; content: string }) {
  if (type === "latex") {
    return <LaTeXRenderer content={content} />;
  }
  return (
    <div className="flex justify-center">
      <ImageDisplay
        src={content}
        alt="Flashcard content"
        className="max-w-full max-h-64 rounded-lg"
      />
    </div>
  );
}

export function CardPreviewModal({
  cards,
  currentIndex,
  onClose,
  onNavigate,
}: CardPreviewModalProps) {
  const [showAnswer, setShowAnswer] = useState(false);
  const card = cards[currentIndex];
  if (!card) return null;

  const isDue = !card.due_date || new Date(card.due_date) <= new Date();

  const handlePrev = () => {
    if (currentIndex > 0) {
      setShowAnswer(false);
      onNavigate(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setShowAnswer(false);
      onNavigate(currentIndex + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") handlePrev();
    else if (e.key === "ArrowRight") handleNext();
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setShowAnswer((prev) => !prev);
    } else if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="relative bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {cards.length}
            </span>
            <Badge
              variant={
                isDue
                  ? "default"
                  : card.repetitions === 0
                  ? "warning"
                  : "success"
              }
              className="text-[10px]"
            >
              {isDue
                ? "Due"
                : card.repetitions === 0
                ? "New"
                : formatDate(card.due_date!)}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <Link to={`/card?id=${card.id}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Question */}
        <div className="px-6 pt-5 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Question
          </p>
          <div className="rounded-xl bg-muted/30 p-5">
            <FlashcardContent
              type={card.question_type}
              content={card.question_content}
            />
          </div>
        </div>

        {/* Answer */}
        <div className="px-6 pb-5">
          {showAnswer ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                Answer
              </p>
              {card.answer_content ? (
                <div className="rounded-xl bg-success/5 border border-success/20 p-5">
                  <FlashcardContent
                    type={card.answer_type || "latex"}
                    content={card.answer_content}
                  />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm italic">
                  No answer provided.
                </p>
              )}
            </>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowAnswer(true)}
            >
              <Eye className="h-4 w-4 mr-2" />
              Show Answer
            </Button>
          )}
          {showAnswer && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 text-muted-foreground"
              onClick={() => setShowAnswer(false)}
            >
              <EyeOff className="h-3.5 w-3.5 mr-1.5" />
              Hide Answer
            </Button>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Use arrow keys to navigate
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
