"use client";

import { cn } from "@/lib/utils";
import { useTimer } from "@/hooks/useTimer";
import { formatTime } from "@/lib/utils";

interface TimerProps {
  totalSeconds: number;
  running: boolean;
  onComplete?: () => void;
  className?: string;
}

export function Timer({
  totalSeconds,
  running,
  onComplete,
  className,
}: TimerProps) {
  const { timeRemaining, elapsed, isOvertime } = useTimer({
    totalSeconds,
    running,
    onComplete,
  });

  const percent = Math.max(
    0,
    Math.min(100, (timeRemaining / totalSeconds) * 100)
  );

  let timerColor = "text-timer-green";
  let barColor = "bg-timer-green";
  if (percent < 30) {
    timerColor = "text-timer-red";
    barColor = "bg-timer-red";
  } else if (percent < 60) {
    timerColor = "text-timer-yellow";
    barColor = "bg-timer-yellow";
  }

  if (isOvertime) {
    timerColor = "text-timer-red";
    barColor = "bg-timer-red";
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className={cn("text-3xl font-mono font-bold text-center", timerColor)}>
        {isOvertime ? "+" : ""}
        {formatTime(isOvertime ? elapsed - totalSeconds : timeRemaining)}
      </div>
      <div className="w-full h-2 bg-border rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-1000", barColor)}
          style={{ width: `${isOvertime ? 0 : percent}%` }}
        />
      </div>
      {isOvertime && (
        <p className="text-xs text-center text-timer-red">Over time!</p>
      )}
    </div>
  );
}
