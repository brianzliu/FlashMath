import { useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileUp, ChevronLeft, ChevronRight, Upload } from "lucide-react";

export default function ImportPdfPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folderId") || "";
  const { folders } = useAppStore();
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [regions, setRegions] = useState<Map<number, Region[]>>(new Map());
  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderName = useMemo(
    () => folders.find((f) => f.id === folderId)?.name || "",
    [folders, folderId]
  );

  const renderPdfToImages = useCallback(async (data: ArrayBuffer) => {
    setLoading(true);
    try {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();

      const pdf = await pdfjsLib.getDocument({ data }).promise;
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
      setCurrentPage(0);
      setRegions(new Map());
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
    },
    [renderPdfToImages]
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
          await renderPdfToImages(data.buffer as ArrayBuffer);
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

  const handleRegionsChange = useCallback(
    (newRegions: Region[]) => {
      setRegions((prev) => {
        const updated = new Map(prev);
        updated.set(currentPage, newRegions);
        return updated;
      });
    },
    [currentPage]
  );

  const allQuestionRegions = Array.from(regions.values())
    .flat()
    .filter((r) => r.role === "question");

  const handleCreateCards = async () => {
    if (!folderId || allQuestionRegions.length === 0) return;
    setCreating(true);

    try {
      for (const [pageIdx, pageRegions] of regions.entries()) {
        const questions = pageRegions.filter((r) => r.role === "question");
        const answers = pageRegions.filter((r) => r.role === "answer");
        const pageImage = pageImages[pageIdx];
        if (!pageImage) continue;

        const savedPagePath = await commands.saveImageFromDataUrl(pageImage);

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const a = answers[i];

          const qPath = await commands.cropRegion(
            savedPagePath,
            q.x,
            q.y,
            q.width,
            q.height
          );

          let qType: "image" | "latex" = "image";
          let qContent = qPath;

          if (useOcr) {
            try {
              const latex = await commands.ocrImage(qPath);
              qType = "latex";
              qContent = latex;
            } catch {
              /* fall back */
            }
          }

          let aType: "image" | "latex" | undefined;
          let aContent: string | undefined;

          if (a) {
            const aPath = await commands.cropRegion(
              savedPagePath,
              a.x,
              a.y,
              a.width,
              a.height
            );

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
    <div className="space-y-6 animate-fade-up">
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
        {fileName && <Badge variant="secondary">{fileName}</Badge>}
      </div>

      {pageImages.length === 0 ? (
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
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[80px] text-center">
                Page {currentPage + 1} / {pageImages.length}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(pageImages.length - 1, p + 1)
                  )
                }
                disabled={currentPage === pageImages.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPageImages([]);
                setFileName(null);
                setRegions(new Map());
              }}
            >
              Change PDF
            </Button>
          </div>

          <AnnotationCanvas
            imageUrl={pageImages[currentPage]}
            onRegionsChange={handleRegionsChange}
          />

          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 py-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useOcr}
                  onChange={(e) => setUseOcr(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Convert to LaTeX (OCR)
              </label>
              <div className="ml-auto flex items-center gap-3">
                <Badge variant="secondary">
                  {allQuestionRegions.length} question
                  {allQuestionRegions.length !== 1 ? "s" : ""}
                </Badge>
                <Button
                  onClick={handleCreateCards}
                  disabled={creating || allQuestionRegions.length === 0}
                >
                  {creating ? (
                    "Creating..."
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-1.5" />
                      Create {allQuestionRegions.length} Card
                      {allQuestionRegions.length !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
