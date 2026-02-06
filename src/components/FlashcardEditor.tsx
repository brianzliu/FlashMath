"use client";

import { useState } from "react";
import { TIMER_PRESETS } from "@/lib/constants";
import type { CreateFlashcardInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Question Section */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Question</label>
            <div className="flex gap-2">
              {(["latex", "image"] as const).map((type) => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={questionType === type ? "default" : "outline"}
                  onClick={() => setQuestionType(type)}
                >
                  {type === "latex" ? "LaTeX" : "Image"}
                </Button>
              ))}
            </div>
          </div>
          {questionType === "latex" ? (
            <Textarea
              value={questionContent}
              onChange={(e) => setQuestionContent(e.target.value)}
              placeholder="Enter LaTeX (e.g., \frac{d}{dx} x^2 = 2x)"
              className="min-h-[140px] font-mono"
            />
          ) : (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-muted-foreground">
              <p className="text-sm">
                Use screenshot capture (Cmd+Shift+M) or import from PDF/image
              </p>
              {questionContent && (
                <p className="mt-2 text-xs">Image: {questionContent}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Answer Section */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium">Answer</label>
            <Badge variant="secondary">Optional</Badge>
            <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={hasAnswer}
                onChange={(e) => setHasAnswer(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Include answer
            </label>
          </div>

          {hasAnswer && (
            <>
              <div className="flex gap-2">
                {(["latex", "image"] as const).map((type) => (
                  <Button
                    key={type}
                    type="button"
                    size="sm"
                    variant={answerType === type ? "default" : "outline"}
                    onClick={() => setAnswerType(type)}
                  >
                    {type === "latex" ? "LaTeX" : "Image"}
                  </Button>
                ))}
              </div>
              {answerType === "latex" ? (
                <Textarea
                  value={answerContent}
                  onChange={(e) => setAnswerContent(e.target.value)}
                  placeholder="Enter answer in LaTeX"
                  className="min-h-[110px] font-mono"
                />
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/30 p-8 text-center text-muted-foreground">
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
        </CardContent>
      </Card>

      {/* Timer Section */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <label className="block text-sm font-medium">Timer</label>
          <div className="flex flex-wrap gap-2">
            {(["1min", "5min", "10min", "llm"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                size="sm"
                variant={timerMode === mode ? "default" : "outline"}
                onClick={() => setTimerMode(mode)}
              >
                {mode === "llm" ? "Auto (LLM)" : mode}
              </Button>
            ))}
          </div>
          {timerMode === "llm" && (
            <p className="text-xs text-muted-foreground">
              The LLM will estimate how long this question should take based on
              difficulty.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={saving || !questionContent.trim()}
          className={cn(saving ? "opacity-80" : "")}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
