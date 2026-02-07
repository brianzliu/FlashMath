import { useState, useEffect, useRef, useCallback } from "react";

interface UseTimerOptions {
  totalSeconds: number;
  running: boolean;
  onComplete?: () => void;
}

interface UseTimerResult {
  timeRemaining: number;
  elapsed: number;
  isOvertime: boolean;
  reset: () => void;
}

export function useTimer({
  totalSeconds,
  running,
  onComplete,
}: UseTimerOptions): UseTimerResult {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const reset = useCallback(() => {
    setElapsed(0);
    startTimeRef.current = null;
    completedRef.current = false;
  }, []);

  useEffect(() => {
    if (!running) {
      startTimeRef.current = null;
      return;
    }

    startTimeRef.current = Date.now() - elapsed * 1000;

    const interval = setInterval(() => {
      if (startTimeRef.current === null) return;
      const newElapsed = (Date.now() - startTimeRef.current) / 1000;
      setElapsed(newElapsed);

      if (
        newElapsed >= totalSeconds &&
        !completedRef.current &&
        onComplete
      ) {
        completedRef.current = true;
        onComplete();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [running, totalSeconds, onComplete, elapsed]);

  const timeRemaining = Math.max(0, totalSeconds - elapsed);
  const isOvertime = elapsed > totalSeconds;

  return { timeRemaining, elapsed, isOvertime, reset };
}
