export const TIMER_PRESETS = {
  "1min": 60,
  "5min": 300,
  "10min": 600,
} as const;

export const DEFAULT_EASE_FACTOR = 2.5;
export const MIN_EASE_FACTOR = 1.3;
export const DEFAULT_TIMER_MODE = "5min" as const;
export const DEFAULT_TIMER_SECONDS = 300;

export const SRS_QUALITY = {
  FAST_CORRECT: 5,
  NORMAL_CORRECT: 4,
  SLOW_CORRECT: 3,
  INCORRECT: 0,
} as const;

export const SPEED_THRESHOLDS = {
  FAST: 0.6,
  NORMAL: 1.0,
} as const;
