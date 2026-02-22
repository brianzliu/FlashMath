import { create } from "zustand";
import type { Folder, Flashcard, LLMConfig } from "@/lib/types";

interface AppState {
  folders: Folder[];
  setFolders: (folders: Folder[]) => void;
  addFolder: (folder: Folder) => void;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  removeFolder: (id: string) => void;

  flashcards: Flashcard[];
  setFlashcards: (flashcards: Flashcard[]) => void;
  addFlashcard: (flashcard: Flashcard) => void;
  updateFlashcard: (id: string, updates: Partial<Flashcard>) => void;
  removeFlashcard: (id: string) => void;

  llmConfig: LLMConfig | null;
  setLLMConfig: (config: LLMConfig | null) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Screenshot capture state: data URL of a pending screenshot to use in card creation
  pendingScreenshot: string | null;
  setPendingScreenshot: (dataUrl: string | null) => void;

  // AI chat panel
  aiPanelOpen: boolean;
  setAiPanelOpen: (open: boolean) => void;

  // AI editor context — lets the chat panel know when user is in card editor
  aiEditorContext: {
    folderId: string | null;
    folderName: string | null;
    isEditing: boolean;
  } | null;
  setAiEditorContext: (ctx: AppState["aiEditorContext"]) => void;

  // Pending AI-generated cards awaiting user confirmation
  pendingAiCards: Array<{
    question: string;
    answer: string;
    folderId: string | null;
  }>;
  setPendingAiCards: (cards: AppState["pendingAiCards"]) => void;

  // Editor field callbacks — lets AI agent write to the open card editor in real time
  editorCallbacks: {
    setQuestion: (content: string) => void;
    setAnswer: (content: string) => void;
    setTimerMode: (mode: string) => void;
    setTimerSeconds: (minutes: number, seconds: number) => void;
    getQuestion: () => string;
    getAnswer: () => string;
  } | null;
  setEditorCallbacks: (cbs: AppState["editorCallbacks"]) => void;

  // Study Settings
  shuffleCards: boolean;
  setShuffleCards: (shuffle: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  folders: [],
  setFolders: (folders) => set({ folders }),
  addFolder: (folder) =>
    set((state) => ({ folders: [...state.folders, folder] })),
  updateFolder: (id, updates) =>
    set((state) => ({
      folders: state.folders.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  removeFolder: (id) =>
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== id),
    })),

  flashcards: [],
  setFlashcards: (flashcards) => set({ flashcards }),
  addFlashcard: (flashcard) =>
    set((state) => ({ flashcards: [...state.flashcards, flashcard] })),
  updateFlashcard: (id, updates) =>
    set((state) => ({
      flashcards: state.flashcards.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  removeFlashcard: (id) =>
    set((state) => ({
      flashcards: state.flashcards.filter((c) => c.id !== id),
    })),

  llmConfig: null,
  setLLMConfig: (config) => set({ llmConfig: config }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  pendingScreenshot: null,
  setPendingScreenshot: (dataUrl) => set({ pendingScreenshot: dataUrl }),

  aiPanelOpen: false,
  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),

  aiEditorContext: null,
  setAiEditorContext: (ctx) => set({ aiEditorContext: ctx }),

  pendingAiCards: [],
  setPendingAiCards: (cards) => set({ pendingAiCards: cards }),

  editorCallbacks: null,
  setEditorCallbacks: (cbs) => set({ editorCallbacks: cbs }),

  shuffleCards: (() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("flashmath_shuffle_cards") === "true";
    }
    return false;
  })(),
  setShuffleCards: (shuffle) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("flashmath_shuffle_cards", String(shuffle));
    }
    set({ shuffleCards: shuffle });
  },
}));
