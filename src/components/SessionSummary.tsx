"use client";

import type { Flashcard, ReviewResult } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <Card className="max-w-lg mx-auto text-center">
        <CardHeader>
          <CardTitle>No cards due!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            All caught up in {folderName}. Come back later for more practice.
          </p>
          <Button onClick={onReturn}>Return</Button>
        </CardContent>
      </Card>
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
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">Session Complete</h2>
        <p className="text-sm text-muted-foreground">
          Review summary for {folderName}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Cards Reviewed" value={completed.length.toString()} />
        <StatCard label="Accuracy" value={`${accuracy}%`} />
        <StatCard label="Avg. Time" value={formatTime(avgTime)} />
        <StatCard label="Correct" value={correct.toString()} color="text-success" />
        <StatCard
          label="Incorrect"
          value={incorrect.toString()}
          color="text-destructive"
        />
        <StatCard
          label="Breakdown"
          value={`${fast}F / ${normal}N / ${slow}S`}
          subtitle="Fast / Normal / Slow"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {completed.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <Badge variant={item.result.quality > 0 ? "success" : "destructive"}>
                {item.result.quality > 0 ? "Correct" : "Incorrect"}
              </Badge>
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
        </CardContent>
      </Card>

      <div className="flex justify-center gap-3">
        <Button onClick={onStudyAgain}>Study Again</Button>
        <Button variant="secondary" onClick={onReturn}>
          Return
        </Button>
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
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color || ""}`}>{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}
