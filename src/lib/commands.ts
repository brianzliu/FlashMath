import type {
  LLMConfig,
  ReviewInput,
} from "./types";
import * as db from "./database";

// Re-export all database operations
export {
  getFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  setFolderEmoji,
  setFolderDeadline,
  getFlashcards,
  getFlashcard,
  createFlashcard,
  updateFlashcard,
  deleteFlashcard,
  moveFlashcard,
  getDueFlashcards,
  getReviewHistory,
  getStudyStats,
} from "./database";

// Review uses the database module's SRS implementation
export async function submitReview(data: ReviewInput) {
  return db.submitReview(
    data.flashcard_id,
    data.correct,
    data.response_time_seconds
  );
}

// --- Native Tauri commands (require Rust backend) ---

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

const LOCAL_LLM_KEY = "flashmath_llm_config_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

// Capture
export const takeScreenshot = () => invoke<string | null>("take_screenshot");
export const cropRegion = (
  imagePath: string,
  x: number,
  y: number,
  width: number,
  height: number
) => invoke<string>("crop_region", { imagePath, x, y, width, height });

// LLM
export const ocrImage = (imagePath: string) =>
  invoke<string>("ocr_image", { imagePath });
export const assessDifficulty = (latex: string) =>
  invoke<number>("assess_difficulty", { latex });

// Files
export const saveImageFromDataUrl = (dataUrl: string) =>
  invoke<string>("save_image_from_data_url", { dataUrl });
export const getImageAsDataUrl = (imagePath: string) =>
  invoke<string>("get_image_as_data_url", { imagePath });

// Settings (LLM config stored via Rust/file system)
export const getLLMConfig = async () => {
  try {
    return await invoke<LLMConfig>("get_llm_config");
  } catch (err) {
    if (!isBrowser()) throw err;
    const raw = window.localStorage.getItem(LOCAL_LLM_KEY);
    if (!raw) throw err;
    return JSON.parse(raw) as LLMConfig;
  }
};

export const setLLMConfig = async (config: LLMConfig) => {
  try {
    await invoke<void>("set_llm_config", { config });
  } catch (err) {
    if (!isBrowser()) throw err;
    window.localStorage.setItem(LOCAL_LLM_KEY, JSON.stringify(config));
  }
};
