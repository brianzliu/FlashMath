import type { Flashcard } from "@/lib/types";
import { LaTeXRenderer } from "./LaTeXRenderer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Check, X } from "lucide-react";

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
    <Card className="overflow-hidden">
      {/* Question */}
      <CardContent className="p-6 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Question
        </p>
        <div className="rounded-xl bg-muted/30 p-5">
          <FlashcardContent
            type={card.question_type}
            content={card.question_content}
          />
        </div>
      </CardContent>

      {/* Answer */}
      {showAnswer && (
        <CardContent className="p-6 pt-0">
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
              No answer provided — rate based on your own solution.
            </p>
          )}
        </CardContent>
      )}

      {/* Actions */}
      <CardFooter className="justify-center gap-3 py-5 border-t border-border">
        {!showAnswer ? (
          <Button size="lg" onClick={onReveal}>
            Reveal Answer
          </Button>
        ) : (
          <>
            <Button
              variant="destructive"
              size="lg"
              onClick={() => onRate(false)}
              className="min-w-[130px]"
            >
              <X className="h-4 w-4 mr-1.5" />
              Incorrect
            </Button>
            <Button
              variant="success"
              size="lg"
              onClick={() => onRate(true)}
              className="min-w-[130px]"
            >
              <Check className="h-4 w-4 mr-1.5" />
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

  return (
    <div className="flex justify-center">
      <img
        src={content}
        alt="Flashcard content"
        className="max-w-full max-h-64 rounded-lg"
      />
    </div>
  );
}
