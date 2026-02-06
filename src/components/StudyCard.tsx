"use client";

import type { Flashcard } from "@/lib/types";
import { LaTeXRenderer } from "./LaTeXRenderer";

interface StudyCardProps {
  card: Flashcard;
  showAnswer: boolean;
  onReveal: () => void;
  onRate: (correct: boolean) => void;
}

export function StudyCard({
  card,
  showAnswer,
  onReveal,
  onRate,
}: StudyCardProps) {
  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {/* Question */}
      <div className="p-6 border-b border-border">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          QUESTION
        </p>
        <CardContent type={card.question_type} content={card.question_content} />
      </div>

      {/* Answer */}
      {showAnswer ? (
        <div className="p-6 border-b border-border bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            ANSWER
          </p>
          {card.answer_content ? (
            <CardContent
              type={card.answer_type || "latex"}
              content={card.answer_content}
            />
          ) : (
            <p className="text-muted-foreground text-sm italic">
              No answer provided — rate based on your own solution.
            </p>
          )}
        </div>
      ) : null}

      {/* Actions */}
      <div className="p-4 flex justify-center gap-4">
        {!showAnswer ? (
          <button
            onClick={onReveal}
            className="px-8 py-3 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90 transition-opacity"
          >
            Reveal Answer
          </button>
        ) : (
          <>
            <button
              onClick={() => onRate(false)}
              className="px-8 py-3 bg-destructive text-destructive-foreground rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Incorrect
            </button>
            <button
              onClick={() => onRate(true)}
              className="px-8 py-3 bg-success text-white rounded-md font-medium hover:opacity-90 transition-opacity"
            >
              Correct
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CardContent({
  type,
  content,
}: {
  type: string;
  content: string;
}) {
  if (type === "latex") {
    return <LaTeXRenderer content={content} />;
  }

  // Image type - show the image
  return (
    <div className="flex justify-center">
      <img
        src={content}
        alt="Flashcard content"
        className="max-w-full max-h-64 rounded"
      />
    </div>
  );
}
