import localforage from "localforage";

export type ImportKind = "image" | "pdf";

interface ImportBase {
  id: string;
  kind: ImportKind;
  name: string;
  createdAt: number;
  lastUsedAt: number;
}

export interface ImageImportItem extends ImportBase {
  kind: "image";
  dataUrl: string;
  sourcePath?: string;
}

export interface PdfImportItem extends ImportBase {
  kind: "pdf";
  base64Data: string;
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
  return items;
}

async function setItems(items: ImportLibraryItem[]): Promise<void> {
  const trimmed = items
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_ITEMS);
  await store.setItem(INDEX_KEY, trimmed);
}

export async function listRecentImports(
  kind?: ImportKind,
  limit = 8
): Promise<ImportLibraryItem[]> {
  const items = await getItems();
  const filtered = kind ? items.filter((item) => item.kind === kind) : items;
  return filtered.sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, limit);
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
  };

  const existing = await getItems();
  await setItems([newItem, ...existing]);
  return newItem;
}

export async function savePdfImport(input: {
  name: string;
  buffer: ArrayBuffer;
}): Promise<PdfImportItem> {
  const now = Date.now();
  const bytes = new Uint8Array(input.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  const newItem: PdfImportItem = {
    id: createId(),
    kind: "pdf",
    name: input.name,
    base64Data: btoa(binary),
    createdAt: now,
    lastUsedAt: now,
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

export function decodePdfBase64(base64Data: string): ArrayBuffer {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
