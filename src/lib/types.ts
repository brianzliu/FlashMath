export interface Folder {
  id: string;
  name: string;
  position: number;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface Flashcard {
  id: string;
  folder_id: string | null;
  question_type: "image" | "latex";
  question_content: string;
  answer_type: "image" | "latex" | null;
  answer_content: string | null;
  timer_mode: "1min" | "5min" | "10min" | "llm";
  timer_seconds: number;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_date: string | null;
  last_reviewed: string | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  flashcard_id: string;
  correct: boolean;
  response_time_seconds: number;
  timer_limit_seconds: number;
  speed_ratio: number;
  quality: number;
  ease_before: number;
  ease_after: number;
  interval_before: number;
  interval_after: number;
  reviewed_at: string;
}

export interface CreateFlashcardInput {
  folder_id: string | null;
  question_type: "image" | "latex";
  question_content: string;
  answer_type?: "image" | "latex" | null;
  answer_content?: string | null;
  timer_mode?: "1min" | "5min" | "10min" | "llm";
  timer_seconds?: number;
}

export interface UpdateFlashcardInput {
  folder_id?: string | null;
  question_type?: "image" | "latex";
  question_content?: string;
  answer_type?: "image" | "latex" | null;
  answer_content?: string | null;
  timer_mode?: "1min" | "5min" | "10min" | "llm";
  timer_seconds?: number;
}

export interface ReviewInput {
  flashcard_id: string;
  correct: boolean;
  response_time_seconds: number;
}

export interface ReviewResult {
  quality: number;
  speed_ratio: number;
  ease_factor: number;
  interval_days: number;
  due_date: string;
}

export interface StudyStats {
  total_cards: number;
  due_today: number;
  overdue: number;
  reviewed_today: number;
  accuracy_today: number;
}

export interface LLMConfig {
  provider: "openai" | "anthropic" | "openrouter" | "ollama" | "custom";
  api_key: string;
  model: string;
  base_url: string;
}

export interface CaptureResult {
  image_path: string;
  data_url: string;
}
