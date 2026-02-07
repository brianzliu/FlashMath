import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TIMER_PRESETS } from "@/lib/constants";
import type { CreateFlashcardInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LaTeXRenderer } from "@/components/LaTeXRenderer";
import { cn } from "@/lib/utils";
import { Clock, Image, Type, Camera, FileUp, ImagePlus, X } from "lucide-react";

interface FlashcardEditorProps {
  initialData?: Partial<CreateFlashcardInput>;
  onSave: (data: CreateFlashcardInput) => void;
  saving?: boolean;
  onScreenshot?: () => void;
  screenshotImage?: string | null;
  folderId?: string | null;
}

export function FlashcardEditor({
  initialData,
  onSave,
  saving,
  onScreenshot,
  screenshotImage,
  folderId,
}: FlashcardEditorProps) {
  const navigate = useNavigate();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const answerFileInputRef = useRef<HTMLInputElement>(null);

  // Apply screenshot image when it arrives
  if (screenshotImage && questionContent !== screenshotImage) {
    setQuestionType("image");
    setQuestionContent(screenshotImage);
  }

  // Determine if content has been entered (for type locking)
  const questionHasContent = questionContent.trim().length > 0;
  const answerHasContent = answerContent.trim().length > 0;

  const handleClearQuestion = () => {
    setQuestionContent("");
    setQuestionType("latex");
  };

  const handleClearAnswer = () => {
    setAnswerContent("");
    setAnswerType("latex");
  };

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

  const handleImageDrop = (
    e: React.DragEvent,
    setter: (val: string) => void,
    typeSetter: (val: "image") => void
  ) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    typeSetter("image");
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Question */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">Question</h3>
          <div className="flex items-center gap-1.5">
            <TypeToggle
              value={questionType}
              onChange={(t) => setQuestionType(t)}
              lockedTo={questionHasContent ? questionType : undefined}
            />
            {questionHasContent && (
              <button
                type="button"
                onClick={handleClearQuestion}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Clear content"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {questionType === "latex" ? (
          <div className="space-y-2">
            <Textarea
              value={questionContent}
              onChange={(e) => setQuestionContent(e.target.value)}
              placeholder="Enter LaTeX, e.g. \int_0^1 x^2 \, dx"
              className="min-h-[120px] font-mono text-sm"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) =>
                handleImageDrop(e, setQuestionContent, () =>
                  setQuestionType("image")
                )
              }
            />
            {questionContent.trim() && (
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                    Preview
                  </p>
                  <LaTeXRenderer content={questionContent} />
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div
            className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) =>
              handleImageDrop(e, setQuestionContent, () =>
                setQuestionType("image")
              )
            }
            onClick={() => fileInputRef.current?.click()}
          >
            {questionContent ? (
              <img
                src={questionContent}
                alt="Question"
                className="max-w-full max-h-48 mx-auto rounded-lg"
              />
            ) : (
              <div className="space-y-3">
                <Image className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Drop an image here or click to browse
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {onScreenshot && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onScreenshot();
                      }}
                    >
                      <Camera className="h-3.5 w-3.5 mr-1.5" />
                      Screenshot
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/import/pdf${folderId ? `?folderId=${folderId}` : ""}`);
                    }}
                  >
                    <FileUp className="h-3.5 w-3.5 mr-1.5" />
                    Import PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/import/image${folderId ? `?folderId=${folderId}` : ""}`);
                    }}
                  >
                    <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
                    Import Image
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Answer toggle */}
      <div className="flex items-center gap-3 py-1">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hasAnswer}
            onChange={(e) => setHasAnswer(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <span className="text-sm font-medium">Include answer</span>
        </label>
        <Badge variant="secondary" className="text-[10px]">
          Optional
        </Badge>
      </div>

      {/* Answer */}
      {hasAnswer && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Answer</h3>
            <div className="flex items-center gap-1.5">
              <TypeToggle
                value={answerType}
                onChange={(t) => setAnswerType(t)}
                lockedTo={answerHasContent ? answerType : undefined}
              />
              {answerHasContent && (
                <button
                  type="button"
                  onClick={handleClearAnswer}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Clear content"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {answerType === "latex" ? (
            <div className="space-y-2">
              <Textarea
                value={answerContent}
                onChange={(e) => setAnswerContent(e.target.value)}
                placeholder="Enter the answer in LaTeX"
                className="min-h-[100px] font-mono text-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  handleImageDrop(e, setAnswerContent, () =>
                    setAnswerType("image")
                  )
                }
              />
              {answerContent.trim() && (
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                      Preview
                    </p>
                    <LaTeXRenderer content={answerContent} />
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div
              className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) =>
                handleImageDrop(e, setAnswerContent, () =>
                  setAnswerType("image")
                )
              }
              onClick={() => answerFileInputRef.current?.click()}
            >
              {answerContent ? (
                <img
                  src={answerContent}
                  alt="Answer"
                  className="max-w-full max-h-48 mx-auto rounded-lg"
                />
              ) : (
                <div className="space-y-3">
                  <Image className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Drop an image or click to browse
                  </p>
                  {onScreenshot && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onScreenshot();
                      }}
                    >
                      <Camera className="h-3.5 w-3.5 mr-1.5" />
                      Screenshot
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Timer */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold">Timer</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["1min", "5min", "10min", "llm"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTimerMode(mode)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                timerMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {mode === "llm" ? "Auto (LLM)" : mode}
            </button>
          ))}
        </div>
        {timerMode === "llm" && (
          <p className="text-xs text-muted-foreground">
            The LLM will estimate the time based on question difficulty.
          </p>
        )}
      </section>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={saving || !questionContent.trim()}
        >
          {saving ? "Saving..." : "Save Card"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => history.back()}>
          Cancel
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            setQuestionType("image");
            setQuestionContent(reader.result as string);
          };
          reader.readAsDataURL(file);
        }}
      />
      <input
        ref={answerFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            setAnswerType("image");
            setAnswerContent(reader.result as string);
          };
          reader.readAsDataURL(file);
        }}
      />
    </form>
  );
}

function TypeToggle({
  value,
  onChange,
  lockedTo,
}: {
  value: "latex" | "image";
  onChange: (val: "latex" | "image") => void;
  lockedTo?: "latex" | "image";
}) {
  return (
    <div className="flex rounded-lg border border-input overflow-hidden">
      <button
        type="button"
        onClick={() => !lockedTo && onChange("latex")}
        disabled={lockedTo === "image"}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
          value === "latex"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
          lockedTo === "image" && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
        )}
      >
        <Type className="h-3 w-3" />
        LaTeX
      </button>
      <button
        type="button"
        onClick={() => !lockedTo && onChange("image")}
        disabled={lockedTo === "latex"}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
          value === "image"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent",
          lockedTo === "latex" && "opacity-40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground"
        )}
      >
        <Image className="h-3 w-3" />
        Image
      </button>
    </div>
  );
}
