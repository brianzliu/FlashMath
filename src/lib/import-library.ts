import localforage from "localforage";

export type ImportKind = "image" | "pdf";

export interface SavedRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  role: "question" | "answer" | null;
  pageIndex: number;
  labelNumber: number;
}

interface ImportBase {
  id: string;
  kind: ImportKind;
  name: string;
  createdAt: number;
  lastUsedAt: number;
  linkedFlashcardIds: string[];
  regions?: SavedRegion[];
}

export interface ImageImportItem extends ImportBase {
  kind: "image";
  dataUrl: string;
  sourcePath?: string;
}

export interface PdfImportItem extends ImportBase {
  kind: "pdf";
  base64Data: string;
  sourcePath?: string;
}

export type ImportLibraryItem = ImageImportItem | PdfImportItem;

const store = localforage.createInstance({
  name: "flashmath",
  storeName: "import_library_v1",
});

const INDEX_KEY = "items";
const MAX_ITEMS = 100;

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getItems(): Promise<ImportLibraryItem[]> {
  const items = await store.getItem<ImportLibraryItem[]>(INDEX_KEY);
  if (!items) return [];
  return items.map((item) => ({
    ...item,
    linkedFlashcardIds: item.linkedFlashcardIds ?? [],
  }));
}

async function setItems(items: ImportLibraryItem[]): Promise<void> {
  const trimmed = items
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_ITEMS);
  await store.setItem(INDEX_KEY, trimmed);
}

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const blob = new Blob([buffer], { type: "application/pdf" });
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to encode PDF data"));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read PDF blob"));
    reader.readAsDataURL(blob);
  });
}

export async function listRecentImports(
  kind?: ImportKind,
  limit = 8
): Promise<ImportLibraryItem[]> {
  const items = await getItems();
  const filtered = kind ? items.filter((item) => item.kind === kind) : items;
  return filtered.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, limit);
}

export async function getImportById(id: string): Promise<ImportLibraryItem | null> {
  const items = await getItems();
  return items.find((item) => item.id === id) || null;
}

export async function saveImageImport(input: {
  name: string;
  dataUrl: string;
  sourcePath?: string;
}): Promise<ImageImportItem> {
  const now = Date.now();
  const newItem: ImageImportItem = {
    id: createId(),
    kind: "image",
    name: input.name,
    dataUrl: input.dataUrl,
    sourcePath: input.sourcePath,
    createdAt: now,
    lastUsedAt: now,
    linkedFlashcardIds: [],
  };

  const existing = await getItems();
  await setItems([newItem, ...existing]);
  return newItem;
}

export async function savePdfImport(input: {
  name: string;
  buffer: ArrayBuffer;
  sourcePath?: string;
}): Promise<PdfImportItem> {
  const now = Date.now();
  const base64Data = await arrayBufferToBase64(input.buffer);

  const newItem: PdfImportItem = {
    id: createId(),
    kind: "pdf",
    name: input.name,
    base64Data,
    sourcePath: input.sourcePath,
    createdAt: now,
    lastUsedAt: now,
    linkedFlashcardIds: [],
  };

  const existing = await getItems();
  await setItems([newItem, ...existing]);
  return newItem;
}

export async function touchImport(id: string): Promise<void> {
  const items = await getItems();
  const updated = items.map((item) =>
    item.id === id ? { ...item, lastUsedAt: Date.now() } : item
  );
  await setItems(updated);
}

export async function linkFlashcardsToImport(
  importId: string,
  flashcardIds: string[]
): Promise<void> {
  if (flashcardIds.length === 0) return;
  const idSet = new Set(flashcardIds);
  const items = await getItems();
  const updated = items.map((item) => {
    if (item.id !== importId) return item;
    const existing = new Set(item.linkedFlashcardIds);
    for (const id of idSet) existing.add(id);
    return {
      ...item,
      linkedFlashcardIds: Array.from(existing),
      lastUsedAt: Date.now(),
    };
  });
  await setItems(updated);
}

export async function unlinkFlashcardFromImports(flashcardId: string): Promise<void> {
  const items = await getItems();
  const updated = items.map((item) => ({
    ...item,
    linkedFlashcardIds: item.linkedFlashcardIds.filter((id) => id !== flashcardId),
  }));
  await setItems(updated);
}

export async function saveRegionsToImport(
  importId: string,
  regions: SavedRegion[]
): Promise<void> {
  const items = await getItems();
  const updated = items.map((item) =>
    item.id === importId ? { ...item, regions } : item
  );
  await setItems(updated);
}

export async function removeImportItem(id: string): Promise<void> {
  const items = await getItems();
  await setItems(items.filter((item) => item.id !== id));
}

export function decodePdfBase64(base64Data: string): ArrayBuffer {
  const raw = base64Data.trim();
  const seed = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  const candidates = new Set<string>();
  candidates.add(seed);
  candidates.add(seed.replace(/\s/g, ""));
  const compact = seed.replace(/\s/g, "");
  candidates.add(compact.replace(/-/g, "+").replace(/_/g, "/"));

  for (const candidate of candidates) {
    if (!candidate) continue;
    const padLength = (4 - (candidate.length % 4)) % 4;
    const padded = candidate + "=".repeat(padLength);
    try {
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes.buffer;
    } catch {
      // Try next candidate format.
    }
  }

  // Legacy fallback: treat as raw binary string.
  const bytes = new Uint8Array(seed.length);
  for (let i = 0; i < seed.length; i++) {
    bytes[i] = seed.charCodeAt(i) & 0xff;
  }
  return bytes.buffer;
}
