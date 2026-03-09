import type { Flashcard, Folder } from "./types";

export const DEFAULT_REVIEW_CARDS_PER_DAY = 20;
export const DEFAULT_AUTO_TARGET_REPS = 3;

export function sanitizeReviewCardsPerDay(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_REVIEW_CARDS_PER_DAY;
  }
  return Math.max(1, Math.round(value as number));
}

export function sanitizeAutoTargetReps(value: number | null | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_AUTO_TARGET_REPS;
  }
  return Math.min(10, Math.max(1, Math.round(value as number)));
}

export function getFolderReviewMode(
  folder: Pick<Folder, "review_target_mode"> | null | undefined
): Folder["review_target_mode"] {
  return folder?.review_target_mode === "dynamic" ? "dynamic" : "fixed";
}

export function getDaysRemaining(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  const target = new Date(`${deadline}T23:59:59`);
  const diffMs = target.getTime() - Date.now();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 1;
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

function getReviewsNeededForMastery(card: Flashcard, targetReps: number): number {
  if (card.repetitions >= targetReps || card.interval_days >= 7) {
    return 0;
  }
  return Math.max(0, targetReps - card.repetitions);
}

export function calculateDynamicDailyReviewTarget(
  folder: Pick<
    Folder,
    "deadline" | "review_cards_per_day" | "review_target_mode" | "auto_target_reps"
  > | null | undefined,
  cards: Flashcard[]
): number {
  const fallback = sanitizeReviewCardsPerDay(folder?.review_cards_per_day);
  const daysRemaining = getDaysRemaining(folder?.deadline);
  const targetReps = sanitizeAutoTargetReps(folder?.auto_target_reps);
  if (!daysRemaining) {
    return fallback;
  }

  const remainingReviews = cards.reduce(
    (total, card) => total + getReviewsNeededForMastery(card, targetReps),
    0
  );

  if (remainingReviews === 0) {
    const dueBacklog = cards.filter(
      (card) => !card.due_date || new Date(card.due_date) <= new Date()
    ).length;
    return dueBacklog === 0
      ? 0
      : Math.max(1, Math.ceil(dueBacklog / Math.min(daysRemaining, 7)));
  }

  const dueBacklog = cards.filter(
    (card) => !card.due_date || new Date(card.due_date) <= new Date()
  ).length;
  const baseTarget = Math.max(1, Math.ceil(remainingReviews / daysRemaining));
  const dueBacklogTarget =
    dueBacklog === 0
      ? 0
      : Math.max(1, Math.ceil(dueBacklog / Math.min(daysRemaining, 7)));

  return Math.max(baseTarget, dueBacklogTarget);
}

export function getEffectiveDailyReviewLimit(
  folder: Pick<
    Folder,
    "deadline" | "review_cards_per_day" | "review_target_mode" | "auto_target_reps"
  > | null | undefined,
  cards: Flashcard[]
): number {
  if (getFolderReviewMode(folder) === "dynamic") {
    return calculateDynamicDailyReviewTarget(folder, cards);
  }
  return sanitizeReviewCardsPerDay(folder?.review_cards_per_day);
}

export function getScheduledDueCards(
  dueCards: Flashcard[],
  folders: Folder[],
  allCards: Flashcard[] = dueCards
): Flashcard[] {
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const cardsByFolder = new Map<string, Flashcard[]>();
  const allCardsByFolder = new Map<string, Flashcard[]>();

  for (const card of dueCards) {
    const key = card.folder_id ?? "__unassigned__";
    const group = cardsByFolder.get(key);
    if (group) {
      group.push(card);
    } else {
      cardsByFolder.set(key, [card]);
    }
  }

  for (const card of allCards) {
    const key = card.folder_id ?? "__unassigned__";
    const group = allCardsByFolder.get(key);
    if (group) {
      group.push(card);
    } else {
      allCardsByFolder.set(key, [card]);
    }
  }

  const scheduled: Flashcard[] = [];
  for (const [key, cards] of cardsByFolder.entries()) {
    const folder = key === "__unassigned__" ? null : folderMap.get(key) ?? null;
    const limit = getEffectiveDailyReviewLimit(
      folder,
      allCardsByFolder.get(key) ?? cards
    );
    // Prioritize new cards (never reviewed) first, then overdue by oldest due date
    const newCards = cards.filter((c) => c.repetitions === 0);
    const reviewedCards = cards
      .filter((c) => c.repetitions > 0)
      .sort((a, b) => {
        const dueA = a.due_date ? new Date(a.due_date).getTime() : 0;
        const dueB = b.due_date ? new Date(b.due_date).getTime() : 0;
        return dueA - dueB;
      });
    scheduled.push(...[...newCards, ...reviewedCards].slice(0, limit));
  }

  return scheduled.sort((a, b) => {
    // Keep new cards first, then sort reviewed cards by due date
    if (a.repetitions === 0 && b.repetitions > 0) return -1;
    if (a.repetitions > 0 && b.repetitions === 0) return 1;
    const dueA = a.due_date ? new Date(a.due_date).getTime() : 0;
    const dueB = b.due_date ? new Date(b.due_date).getTime() : 0;
    return dueA - dueB;
  });
}
