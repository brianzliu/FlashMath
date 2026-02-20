import type {
  Folder,
  Flashcard,
  CreateFlashcardInput,
  UpdateFlashcardInput,
  Review,
  StudyStats,
} from "./types";

import type Database from "@tauri-apps/plugin-sql";

let dbInstance: Database | null = null;
let dbMode: "sql" | "local" | null = null;
const LOCAL_STORAGE_KEY = "flashmath_local_db_v1";

interface LocalDb {
  folders: Folder[];
  flashcards: Flashcard[];
  reviews: Review[];
  settings: Record<string, string>;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isTauriRuntime(): boolean {
  if (!isBrowser()) return false;
  return (
    "__TAURI_INTERNALS__" in window ||
    "__TAURI__" in window
  );
}

function getLocalDb(): LocalDb {
  if (!isBrowser()) {
    return { folders: [], flashcards: [], reviews: [], settings: {} };
  }
  const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!raw) {
    return { folders: [], flashcards: [], reviews: [], settings: {} };
  }
  try {
    const parsed = JSON.parse(raw) as LocalDb;
    return {
      folders: parsed.folders ?? [],
      flashcards: parsed.flashcards ?? [],
      reviews: parsed.reviews ?? [],
      settings: parsed.settings ?? {},
    };
  } catch {
    return { folders: [], flashcards: [], reviews: [], settings: {} };
  }
}

function saveLocalDb(db: LocalDb) {
  if (!isBrowser()) return;
  window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
}

async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  const SqlDatabase = (await import("@tauri-apps/plugin-sql")).default;
  dbInstance = await SqlDatabase.load("sqlite:flashmath.db");
  return dbInstance;
}

async function useLocalMode(): Promise<boolean> {
  if (dbMode) return dbMode === "local";
  try {
    await getDb();
    dbMode = "sql";
    return false;
  } catch (err) {
    // In the desktop app we should never silently fall back to browser localStorage,
    // because that can make real SQL data look like it vanished.
    if (isTauriRuntime()) {
      dbMode = null;
      throw err;
    }
    dbMode = "local";
    return true;
  }
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// --- Folders ---

export async function getFolders(): Promise<Folder[]> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    return [...localDb.folders].sort((a, b) => {
      if (a.position !== b.position) return a.position - b.position;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }
  const db = await getDb();
  return db.select<Folder[]>(
    "SELECT * FROM folders ORDER BY position ASC, created_at ASC"
  );
}

export async function createFolder(name: string): Promise<Folder> {
  const id = generateId();
  const now = nowISO();
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    const folder: Folder = {
      id,
      name,
      emoji: null,
      position: 0,
      deadline: null,
      created_at: now,
      updated_at: now,
    };
    localDb.folders.push(folder);
    saveLocalDb(localDb);
    return folder;
  }
  const db = await getDb();
  await db.execute(
    "INSERT INTO folders (id, name, position, created_at, updated_at) VALUES ($1, $2, 0, $3, $4)",
    [id, name, now, now]
  );
  const rows = await db.select<Folder[]>(
    "SELECT * FROM folders WHERE id = $1",
    [id]
  );
  return rows[0];
}

export async function renameFolder(id: string, name: string): Promise<void> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.folders = localDb.folders.map((folder) =>
      folder.id === id
        ? { ...folder, name, updated_at: nowISO() }
        : folder
    );
    saveLocalDb(localDb);
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE folders SET name = $1, updated_at = $2 WHERE id = $3",
    [name, nowISO(), id]
  );
}

export async function deleteFolder(id: string): Promise<void> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.folders = localDb.folders.filter((folder) => folder.id !== id);
    localDb.flashcards = localDb.flashcards.map((card) =>
      card.folder_id === id ? { ...card, folder_id: null } : card
    );
    saveLocalDb(localDb);
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM folders WHERE id = $1", [id]);
}

export async function setFolderEmoji(
  id: string,
  emoji: string | null
): Promise<void> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.folders = localDb.folders.map((folder) =>
      folder.id === id
        ? { ...folder, emoji, updated_at: nowISO() }
        : folder
    );
    saveLocalDb(localDb);
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE folders SET emoji = $1, updated_at = $2 WHERE id = $3",
    [emoji, nowISO(), id]
  );
}

export async function setFolderDeadline(
  id: string,
  deadline: string | null
): Promise<void> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.folders = localDb.folders.map((folder) =>
      folder.id === id
        ? { ...folder, deadline, updated_at: nowISO() }
        : folder
    );
    saveLocalDb(localDb);
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE folders SET deadline = $1, updated_at = $2 WHERE id = $3",
    [deadline, nowISO(), id]
  );
}

// --- Flashcards ---

export async function getFlashcards(folderId?: string): Promise<Flashcard[]> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    const cards = folderId
      ? localDb.flashcards.filter((card) => card.folder_id === folderId)
      : localDb.flashcards;
    return [...cards].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }
  const db = await getDb();
  if (folderId) {
    return db.select<Flashcard[]>(
      "SELECT * FROM flashcards WHERE folder_id = $1 ORDER BY created_at DESC",
      [folderId]
    );
  }
  return db.select<Flashcard[]>(
    "SELECT * FROM flashcards ORDER BY created_at DESC"
  );
}

export async function getFlashcard(id: string): Promise<Flashcard> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    const card = localDb.flashcards.find((item) => item.id === id);
    if (!card) throw new Error("Flashcard not found");
    return card;
  }
  const db = await getDb();
  const rows = await db.select<Flashcard[]>(
    "SELECT * FROM flashcards WHERE id = $1",
    [id]
  );
  if (rows.length === 0) throw new Error("Flashcard not found");
  return rows[0];
}

export async function createFlashcard(
  data: CreateFlashcardInput
): Promise<Flashcard> {
  const id = generateId();
  const now = nowISO();
  const timerMode = data.timer_mode || "5min";
  const timerSeconds = data.timer_seconds || 300;

  if (await useLocalMode()) {
    const localDb = getLocalDb();
    const card: Flashcard = {
      id,
      folder_id: data.folder_id || null,
      title: data.title ?? null,
      question_type: data.question_type,
      question_content: data.question_content,
      answer_type: data.answer_type ?? null,
      answer_content: data.answer_content ?? null,
      timer_mode: timerMode,
      timer_seconds: timerSeconds,
      ease_factor: 2.5,
      interval_days: 0,
      repetitions: 0,
      due_date: now,
      last_reviewed: null,
      created_at: now,
      updated_at: now,
    };
    localDb.flashcards.push(card);
    saveLocalDb(localDb);
    return card;
  }
  const db = await getDb();
  await db.execute(
    `INSERT INTO flashcards
      (id, folder_id, title, question_type, question_content, answer_type, answer_content,
       timer_mode, timer_seconds, ease_factor, interval_days, repetitions, due_date,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 2.5, 0, 0, $10, $11, $12)`,
    [
      id,
      data.folder_id || null,
      data.title ?? null,
      data.question_type,
      data.question_content,
      data.answer_type || null,
      data.answer_content || null,
      timerMode,
      timerSeconds,
      now, // due_date = now (immediately due)
      now,
      now,
    ]
  );

  const rows = await db.select<Flashcard[]>(
    "SELECT * FROM flashcards WHERE id = $1",
    [id]
  );
  return rows[0];
}

export async function updateFlashcard(
  id: string,
  data: UpdateFlashcardInput
): Promise<void> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.flashcards = localDb.flashcards.map((card) =>
      card.id === id
        ? {
            ...card,
            ...data,
            title:
              data.title !== undefined ? data.title : card.title,
            answer_type:
              data.answer_type !== undefined ? data.answer_type : card.answer_type,
            answer_content:
              data.answer_content !== undefined
                ? data.answer_content
                : card.answer_content,
            updated_at: nowISO(),
          }
        : card
    );
    saveLocalDb(localDb);
    return;
  }
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (data.folder_id !== undefined) {
    fields.push(`folder_id = $${paramIdx++}`);
    values.push(data.folder_id);
  }
  if (data.title !== undefined) {
    fields.push(`title = $${paramIdx++}`);
    values.push(data.title);
  }
  if (data.question_type !== undefined) {
    fields.push(`question_type = $${paramIdx++}`);
    values.push(data.question_type);
  }
  if (data.question_content !== undefined) {
    fields.push(`question_content = $${paramIdx++}`);
    values.push(data.question_content);
  }
  if (data.answer_type !== undefined) {
    fields.push(`answer_type = $${paramIdx++}`);
    values.push(data.answer_type);
  }
  if (data.answer_content !== undefined) {
    fields.push(`answer_content = $${paramIdx++}`);
    values.push(data.answer_content);
  }
  if (data.timer_mode !== undefined) {
    fields.push(`timer_mode = $${paramIdx++}`);
    values.push(data.timer_mode);
  }
  if (data.timer_seconds !== undefined) {
    fields.push(`timer_seconds = $${paramIdx++}`);
    values.push(data.timer_seconds);
  }

  if (fields.length === 0) return;

  fields.push(`updated_at = $${paramIdx++}`);
  values.push(nowISO());
  values.push(id);

  await db.execute(
    `UPDATE flashcards SET ${fields.join(", ")} WHERE id = $${paramIdx}`,
    values
  );
}

export async function deleteFlashcard(id: string): Promise<void> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.flashcards = localDb.flashcards.filter((card) => card.id !== id);
    localDb.reviews = localDb.reviews.filter(
      (review) => review.flashcard_id !== id
    );
    saveLocalDb(localDb);
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM flashcards WHERE id = $1", [id]);
}

export async function moveFlashcard(
  id: string,
  folderId: string
): Promise<void> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.flashcards = localDb.flashcards.map((card) =>
      card.id === id
        ? { ...card, folder_id: folderId, updated_at: nowISO() }
        : card
    );
    saveLocalDb(localDb);
    return;
  }
  const db = await getDb();
  await db.execute(
    "UPDATE flashcards SET folder_id = $1, updated_at = $2 WHERE id = $3",
    [folderId, nowISO(), id]
  );
}

export async function getDueFlashcards(
  folderId?: string
): Promise<Flashcard[]> {
  const now = nowISO();
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    const cards = folderId
      ? localDb.flashcards.filter((card) => card.folder_id === folderId)
      : localDb.flashcards;
    return cards
      .filter((card) => !card.due_date || card.due_date <= now)
      .sort((a, b) => {
        const dueA = a.due_date ? new Date(a.due_date).getTime() : 0;
        const dueB = b.due_date ? new Date(b.due_date).getTime() : 0;
        return dueA - dueB;
      });
  }
  const db = await getDb();
  if (folderId) {
    return db.select<Flashcard[]>(
      `SELECT * FROM flashcards
       WHERE folder_id = $1 AND (due_date IS NULL OR due_date <= $2)
       ORDER BY due_date ASC`,
      [folderId, now]
    );
  }
  return db.select<Flashcard[]>(
    `SELECT * FROM flashcards
     WHERE due_date IS NULL OR due_date <= $1
     ORDER BY due_date ASC`,
    [now]
  );
}

// --- Reviews ---

export async function submitReview(
  flashcardId: string,
  correct: boolean,
  responseTimeSeconds: number
): Promise<{
  quality: number;
  speed_ratio: number;
  ease_factor: number;
  interval_days: number;
  due_date: string;
}> {
  let card: Flashcard;
  let deadline: string | null = null;
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    const found = localDb.flashcards.find((item) => item.id === flashcardId);
    if (!found) throw new Error("Flashcard not found");
    card = found;
    if (card.folder_id) {
      deadline =
        localDb.folders.find((folder) => folder.id === card.folder_id)
          ?.deadline || null;
    }
  } else {
    const db = await getDb();
    const cards = await db.select<Flashcard[]>(
      "SELECT * FROM flashcards WHERE id = $1",
      [flashcardId]
    );
    if (cards.length === 0) throw new Error("Flashcard not found");
    card = cards[0];
    if (card.folder_id) {
      const folders = await db.select<Folder[]>(
        "SELECT deadline FROM folders WHERE id = $1",
        [card.folder_id]
      );
      if (folders.length > 0) deadline = folders[0].deadline;
    }
  }

  // Calculate SRS
  const speedRatio =
    card.timer_seconds > 0 ? responseTimeSeconds / card.timer_seconds : 1.0;

  let easeFactor = card.ease_factor;
  let intervalDays: number;
  let repetitions = card.repetitions;
  let quality: number;
  const MIN_EASE = 1.3;

  if (!correct) {
    quality = 0;
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.2);
    repetitions = 0;
    intervalDays = 1;
  } else if (speedRatio <= 0.6) {
    quality = 5;
    easeFactor += 0.15;
    repetitions += 1;
    intervalDays = nextInterval(repetitions, card.interval_days, easeFactor, 1.3);
  } else if (speedRatio <= 1.0) {
    quality = 4;
    easeFactor += 0.05;
    repetitions += 1;
    intervalDays = nextInterval(repetitions, card.interval_days, easeFactor, 1.0);
  } else {
    quality = 3;
    easeFactor = Math.max(MIN_EASE, easeFactor - 0.1);
    repetitions += 1;
    intervalDays = nextInterval(repetitions, card.interval_days, easeFactor, 0.8);
  }

  easeFactor = Math.max(MIN_EASE, easeFactor);

  // Apply deadline compression
  if (deadline) {
    const daysRemaining = Math.max(
      0,
      (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysRemaining > 0) {
      const reviewsStillNeeded = Math.max(1, 6 - repetitions);
      const maxInterval = daysRemaining / reviewsStillNeeded;
      intervalDays = Math.max(1, Math.min(intervalDays, maxInterval));
    }
  }

  const dueDate = new Date(
    Date.now() + Math.round(intervalDays) * 24 * 60 * 60 * 1000
  ).toISOString();
  const now = nowISO();

  if (await useLocalMode()) {
    const localDb = getLocalDb();
    localDb.flashcards = localDb.flashcards.map((item) =>
      item.id === flashcardId
        ? {
            ...item,
            ease_factor: easeFactor,
            interval_days: intervalDays,
            repetitions,
            due_date: dueDate,
            last_reviewed: now,
            updated_at: now,
          }
        : item
    );
    localDb.reviews.push({
      id: generateId(),
      flashcard_id: flashcardId,
      correct,
      response_time_seconds: responseTimeSeconds,
      timer_limit_seconds: card.timer_seconds,
      speed_ratio: speedRatio,
      quality,
      ease_before: card.ease_factor,
      ease_after: easeFactor,
      interval_before: card.interval_days,
      interval_after: intervalDays,
      reviewed_at: now,
    });
    saveLocalDb(localDb);
  } else {
    const db = await getDb();
    await db.execute(
      `UPDATE flashcards SET
        ease_factor = $1, interval_days = $2, repetitions = $3,
        due_date = $4, last_reviewed = $5, updated_at = $6
       WHERE id = $7`,
      [easeFactor, intervalDays, repetitions, dueDate, now, now, flashcardId]
    );
    const reviewId = generateId();
    await db.execute(
      `INSERT INTO reviews
        (id, flashcard_id, correct, response_time_seconds, timer_limit_seconds,
         speed_ratio, quality, ease_before, ease_after, interval_before, interval_after, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        reviewId,
        flashcardId,
        correct ? 1 : 0,
        responseTimeSeconds,
        card.timer_seconds,
        speedRatio,
        quality,
        card.ease_factor,
        easeFactor,
        card.interval_days,
        intervalDays,
        now,
      ]
    );
  }

  return {
    quality,
    speed_ratio: speedRatio,
    ease_factor: easeFactor,
    interval_days: intervalDays,
    due_date: dueDate,
  };
}

function nextInterval(
  reps: number,
  prevInterval: number,
  ease: number,
  speedMultiplier: number
): number {
  if (reps <= 1) return 1;
  if (reps === 2) return 3;
  return Math.max(1, prevInterval * ease * speedMultiplier);
}

export async function getReviewHistory(
  flashcardId: string
): Promise<Review[]> {
  if (await useLocalMode()) {
    const localDb = getLocalDb();
    return localDb.reviews
      .filter((review) => review.flashcard_id === flashcardId)
      .sort(
        (a, b) =>
          new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime()
      );
  }
  const db = await getDb();
  return db.select<Review[]>(
    "SELECT * FROM reviews WHERE flashcard_id = $1 ORDER BY reviewed_at DESC",
    [flashcardId]
  );
}

export async function getStudyStats(folderId?: string): Promise<StudyStats> {
  const now = nowISO();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  if (await useLocalMode()) {
    const localDb = getLocalDb();
    const cards = folderId
      ? localDb.flashcards.filter((card) => card.folder_id === folderId)
      : localDb.flashcards;
    const totalCards = cards.length;
    const dueToday = cards.filter(
      (card) => !card.due_date || card.due_date <= now
    ).length;
    const reviewedToday = localDb.reviews.filter(
      (review) => review.reviewed_at >= todayISO
    ).length;
    const correctToday = localDb.reviews.filter(
      (review) => review.reviewed_at >= todayISO && review.correct
    ).length;
    return {
      total_cards: totalCards,
      due_today: dueToday,
      overdue: dueToday,
      reviewed_today: reviewedToday,
      accuracy_today: reviewedToday > 0 ? correctToday / reviewedToday : 0,
    };
  }

  const db = await getDb();
  let totalCards: number;
  let dueToday: number;

  if (folderId) {
    const tcRows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM flashcards WHERE folder_id = $1",
      [folderId]
    );
    totalCards = tcRows[0]?.count || 0;

    const dtRows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM flashcards WHERE folder_id = $1 AND (due_date IS NULL OR due_date <= $2)",
      [folderId, now]
    );
    dueToday = dtRows[0]?.count || 0;
  } else {
    const tcRows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM flashcards"
    );
    totalCards = tcRows[0]?.count || 0;

    const dtRows = await db.select<{ count: number }[]>(
      "SELECT COUNT(*) as count FROM flashcards WHERE due_date IS NULL OR due_date <= $1",
      [now]
    );
    dueToday = dtRows[0]?.count || 0;
  }

  const reviewedRows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM reviews WHERE reviewed_at >= $1",
    [todayISO]
  );
  const reviewedToday = reviewedRows[0]?.count || 0;

  const correctRows = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM reviews WHERE reviewed_at >= $1 AND correct = 1",
    [todayISO]
  );
  const correctToday = correctRows[0]?.count || 0;

  return {
    total_cards: totalCards,
    due_today: dueToday,
    overdue: dueToday, // For now, same as due
    reviewed_today: reviewedToday,
    accuracy_today: reviewedToday > 0 ? correctToday / reviewedToday : 0,
  };
}
