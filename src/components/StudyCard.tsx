"use client";

import type { Flashcard } from "@/lib/types";
import { LaTeXRenderer } from "./LaTeXRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    <Card>
      <CardHeader className="space-y-3 border-b border-border">
        <div className="flex items-center justify-between">
          <Badge variant="secondary">Question</Badge>
          <span className="text-xs text-muted-foreground">
            Timer: {card.timer_mode}
          </span>
        </div>
        <div className="rounded-md bg-background/70 p-4">
          <FlashcardContent
            type={card.question_type}
            content={card.question_content}
          />
        </div>
      </CardHeader>

      {showAnswer ? (
        <CardContent className="border-b border-border bg-muted/30">
          <div className="mb-3 flex items-center justify-between">
            <Badge variant="default">Answer</Badge>
          </div>
          {card.answer_content ? (
            <div className="rounded-md bg-background p-4">
              <FlashcardContent
                type={card.answer_type || "latex"}
                content={card.answer_content}
              />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              No answer provided - rate based on your own solution.
            </p>
          )}
        </CardContent>
      ) : null}

      <CardFooter className="justify-center gap-4">
        {!showAnswer ? (
          <Button size="lg" onClick={onReveal}>
            Reveal Answer
          </Button>
        ) : (
          <>
            <Button variant="destructive" size="lg" onClick={() => onRate(false)}>
              Incorrect
            </Button>
            <Button
              size="lg"
              onClick={() => onRate(true)}
              className="bg-success text-white hover:bg-success/90"
            >
              Correct
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

function FlashcardContent({
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
