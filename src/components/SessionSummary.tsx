"use client";

import type { Flashcard, ReviewResult } from "@/lib/types";
import { formatTime } from "@/lib/utils";

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
      <div className="max-w-lg mx-auto text-center py-12">
        <h2 className="text-2xl font-bold mb-4">No cards due!</h2>
        <p className="text-muted-foreground mb-6">
          All caught up in {folderName}. Come back later for more practice.
        </p>
        <button
          onClick={onReturn}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium"
        >
          Return
        </button>
      </div>
    );
  }

  const correct = completed.filter((c) => c.result.quality > 0).length;
  const incorrect = completed.length - correct;
  const accuracy = Math.round((correct / completed.length) * 100);
  const avgTime =
    completed.reduce((acc, c) => acc + c.responseTime, 0) / completed.length;

  const fast = completed.filter((c) => c.result.quality === 5).length;
  const normal = completed.filter((c) => c.result.quality === 4).length;
  const slow = completed.filter((c) => c.result.quality === 3).length;

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">Session Complete</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Cards Reviewed" value={completed.length.toString()} />
        <StatCard label="Accuracy" value={`${accuracy}%`} />
        <StatCard label="Correct" value={correct.toString()} color="text-success" />
        <StatCard label="Incorrect" value={incorrect.toString()} color="text-destructive" />
        <StatCard label="Avg. Time" value={formatTime(avgTime)} />
        <StatCard
          label="Breakdown"
          value={`${fast}F / ${normal}N / ${slow}S`}
          subtitle="Fast / Normal / Slow"
        />
      </div>

      <div className="space-y-2 mb-6">
        <h3 className="text-sm font-medium text-muted-foreground">Results</h3>
        {completed.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-3 p-3 rounded-md bg-muted text-sm"
          >
            <span
              className={
                item.result.quality > 0 ? "text-success" : "text-destructive"
              }
            >
              {item.result.quality > 0 ? "+" : "x"}
            </span>
            <span className="flex-1 truncate font-mono text-xs">
              {item.card.question_type === "latex"
                ? item.card.question_content.slice(0, 60)
                : "[Image]"}
            </span>
            <span className="text-muted-foreground">
              {formatTime(item.responseTime)}
            </span>
            <span className="text-xs text-muted-foreground">
              Q{item.result.quality}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <button
          onClick={onStudyAgain}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:opacity-90"
        >
          Study Again
        </button>
        <button
          onClick={onReturn}
          className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md font-medium hover:opacity-90"
        >
          Return
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  color?: string;
  subtitle?: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-muted">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color || ""}`}>{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
