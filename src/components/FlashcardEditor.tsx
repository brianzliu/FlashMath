import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TIMER_PRESETS } from "@/lib/constants";
import type { CreateFlashcardInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { LaTeXRenderer } from "@/components/LaTeXRenderer";
import { ImageDisplay, isImagePath } from "@/components/ImageDisplay";
import { cn } from "@/lib/utils";
import {
  Clock, Image, Type, Camera, FileUp, ImagePlus, X,
  Sparkles, Loader2, ArrowRightLeft, Wand2,
} from "lucide-react";
import * as commands from "@/lib/commands";
import { useAppStore } from "@/stores/app-store";

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
  const [answerType, setAnswerType] = useState<"latex" | "image">(
    (initialData?.answer_type as "latex" | "image") || "latex"
  );
  const [answerContent, setAnswerContent] = useState(
    initialData?.answer_content || ""
  );
  const [timerMode, setTimerMode] = useState<
    "1min" | "5min" | "10min" | "llm" | "custom"
  >((initialData?.timer_mode as "1min" | "5min" | "10min" | "llm" | "custom") || "5min");
  const [customMinutes, setCustomMinutes] = useState(() => {
    if (initialData?.timer_mode === "custom" && initialData?.timer_seconds) {
      return Math.floor(initialData.timer_seconds / 60);
    }
    return 3;
  });
  const [customSeconds, setCustomSeconds] = useState(() => {
    if (initialData?.timer_mode === "custom" && initialData?.timer_seconds) {
      return initialData.timer_seconds % 60;
    }
    return 0;
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const answerFileInputRef = useRef<HTMLInputElement>(null);
  const questionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const answerTextareaRef = useRef<HTMLTextAreaElement>(null);

  // LLM generation states
  const [generatingAnswer, setGeneratingAnswer] = useState(false);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);
  const [convertingQuestion, setConvertingQuestion] = useState(false);
  const [convertingAnswer, setConvertingAnswer] = useState(false);
  const [assessedTime, setAssessedTime] = useState<number | null>(null);
  const [assessingTime, setAssessingTime] = useState(false);

  // AI inline card generation
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const setAiEditorContext = useAppStore((s) => s.setAiEditorContext);
  const setEditorCallbacks = useAppStore((s) => s.setEditorCallbacks);

  // Keep refs for stable callbacks
  const questionContentRef = useRef(questionContent);
  const answerContentRef = useRef(answerContent);
  questionContentRef.current = questionContent;
  answerContentRef.current = answerContent;

  // Register editor callbacks so AI sidebar can write to fields in real time
  useEffect(() => {
    setEditorCallbacks({
      setQuestion: (content: string) => {
        setQuestionType("latex");
        setQuestionContent(content);
      },
      setAnswer: (content: string) => {
        setAnswerType("latex");
        setAnswerContent(content);
      },
      setTimerMode: (mode: string) => {
        setTimerMode(mode as "1min" | "5min" | "10min" | "llm" | "custom");
      },
      setTimerSeconds: (minutes: number, seconds: number) => {
        setTimerMode("custom");
        setCustomMinutes(minutes);
        setCustomSeconds(seconds);
      },
      getQuestion: () => questionContentRef.current,
      getAnswer: () => answerContentRef.current,
    });
    return () => setEditorCallbacks(null);
  }, [setEditorCallbacks]);

  useEffect(() => {
    if (!initialData?.question_content) return;
    const content = initialData.question_content;
    if (isImagePath(content) && !content.startsWith("data:")) {
      commands.getImageAsDataUrl(content).then(setQuestionContent).catch(() => {});
    }
  }, [initialData?.question_content]);

  useEffect(() => {
    if (!initialData?.answer_content) return;
    const content = initialData.answer_content;
    if (isImagePath(content) && !content.startsWith("data:")) {
      commands.getImageAsDataUrl(content).then(setAnswerContent).catch(() => {});
    }
  }, [initialData?.answer_content]);

  // Auto-assess difficulty when timer mode is "llm" and question has content
  useEffect(() => {
    if (timerMode !== "llm" || !questionContent.trim()) {
      setAssessedTime(null);
      return;
    }
    // Only assess for latex questions (image assessment would need a different approach)
    if (questionType !== "latex") {
      setAssessedTime(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setAssessingTime(true);
      try {
        const seconds = await commands.assessDifficulty(questionContent);
        setAssessedTime(seconds);
      } catch {
        setAssessedTime(null);
      } finally {
        setAssessingTime(false);
      }
    }, 1000); // debounce 1 second

    return () => clearTimeout(timeout);
  }, [timerMode, questionContent, questionType]);

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
    if (!questionContent.trim() && !answerContent.trim()) return;

    const aHas = answerContent.trim().length > 0;
    const timerSeconds =
      timerMode === "llm"
        ? (assessedTime || 300)
        : timerMode === "custom"
        ? Math.max(10, customMinutes * 60 + customSeconds)
        : TIMER_PRESETS[timerMode as keyof typeof TIMER_PRESETS];

    onSave({
      folder_id: initialData?.folder_id || null,
      question_type: questionType,
      question_content: questionContent,
      answer_type: aHas ? answerType : undefined,
      answer_content: aHas ? answerContent : undefined,
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

  // --- LLM auto-generate handlers ---

  const handleGenerateAnswer = async () => {
    if (!questionHasContent || generatingAnswer) return;
    setGeneratingAnswer(true);
    try {
      // For image questions, we need to persist the image first so the Rust backend can read it
      let content = questionContent;
      if (questionType === "image" && content.startsWith("data:")) {
        content = await commands.saveImageFromDataUrl(content);
        setQuestionContent(content);
      }
      const result = await commands.generateAnswer(content, questionType);
      if (result) {
        setAnswerType("latex");
        setAnswerContent(result.trim());
      }
    } catch (err) {
      console.error("Failed to generate answer:", err);
    } finally {
      setGeneratingAnswer(false);
    }
  };

  const handleGenerateQuestion = async () => {
    if (!answerHasContent || generatingQuestion) return;
    setGeneratingQuestion(true);
    try {
      let content = answerContent;
      if (answerType === "image" && content.startsWith("data:")) {
        content = await commands.saveImageFromDataUrl(content);
        setAnswerContent(content);
      }
      const result = await commands.generateQuestion(content, answerType);
      if (result) {
        setQuestionType("latex");
        setQuestionContent(result.trim());
      }
    } catch (err) {
      console.error("Failed to generate question:", err);
    } finally {
      setGeneratingQuestion(false);
    }
  };

  const handleConvertToText = async (
    role: "question" | "answer",
  ) => {
    const isQuestion = role === "question";
    const content = isQuestion ? questionContent : answerContent;
    const setContent = isQuestion ? setQuestionContent : setAnswerContent;
    const setType = isQuestion ? setQuestionType : setAnswerType;
    const setConverting = isQuestion ? setConvertingQuestion : setConvertingAnswer;

    if (!content) return;
    setConverting(true);
    try {
      // Persist image first if it's a data URL
      let imagePath = content;
      if (content.startsWith("data:")) {
        imagePath = await commands.saveImageFromDataUrl(content);
      }
      const latex = await commands.convertImageToText(imagePath, role);
      if (latex) {
        setType("latex");
        setContent(latex.trim());
      }
    } catch (err) {
      console.error(`Failed to convert ${role} to text:`, err);
    } finally {
      setConverting(false);
    }
  };

  /** AI inline generate — creates a full Q/A card from a topic/prompt */
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || aiGenerating) return;
    setAiGenerating(true);
    try {
      const prompt = aiPrompt.trim();
      const messages = [
        {
          role: "system",
          content: `You are a flashcard creation assistant for a math study app called FlashMath. Given a topic or prompt, generate ONE flashcard with a question and answer.

IMPORTANT FORMATTING RULES:
- Use plain text for regular words and sentences
- Use $...$ delimiters for inline math (e.g. "What is $\\int_0^1 x^2 \\, dx$?")
- Use $$...$$ for display math on its own line
- NEVER write an entire sentence inside dollar signs
- Mix plain text and math naturally

Respond in this exact JSON format:
{"question": "...", "answer": "..."}

No other text, just the JSON.`,
        },
        { role: "user", content: prompt },
      ];
      const raw = await commands.chatCompletion(messages);
      // Parse response
      const choices = (raw as Record<string, unknown>).choices as Array<{
        message: { content: string };
      }> | undefined;
      const contentBlocks = (raw as Record<string, unknown>).content as Array<{
        type: string;
        text?: string;
      }> | undefined;

      let text = "";
      if (choices?.[0]?.message?.content) {
        text = choices[0].message.content;
      } else if (contentBlocks) {
        text = contentBlocks
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("");
      }

      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.question) {
          setQuestionType("latex");
          setQuestionContent(parsed.question.trim());
        }
        if (parsed.answer) {
          setAnswerType("latex");
          setAnswerContent(parsed.answer.trim());
        }
        setShowAiPrompt(false);
        setAiPrompt("");
      }
    } catch (err) {
      console.error("AI card generation failed:", err);
    } finally {
      setAiGenerating(false);
    }
  };

  // Set editor context on mount and clear on unmount
  useEffect(() => {
    const folders = useAppStore.getState().folders;
    const currentFolderId = folderId || initialData?.folder_id || null;
    const folderName = currentFolderId
      ? folders.find((f) => f.id === currentFolderId)?.name || null
      : null;
    setAiEditorContext({
      folderId: currentFolderId,
      folderName,
      isEditing: Boolean(initialData?.question_content),
    });
    return () => setAiEditorContext(null);
  }, [folderId, initialData?.folder_id, initialData?.question_content, setAiEditorContext]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* AI generate prompt (inline, toggled by wand icon) */}
      {showAiPrompt && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2">
          <Wand2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Describe a card, e.g. 'chain rule example'..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAiGenerate();
              }
              if (e.key === "Escape") {
                setShowAiPrompt(false);
                setAiPrompt("");
              }
            }}
          />
          <button
            type="button"
            onClick={handleAiGenerate}
            disabled={aiGenerating || !aiPrompt.trim()}
            className="rounded-lg p-1.5 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
          >
            {aiGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => { setShowAiPrompt(false); setAiPrompt(""); }}
            className="rounded-lg p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Question */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold">Question</h3>
            {!showAiPrompt && (
              <button
                type="button"
                onClick={() => setShowAiPrompt(true)}
                className="rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Generate card with AI"
              >
                <Wand2 className="h-3.5 w-3.5" />
              </button>
            )}
            {answerHasContent && !questionHasContent && (
              <button
                type="button"
                onClick={handleGenerateQuestion}
                disabled={generatingQuestion}
                className="rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Generate question with AI"
              >
                {generatingQuestion ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
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
              ref={questionTextareaRef}
              value={questionContent}
              onChange={(e) => setQuestionContent(e.target.value)}
              placeholder="Type your question here, e.g. What is the integral of x^2 from 0 to 1?"
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
            onClick={() => !questionContent && fileInputRef.current?.click()}
          >
            {questionContent ? (
              <div className="space-y-3">
                <ImageDisplay
                  src={questionContent}
                  alt="Question"
                  className="max-w-full max-h-48 mx-auto rounded-lg"
                />
                <div className="flex items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConvertToText("question");
                    }}
                    disabled={convertingQuestion}
                  >
                    {convertingQuestion ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {convertingQuestion ? "Converting..." : "Convert to Text"}
                  </Button>
                </div>
              </div>
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

      {/* Answer */}
      <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">Answer</h3>
              {questionHasContent && !answerHasContent && (
                <button
                  type="button"
                  onClick={handleGenerateAnswer}
                  disabled={generatingAnswer}
                  className="rounded-md p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Generate answer with AI"
                >
                  {generatingAnswer ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
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
                ref={answerTextareaRef}
                value={answerContent}
                onChange={(e) => setAnswerContent(e.target.value)}
                placeholder="Type your answer here"
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
              onClick={() => !answerContent && answerFileInputRef.current?.click()}
            >
              {answerContent ? (
                <div className="space-y-3">
                  <ImageDisplay
                    src={answerContent}
                    alt="Answer"
                    className="max-w-full max-h-48 mx-auto rounded-lg"
                  />
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConvertToText("answer");
                      }}
                      disabled={convertingAnswer}
                    >
                      {convertingAnswer ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {convertingAnswer ? "Converting..." : "Convert to Text"}
                    </Button>
                  </div>
                </div>
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

      {/* Timer */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold">Timer</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["1min", "5min", "10min", "custom", "llm"] as const).map((mode) => (
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
              {mode === "llm" ? "Auto (LLM)" : mode === "custom" ? "Custom" : mode}
            </button>
          ))}
        </div>
        {timerMode === "custom" && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={120}
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Math.max(0, Math.min(120, parseInt(e.target.value) || 0)))}
                className="w-14 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-center font-medium outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={59}
                value={customSeconds}
                onChange={(e) => setCustomSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                className="w-14 rounded-lg border border-input bg-background px-2 py-1.5 text-sm text-center font-medium outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
              />
              <span className="text-xs text-muted-foreground">sec</span>
            </div>
            <span className="text-xs text-muted-foreground ml-1">
              = {Math.max(10, customMinutes * 60 + customSeconds)}s total
            </span>
          </div>
        )}
        {timerMode === "llm" && (
          <div className="space-y-1">
            {assessingTime ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Estimating time...
              </p>
            ) : assessedTime ? (
              <p className="text-xs text-muted-foreground">
                Estimated time:{" "}
                <span className="font-bold text-foreground">
                  {assessedTime >= 60
                    ? `${Math.floor(assessedTime / 60)}m ${assessedTime % 60}s`
                    : `${assessedTime}s`}
                </span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The LLM will estimate the time based on question difficulty.
              </p>
            )}
          </div>
        )}
      </section>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={saving || (!questionContent.trim() && !answerContent.trim())}
        >
          {saving ? "Saving..." : "Save Card"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
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
