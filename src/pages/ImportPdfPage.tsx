import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileUp,
  Upload,
  Type,
  Link as LinkIcon,
  Bookmark,
  Trash2,
  RefreshCw,
  History,
} from "lucide-react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  decodePdfBase64,
  listRecentImports,
  savePdfImport,
  touchImport,
  type PdfImportItem,
} from "@/lib/import-library";

function OutlineNode({ item, onNavigate }: { item: any, onNavigate: (pageIndex: number) => void }) {
  return (
    <div className="pl-3 font-medium text-[12px] my-1 border-l border-border/40">
      <div
        className="cursor-pointer hover:text-primary transition-colors text-foreground/80 py-1"
        onClick={() => { if (item.pageIndex !== undefined) onNavigate(item.pageIndex); }}
      >
        {item.title}
      </div>
      {item.items && item.items.length > 0 && (
        <div className="mt-0.5">
          {item.items.map((child: any, i: number) => (
            <OutlineNode key={i} item={child} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ImportPdfPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folderId") || "";
  const { folders } = useAppStore();

  const [pageImages, setPageImages] = useState<string[]>([]);
  const [outline, setOutline] = useState<any[]>([]);

  const [regions, setRegions] = useState<Region[]>([]);
  const [activeMode, setActiveMode] = useState<"question" | "answer" | null>("question");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if inside an input/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key.toLowerCase() === 'q') {
        setActiveMode('question');
      } else if (e.key.toLowerCase() === 'a') {
        setActiveMode('answer');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [recentImports, setRecentImports] = useState<PdfImportItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const folderName = useMemo(
    () => folders.find((f) => f.id === folderId)?.name || "",
    [folders, folderId]
  );

  const refreshRecentImports = useCallback(async () => {
    const items = await listRecentImports("pdf", 8);
    setRecentImports(items as PdfImportItem[]);
  }, []);

  useEffect(() => {
    refreshRecentImports();
  }, [refreshRecentImports]);

  const renderPdfToImages = useCallback(async (data: ArrayBuffer) => {
    setLoading(true);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

      const pdf = await pdfjsLib.getDocument({ data }).promise;

      try {
        const rawOutline = await pdf.getOutline();
        if (rawOutline && rawOutline.length > 0) {
          const resolveOutline = async (items: any[]) => {
            for (const item of items) {
              if (item.dest) {
                let dest = item.dest;
                if (typeof dest === "string") {
                  dest = await pdf.getDestination(dest);
                }
                if (dest && dest[0]) {
                  const pageIndex = await pdf.getPageIndex(dest[0]);
                  item.pageIndex = pageIndex;
                }
              }
              if (item.items && item.items.length > 0) {
                await resolveOutline(item.items);
              }
            }
          };
          await resolveOutline(rawOutline);
          setOutline(rawOutline);
        } else {
          setOutline([]);
        }
      } catch (e) {
        console.warn("Failed to parse outline", e);
        setOutline([]);
      }

      const images: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        images.push(canvas.toDataURL("image/png"));
      }

      setPageImages(images);
      setRegions([]);
    } catch (err) {
      console.error("Failed to render PDF:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith(".pdf")) return;
      setFileName(file.name);
      const buffer = await file.arrayBuffer();
      await renderPdfToImages(buffer);
      await savePdfImport({ name: file.name, buffer });
      await refreshRecentImports();
    },
    [refreshRecentImports, renderPdfToImages]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleOpenFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      const path = Array.isArray(result) ? result[0] : result;
      if (path) {
        const pathStr = path as string;
        setFileName(pathStr.split("/").pop() || pathStr);
        try {
          const { readFile } = await import("@tauri-apps/plugin-fs");
          const data = await readFile(pathStr);
          const buffer = data.buffer.slice(
            data.byteOffset,
            data.byteOffset + data.byteLength
          ) as ArrayBuffer;
          await renderPdfToImages(buffer);
          await savePdfImport({
            name: pathStr.split("/").pop() || "Imported PDF",
            buffer,
          });
          await refreshRecentImports();
        } catch {
          console.error("Could not read file via Tauri FS");
        }
      }
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const sortedQuestions = useMemo(() => {
    return regions.filter(r => r.role === 'question').sort((a, b) => a.labelNumber - b.labelNumber);
  }, [regions]);

  const sortedAnswers = useMemo(() => {
    return regions.filter(r => r.role === 'answer').sort((a, b) => a.labelNumber - b.labelNumber);
  }, [regions]);

  const handleRegionAdded = useCallback((newRegion: Region) => {
    setRegions(prev => {
      const sameRoleRegions = prev.filter(r => r.role === newRegion.role);
      const usedNumbers = new Set(sameRoleRegions.map(r => r.labelNumber));

      let nextNum = 1;
      while (usedNumbers.has(nextNum)) {
        nextNum++;
      }

      return [...prev, { ...newRegion, labelNumber: nextNum }];
    });
  }, []);

  const handleRegionChange = useCallback((updatedRegion: Region) => {
    setRegions(prev => prev.map(r => r.id === updatedRegion.id ? updatedRegion : r));
  }, []);

  // We use CSS for label now via AnnotationCanvas so getLabel is omitted from use

  const handleUseRecentImport = useCallback(
    async (item: PdfImportItem) => {
      setFileName(item.name);
      const buffer = decodePdfBase64(item.base64Data);
      await renderPdfToImages(buffer);
      await touchImport(item.id);
      await refreshRecentImports();
    },
    [refreshRecentImports, renderPdfToImages]
  );

  const handleCreateCards = async () => {
    if (!folderId || sortedQuestions.length === 0) return;
    setCreating(true);

    try {
      const savedPages = new Map<number, string>();
      const getSavedPage = async (pageIndex: number) => {
        if (savedPages.has(pageIndex)) return savedPages.get(pageIndex)!;
        const path = await commands.saveImageFromDataUrl(pageImages[pageIndex]);
        savedPages.set(pageIndex, path);
        return path;
      };

      for (let i = 0; i < sortedQuestions.length; i++) {
        const q = sortedQuestions[i];
        // Find matching answer by explicitly linking question label number to answer label number
        const a = sortedAnswers.find(ans => ans.labelNumber === q.labelNumber);

        const qPagePath = await getSavedPage(q.pageIndex);
        const qPath = await commands.cropRegion(qPagePath, q.x, q.y, q.width, q.height);

        let qType: "image" | "latex" = "image";
        let qContent = qPath;

        if (useOcr) {
          try {
            const latex = await commands.ocrImage(qPath);
            qType = "latex";
            qContent = latex;
          } catch {
            // fallback
          }
        }

        let aType: "image" | "latex" | undefined;
        let aContent: string | undefined;

        if (a) {
          const aPagePath = await getSavedPage(a.pageIndex);
          const aPath = await commands.cropRegion(aPagePath, a.x, a.y, a.width, a.height);

          if (useOcr) {
            try {
              const latex = await commands.ocrImage(aPath);
              aType = "latex";
              aContent = latex;
            } catch {
              aType = "image";
              aContent = aPath;
            }
          } else {
            aType = "image";
            aContent = aPath;
          }
        }

        await commands.createFlashcard({
          folder_id: folderId,
          question_type: qType,
          question_content: qContent,
          answer_type: aType,
          answer_content: aContent,
        });
      }

      navigate(`/folder?id=${folderId}`);
    } catch (err) {
      console.error("Failed to create flashcards:", err);
    } finally {
      setCreating(false);
    }
  };

  if (!folderId) {
    return (
      <div className="space-y-6 animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight">Import PDF</h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-muted-foreground">
              Open a deck first, then import a PDF from there.
            </p>
            <Button onClick={() => navigate("/")}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileInput}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Import PDF</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Into{" "}
            <span className="font-semibold text-foreground">
              {folderName || "deck"}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {fileName && <Badge variant="secondary">{fileName}</Badge>}
          {pageImages.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleOpenFile}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Replace PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPageImages([]);
                  setFileName(null);
                  setRegions([]);
                  setOutline([]);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Clear
              </Button>
            </>
          )}
        </div>
      </div>

      {pageImages.length === 0 ? (
        <>
          <Card
            className="border-dashed border-2 cursor-pointer hover:border-primary/40 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => {
              try {
                handleOpenFile();
              } catch {
                fileInputRef.current?.click();
              }
            }}
          >
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              {loading ? (
                <>
                  <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  <p className="text-muted-foreground">
                    Rendering PDF pages...
                  </p>
                </>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FileUp className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      Drop a PDF here or click to browse
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Pages will be rendered as images for annotation
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          {recentImports.length > 0 && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-2 mb-3">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">Recent imports</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recentImports.map((item) => (
                    <Button
                      key={item.id}
                      variant="outline"
                      className="justify-start truncate"
                      onClick={() => {
                        void handleUseRecentImport(item);
                      }}
                    >
                      {item.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <div className="flex relative items-start h-[calc(100vh-10rem)] overflow-hidden">
          {outline.length > 0 && (
            <div className="w-56 border-r pr-3 h-full overflow-y-auto shrink-0 hidden md:block">
              <h3 className="font-extrabold text-[11px] uppercase tracking-wider mb-3 flex items-center gap-2 text-muted-foreground">
                <Bookmark className="h-3 w-3 text-primary" /> Bookmarks
              </h3>
              <div className="space-y-1">
                {outline.map((item, i) => (
                  <OutlineNode key={i} item={item} onNavigate={(idx) => {
                    pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth' });
                  }} />
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 h-full overflow-y-auto pb-32 bg-muted/20 md:px-8">
            <div className="max-w-[850px] mx-auto shadow-sm bg-white border">
              {pageImages.map((img, idx) => (
                <div key={idx} ref={el => { pageRefs.current[idx] = el; }} className="border-b last:border-b-0 border-border/30">
                  <AnnotationCanvas
                    imageUrl={img}
                    pageIndex={idx}
                    regions={regions.filter(r => r.pageIndex === idx)}
                    regionsByType={regions}
                    activeMode={activeMode}
                    onRegionAdded={handleRegionAdded}
                    onRegionChange={handleRegionChange}
                    onRegionDeleted={(id) => setRegions(prev => prev.filter(r => r.id !== id))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Floating Action Toolbar */}
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-popover/95 backdrop-blur-md text-popover-foreground shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border/50 rounded-full px-2 py-1.5 flex items-center gap-2 z-50 animate-in slide-in-from-bottom-8 duration-300">
            <Button
              variant={activeMode === "question" ? "default" : "ghost"}
              className={activeMode === "question" ? "rounded-full px-5 h-10 font-bold" : "rounded-full px-5 h-10 text-muted-foreground hover:text-foreground hover:bg-muted/50"}
              onClick={() => setActiveMode("question")}
            >
              <Type className="h-4 w-4 mr-2 opacity-80" />
              Draw Question
            </Button>
            <Button
              variant={activeMode === "answer" ? "default" : "ghost"}
              style={activeMode === 'answer' ? { backgroundColor: 'hsl(var(--success))', color: 'white' } : {}}
              className={activeMode === 'answer' ? "rounded-full px-5 h-10 font-bold hover:opacity-90 shadow-sm transition-opacity" : "rounded-full px-5 h-10 text-muted-foreground hover:text-foreground hover:bg-muted/50"}
              onClick={() => setActiveMode("answer")}
            >
              <LinkIcon className="h-4 w-4 mr-2 opacity-80" />
              Draw Answer
            </Button>

            <div className="w-px h-6 bg-border mx-2"></div>

            <label className="flex items-center gap-2 text-[13px] font-medium cursor-pointer select-none px-2 mr-2 text-foreground/80 hover:text-foreground transition-colors">
              <input type="checkbox" checked={useOcr} onChange={(e) => setUseOcr(e.target.checked)} className="h-4 w-4 rounded accent-primary border-border" />
              Use OCR
            </label>

            <Button size="sm" onClick={handleCreateCards} disabled={creating || sortedQuestions.length === 0} className="rounded-full h-10 px-5 font-bold">
              {creating ? "Creating..." : `Import ${sortedQuestions.length} Cards`}
              <Upload className="h-4 w-4 ml-2 opacity-80" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
