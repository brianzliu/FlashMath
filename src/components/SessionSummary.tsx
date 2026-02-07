import type { Flashcard, ReviewResult } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, RotateCcw, ArrowLeft, Check, X } from "lucide-react";

interface CompletedCard {
  card: Flashcard;
  result: ReviewResult;
  responseTime: number;
}

interface SessionSummaryProps {
  completed: CompletedCard[];
  folderName: string;
  onReturn: () => void;
  onStudyAgain: () => void;
}

export function SessionSummary({
  completed,
  folderName,
  onReturn,
  onStudyAgain,
}: SessionSummaryProps) {
  if (completed.length === 0) {
    return (
      <div className="max-w-md mx-auto text-center py-12 animate-fade-up">
        <div className="h-16 w-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
          <Trophy className="h-8 w-8 text-success" />
        </div>
        <h2 className="text-2xl font-extrabold mb-2">All caught up!</h2>
        <p className="text-muted-foreground mb-6">
          No cards due in {folderName}. Come back later.
        </p>
        <Button onClick={onReturn}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Return
        </Button>
      </div>
    );
  }

  const correct = completed.filter((c) => c.result.quality > 0).length;
  const incorrect = completed.length - correct;
  const accuracy = Math.round((correct / completed.length) * 100);
  const avgTime =
    completed.reduce((acc, c) => acc + c.responseTime, 0) / completed.length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-up">
      {/* Header */}
      <div className="text-center">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-extrabold">Session Complete</h2>
        <p className="text-muted-foreground mt-1">{folderName}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 stagger-children">
        <MiniStat label="Reviewed" value={completed.length.toString()} />
        <MiniStat label="Accuracy" value={`${accuracy}%`} accent="text-primary" />
        <MiniStat label="Correct" value={correct.toString()} accent="text-success" />
        <MiniStat label="Avg Time" value={formatTime(avgTime)} />
      </div>

      {/* Results */}
      <Card>
        <CardContent className="p-4 space-y-1.5">
          {completed.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl bg-muted/30 px-4 py-2.5 text-sm"
            >
              <div
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                  item.result.quality > 0
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
                )}
              >
                {item.result.quality > 0 ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </div>
              <span className="flex-1 truncate font-mono text-xs">
                {item.card.question_type === "latex"
                  ? item.card.question_content.slice(0, 60)
                  : "[Image]"}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatTime(item.responseTime)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-center gap-3">
        <Button onClick={onStudyAgain}>
          <RotateCcw className="h-4 w-4 mr-1.5" />
          Study Again
        </Button>
        <Button variant="secondary" onClick={onReturn}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Return
        </Button>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className={cn("text-xl font-extrabold", accent)}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
