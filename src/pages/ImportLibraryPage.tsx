import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import * as commands from "@/lib/commands";
import {
  listRecentImports,
  removeImportItem,
  touchImport,
  type ImportLibraryItem,
} from "@/lib/import-library";
import type { Flashcard, Folder } from "@/lib/types";
import { BookOpen, Pencil, Trash2, Image as ImageIcon, FileText } from "lucide-react";

export default function ImportLibraryPage() {
  const [imports, setImports] = useState<ImportLibraryItem[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      listRecentImports(undefined, 500),
      commands.getFlashcards(),
      commands.getFolders(),
    ])
      .then(([importItems, cards, loadedFolders]) => {
        if (!active) return;
        setImports(importItems);
        setFlashcards(cards);
        setFolders(loadedFolders);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cardsById = useMemo(() => {
    const map = new Map<string, Flashcard>();
    for (const card of flashcards) map.set(card.id, card);
    return map;
  }, [flashcards]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folders) map.set(folder.id, folder.name);
    return map;
  }, [folders]);

  const activeImport = imports.find((item) => item.id === activeImportId) || null;
  const linkedCards = useMemo(() => {
    if (!activeImport) return [];
    return activeImport.linkedFlashcardIds
      .map((id) => cardsById.get(id))
      .filter((card): card is Flashcard => Boolean(card));
  }, [activeImport, cardsById]);

  const handleSelectImport = async (item: ImportLibraryItem) => {
    setActiveImportId(item.id);
    await touchImport(item.id);
    setImports(await listRecentImports(undefined, 500));
  };

  const handleDeleteImport = async (id: string) => {
    await removeImportItem(id);
    setImports(await listRecentImports(undefined, 500));
    if (activeImportId === id) setActiveImportId(null);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Import Library</h1>
        <p className="text-muted-foreground mt-1">
          Open your stored imports and jump into editing flashcards created from them.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-8 text-center">Loading imports...</p>
      ) : imports.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            No imports saved yet. Import a PDF or image to build your library.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Card className="h-fit">
            <CardContent className="p-3 space-y-2">
              {imports.map((item) => (
                <button
                  key={item.id}
                  className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
                    activeImportId === item.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                  onClick={() => {
                    void handleSelectImport(item);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="capitalize">
                        {item.kind === "pdf" ? (
                          <FileText className="h-3 w-3 mr-1" />
                        ) : (
                          <ImageIcon className="h-3 w-3 mr-1" />
                        )}
                        {item.kind}
                      </Badge>
                      <button
                        className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteImport(item.id);
                        }}
                        title="Remove from library"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              {!activeImport ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Select an import to view and edit related flashcards.
                </p>
              ) : linkedCards.length === 0 ? (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm font-medium">No linked flashcards yet</p>
                  <p className="text-sm text-muted-foreground">
                    Create cards from this import, then they will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      Linked Flashcards
                    </h2>
                    <Badge variant="secondary">
                      {linkedCards.length} card{linkedCards.length === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  {linkedCards.map((card) => (
                    <div
                      key={card.id}
                      className="rounded-xl border border-border px-3 py-2.5 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {card.title || (card.question_type === "image" ? "Image card" : card.question_content)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {card.folder_id ? folderNameById.get(card.folder_id) || "Deck" : "No deck"}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/card?id=${card.id}`}>
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
