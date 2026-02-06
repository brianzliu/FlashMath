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

async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  const SqlDatabase = (await import("@tauri-apps/plugin-sql")).default;
  dbInstance = await SqlDatabase.load("sqlite:flashmath.db");
  return dbInstance;
}

function generateId(): string {
  return crypto.randomUUID();
}

function nowISO(): string {
  return new Date().toISOString();
}

// --- Folders ---

export async function getFolders(): Promise<Folder[]> {
  const db = await getDb();
  return db.select<Folder[]>(
    "SELECT * FROM folders ORDER BY position ASC, created_at ASC"
  );
}

export async function createFolder(name: string): Promise<Folder> {
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
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
  const db = await getDb();
  await db.execute(
    "UPDATE folders SET name = $1, updated_at = $2 WHERE id = $3",
    [name, nowISO(), id]
  );
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM folders WHERE id = $1", [id]);
}

export async function setFolderDeadline(
  id: string,
  deadline: string | null
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE folders SET deadline = $1, updated_at = $2 WHERE id = $3",
    [deadline, nowISO(), id]
  );
}

// --- Flashcards ---

export async function getFlashcards(folderId?: string): Promise<Flashcard[]> {
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
  const db = await getDb();
  const id = generateId();
  const now = nowISO();
  const timerMode = data.timer_mode || "5min";
  const timerSeconds = data.timer_seconds || 300;

  await db.execute(
    `INSERT INTO flashcards
      (id, folder_id, question_type, question_content, answer_type, answer_content,
       timer_mode, timer_seconds, ease_factor, interval_days, repetitions, due_date,
       created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 2.5, 0, 0, $9, $10, $11)`,
    [
      id,
      data.folder_id || null,
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
  const db = await getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (data.folder_id !== undefined) {
    fields.push(`folder_id = $${paramIdx++}`);
    values.push(data.folder_id);
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
  const db = await getDb();
  await db.execute("DELETE FROM flashcards WHERE id = $1", [id]);
}

export async function moveFlashcard(
  id: string,
  folderId: string
): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE flashcards SET folder_id = $1, updated_at = $2 WHERE id = $3",
    [folderId, nowISO(), id]
  );
}

export async function getDueFlashcards(
  folderId?: string
): Promise<Flashcard[]> {
  const db = await getDb();
  const now = nowISO();
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
  const db = await getDb();

  // Load current card state
  const cards = await db.select<Flashcard[]>(
    "SELECT * FROM flashcards WHERE id = $1",
    [flashcardId]
  );
  if (cards.length === 0) throw new Error("Flashcard not found");
  const card = cards[0];

  // Load folder deadline if applicable
  let deadline: string | null = null;
  if (card.folder_id) {
    const folders = await db.select<Folder[]>(
      "SELECT deadline FROM folders WHERE id = $1",
      [card.folder_id]
    );
    if (folders.length > 0) deadline = folders[0].deadline;
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

  // Update flashcard
  await db.execute(
    `UPDATE flashcards SET
      ease_factor = $1, interval_days = $2, repetitions = $3,
      due_date = $4, last_reviewed = $5, updated_at = $6
     WHERE id = $7`,
    [easeFactor, intervalDays, repetitions, dueDate, now, now, flashcardId]
  );

  // Insert review record
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
  const db = await getDb();
  return db.select<Review[]>(
    "SELECT * FROM reviews WHERE flashcard_id = $1 ORDER BY reviewed_at DESC",
    [flashcardId]
  );
}

export async function getStudyStats(folderId?: string): Promise<StudyStats> {
  const db = await getDb();
  const now = nowISO();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

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
