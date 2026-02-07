use serde::{Deserialize, Serialize};
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub emoji: Option<String>,
    pub position: i32,
    pub deadline: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Flashcard {
    pub id: String,
    pub folder_id: Option<String>,
    pub question_type: String,
    pub question_content: String,
    pub answer_type: Option<String>,
    pub answer_content: Option<String>,
    pub timer_mode: String,
    pub timer_seconds: i32,
    pub ease_factor: f64,
    pub interval_days: f64,
    pub repetitions: i32,
    pub due_date: Option<String>,
    pub last_reviewed: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateFlashcardInput {
    pub folder_id: Option<String>,
    pub question_type: String,
    pub question_content: String,
    pub answer_type: Option<String>,
    pub answer_content: Option<String>,
    pub timer_mode: Option<String>,
    pub timer_seconds: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateFlashcardInput {
    pub folder_id: Option<String>,
    pub question_type: Option<String>,
    pub question_content: Option<String>,
    pub answer_type: Option<String>,
    pub answer_content: Option<String>,
    pub timer_mode: Option<String>,
    pub timer_seconds: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewRecord {
    pub id: String,
    pub flashcard_id: String,
    pub correct: i32,
    pub response_time_seconds: f64,
    pub timer_limit_seconds: f64,
    pub speed_ratio: f64,
    pub quality: i32,
    pub ease_before: f64,
    pub ease_after: f64,
    pub interval_before: f64,
    pub interval_after: f64,
    pub reviewed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewInputCmd {
    pub flashcard_id: String,
    pub correct: bool,
    pub response_time_seconds: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewResultCmd {
    pub quality: i32,
    pub speed_ratio: f64,
    pub ease_factor: f64,
    pub interval_days: f64,
    pub due_date: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyStats {
    pub total_cards: i32,
    pub due_today: i32,
    pub overdue: i32,
    pub reviewed_today: i32,
    pub accuracy_today: f64,
}

pub fn get_migrations() -> Vec<Migration> {
    vec![
    Migration {
        version: 1,
        description: "create initial tables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                position INTEGER DEFAULT 0,
                deadline TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS flashcards (
                id TEXT PRIMARY KEY,
                folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
                question_type TEXT CHECK(question_type IN ('image', 'latex')) NOT NULL,
                question_content TEXT NOT NULL,
                answer_type TEXT CHECK(answer_type IN ('image', 'latex')),
                answer_content TEXT,
                timer_mode TEXT CHECK(timer_mode IN ('1min', '5min', '10min', 'llm')) DEFAULT '5min',
                timer_seconds INTEGER DEFAULT 300,
                ease_factor REAL DEFAULT 2.5,
                interval_days REAL DEFAULT 0,
                repetitions INTEGER DEFAULT 0,
                due_date TEXT,
                last_reviewed TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_flashcards_due ON flashcards(due_date);
            CREATE INDEX IF NOT EXISTS idx_flashcards_folder ON flashcards(folder_id);

            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                flashcard_id TEXT REFERENCES flashcards(id) ON DELETE CASCADE,
                correct INTEGER NOT NULL,
                response_time_seconds REAL,
                timer_limit_seconds REAL,
                speed_ratio REAL,
                quality INTEGER,
                ease_before REAL,
                ease_after REAL,
                interval_before REAL,
                interval_after REAL,
                reviewed_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_reviews_flashcard ON reviews(flashcard_id);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        "#,
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "add emoji column to folders",
        sql: "ALTER TABLE folders ADD COLUMN emoji TEXT;",
        kind: MigrationKind::Up,
    },
    ]
}
