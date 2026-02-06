"use client";

import { useState } from "react";
import { TIMER_PRESETS } from "@/lib/constants";
import type { CreateFlashcardInput } from "@/lib/types";

interface FlashcardEditorProps {
  initialData?: Partial<CreateFlashcardInput>;
  onSave: (data: CreateFlashcardInput) => void;
  saving?: boolean;
}

export function FlashcardEditor({
  initialData,
  onSave,
  saving,
}: FlashcardEditorProps) {
  const [questionType, setQuestionType] = useState<"latex" | "image">(
    (initialData?.question_type as "latex" | "image") || "latex"
  );
  const [questionContent, setQuestionContent] = useState(
    initialData?.question_content || ""
  );
  const [hasAnswer, setHasAnswer] = useState(
    Boolean(initialData?.answer_content)
  );
  const [answerType, setAnswerType] = useState<"latex" | "image">(
    (initialData?.answer_type as "latex" | "image") || "latex"
  );
  const [answerContent, setAnswerContent] = useState(
    initialData?.answer_content || ""
  );
  const [timerMode, setTimerMode] = useState<
    "1min" | "5min" | "10min" | "llm"
  >((initialData?.timer_mode as "1min" | "5min" | "10min" | "llm") || "5min");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionContent.trim()) return;

    const timerSeconds =
      timerMode === "llm"
        ? 300
        : TIMER_PRESETS[timerMode as keyof typeof TIMER_PRESETS];

    onSave({
      folder_id: initialData?.folder_id || null,
      question_type: questionType,
      question_content: questionContent,
      answer_type: hasAnswer ? answerType : undefined,
      answer_content: hasAnswer ? answerContent : undefined,
      timer_mode: timerMode,
      timer_seconds: timerSeconds,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {/* Question Section */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Question</label>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => setQuestionType("latex")}
            className={`px-3 py-1 text-sm rounded-md border ${
              questionType === "latex"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            LaTeX
          </button>
          <button
            type="button"
            onClick={() => setQuestionType("image")}
            className={`px-3 py-1 text-sm rounded-md border ${
              questionType === "image"
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border hover:bg-muted"
            }`}
          >
            Image
          </button>
        </div>
        {questionType === "latex" ? (
          <textarea
            value={questionContent}
            onChange={(e) => setQuestionContent(e.target.value)}
            placeholder="Enter LaTeX (e.g., \frac{d}{dx} x^2 = 2x)"
            className="w-full h-32 px-3 py-2 border border-border rounded-md bg-background font-mono text-sm resize-y"
          />
        ) : (
          <div className="border border-dashed border-border rounded-md p-8 text-center text-muted-foreground">
            <p className="text-sm">
              Use screenshot capture (Cmd+Shift+M) or import from PDF/image
            </p>
            {questionContent && (
              <p className="mt-2 text-xs">Image: {questionContent}</p>
            )}
          </div>
        )}
      </div>

      {/* Answer Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-medium">Answer</label>
          <span className="text-xs text-muted-foreground">(optional)</span>
          <label className="ml-auto flex items-center gap-1 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={hasAnswer}
              onChange={(e) => setHasAnswer(e.target.checked)}
              className="rounded"
            />
            Include answer
          </label>
        </div>

        {hasAnswer && (
          <>
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setAnswerType("latex")}
                className={`px-3 py-1 text-sm rounded-md border ${
                  answerType === "latex"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                LaTeX
              </button>
              <button
                type="button"
                onClick={() => setAnswerType("image")}
                className={`px-3 py-1 text-sm rounded-md border ${
                  answerType === "image"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                Image
              </button>
            </div>
            {answerType === "latex" ? (
              <textarea
                value={answerContent}
                onChange={(e) => setAnswerContent(e.target.value)}
                placeholder="Enter answer in LaTeX"
                className="w-full h-24 px-3 py-2 border border-border rounded-md bg-background font-mono text-sm resize-y"
              />
            ) : (
              <div className="border border-dashed border-border rounded-md p-8 text-center text-muted-foreground">
                <p className="text-sm">
                  Use screenshot capture or import to add an answer image
                </p>
                {answerContent && (
                  <p className="mt-2 text-xs">Image: {answerContent}</p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Timer Section */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Timer</label>
        <div className="flex gap-2">
          {(["1min", "5min", "10min", "llm"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTimerMode(mode)}
              className={`px-3 py-1 text-sm rounded-md border ${
                timerMode === mode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {mode === "llm" ? "Auto (LLM)" : mode}
            </button>
          ))}
        </div>
        {timerMode === "llm" && (
          <p className="text-xs text-muted-foreground">
            The LLM will estimate how long this question should take based on
            difficulty.
          </p>
        )}
      </div>

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving || !questionContent.trim()}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => history.back()}
          className="px-6 py-2 bg-secondary text-secondary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
