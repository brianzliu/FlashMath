import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import type { Flashcard, Folder } from "@/lib/types";
import {
  calculateDynamicDailyReviewTarget,
  DEFAULT_AUTO_TARGET_REPS,
  DEFAULT_REVIEW_CARDS_PER_DAY,
  getDaysRemaining,
  getEffectiveDailyReviewLimit,
  getFolderReviewMode,
  sanitizeAutoTargetReps,
  sanitizeReviewCardsPerDay,
} from "@/lib/review-policy";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save } from "lucide-react";

export default function FolderOptionsPage() {
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("id") || "";
  const { folders, setFolders, updateFolder } = useAppStore();
  const [folder, setFolder] = useState<Folder | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [deadlineInput, setDeadlineInput] = useState("");
  const [reviewCardsInput, setReviewCardsInput] = useState(
    String(DEFAULT_REVIEW_CARDS_PER_DAY)
  );
  const [autoTargetRepsInput, setAutoTargetRepsInput] = useState(
    String(DEFAULT_AUTO_TARGET_REPS)
  );
  const [dynamicReviewTarget, setDynamicReviewTarget] = useState(false);

  const loadData = useCallback(async () => {
    if (!folderId) {
      setLoading(false);
      return;
    }

    try {
      const loadedFolders =
        folders.length > 0 ? folders : await commands.getFolders();
      if (folders.length === 0) {
        setFolders(loadedFolders);
      }

      const matchedFolder =
        loadedFolders.find((item) => item.id === folderId) || null;
      setFolder(matchedFolder);

      const cards = await commands.getFlashcards(folderId);
      setFlashcards(cards);
    } catch {
      setFolder(null);
    } finally {
      setLoading(false);
    }
  }, [folderId, folders, setFolders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!folder) return;
    setDeadlineInput(folder.deadline ?? "");
    setReviewCardsInput(
      String(sanitizeReviewCardsPerDay(folder.review_cards_per_day))
    );
    setAutoTargetRepsInput(
      String(sanitizeAutoTargetReps(folder.auto_target_reps))
    );
    setDynamicReviewTarget(getFolderReviewMode(folder) === "dynamic");
  }, [folder]);

  const previewFolder = useMemo(() => {
    if (!folder) return null;
    return {
      ...folder,
      deadline: deadlineInput || null,
      review_cards_per_day: sanitizeReviewCardsPerDay(Number(reviewCardsInput)),
      review_target_mode: dynamicReviewTarget ? "dynamic" : "fixed",
      auto_target_reps: sanitizeAutoTargetReps(Number(autoTargetRepsInput)),
    };
  }, [autoTargetRepsInput, deadlineInput, dynamicReviewTarget, folder, reviewCardsInput]);

  const dueCount = flashcards.filter(
    (card) => !card.due_date || new Date(card.due_date) <= new Date()
  ).length;
  const masteredCount = flashcards.filter((card) => card.interval_days >= 7).length;
  const dynamicRecommendation = calculateDynamicDailyReviewTarget(
    previewFolder,
    flashcards
  );
  const effectiveDailyLimit = getEffectiveDailyReviewLimit(
    previewFolder,
    flashcards
  );
  const daysRemaining = getDaysRemaining(previewFolder?.deadline);

  const handleSave = async () => {
    if (!folder || !previewFolder) return;
    setSaving(true);
    try {
      await commands.setFolderDeadline(folder.id, previewFolder.deadline);
      await commands.setFolderReviewSettings(
        folder.id,
        previewFolder.review_cards_per_day,
        previewFolder.review_target_mode,
        previewFolder.auto_target_reps
      );

      updateFolder(folder.id, {
        deadline: previewFolder.deadline,
        review_cards_per_day: previewFolder.review_cards_per_day,
        review_target_mode: previewFolder.review_target_mode,
        auto_target_reps: previewFolder.auto_target_reps,
      });
      setFolder(previewFolder);
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <p className="py-8 text-center text-muted-foreground">Loading options...</p>
    );
  }

  if (!folder || !previewFolder) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Deck not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            to={`/folder?id=${folder.id}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to deck
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{folder.name}</h1>
            <p className="text-sm text-muted-foreground">Options</p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        <SectionHeader
          title="Review Plan"
          description="Scheduling controls for this deck."
        />
        <SettingsRow
          title="Automatic pacing"
          description="Spread review work across the remaining days until the deadline."
          control={
            <Switch
              checked={dynamicReviewTarget}
              onCheckedChange={setDynamicReviewTarget}
            />
          }
        />
        <Separator />
        <SettingsRow
          title="Manual cards per day"
          description="Used directly in manual mode, and as a fallback when no deadline is set."
          control={
            <Input
              type="number"
              min={1}
              step={1}
              value={reviewCardsInput}
              onChange={(e) => setReviewCardsInput(e.target.value)}
              className="w-full sm:w-28"
            />
          }
        />
        <Separator />
        <SettingsRow
          title="Automatic target repetitions"
          description="How many successful repetitions each card should aim for when computing the automatic daily target."
          control={
            <Input
              type="number"
              min={1}
              max={10}
              step={1}
              value={autoTargetRepsInput}
              onChange={(e) => setAutoTargetRepsInput(e.target.value)}
              className="w-full sm:w-28"
            />
          }
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        <SectionHeader
          title="Deadline"
          description="Optional. Automatic pacing uses this date to spread the review load."
        />
        <SettingsRow
          title="Due date"
          description={
            previewFolder.deadline
              ? `${formatDate(previewFolder.deadline)}${daysRemaining ? `, ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining` : ""}`
              : "No deadline set."
          }
          control={
            <Input
              type="date"
              value={deadlineInput}
              onChange={(e) => setDeadlineInput(e.target.value)}
              className="w-full sm:w-44"
            />
          }
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        <SectionHeader
          title="Preview"
          description="Current output from these settings."
        />
        <SettingsValueRow
          label="Current due cards"
          value={String(dueCount)}
        />
        <Separator />
        <SettingsValueRow
          label="Mastered cards"
          value={`${masteredCount}/${flashcards.length}`}
        />
        <Separator />
        <SettingsValueRow
          label="Automatic recommendation"
          value={`${dynamicRecommendation} cards/day`}
        />
        <Separator />
        <SettingsValueRow
          label="Effective daily target"
          value={`${effectiveDailyLimit} cards/day`}
          muted={!dynamicReviewTarget}
        />
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="px-5 py-4 sm:px-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingsRow({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-start md:justify-between md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="w-full md:w-auto md:min-w-[7rem]">{control}</div>
    </div>
  );
}

function SettingsValueRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4 text-sm sm:px-6 md:flex-row md:items-center md:justify-between md:gap-6">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-medium",
          muted && "text-muted-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}
