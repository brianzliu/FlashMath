"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ImportPdfPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folderId") || "";
  const { folders } = useAppStore();
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [regions, setRegions] = useState<Map<number, Region[]>>(new Map());
  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const [loading, setLoading] = useState(false);

  const folderName = useMemo(
    () => folders.find((f) => f.id === folderId)?.name || "",
    [folders, folderId]
  );

  const handlePdfDrop = useCallback((file: File) => {
    // Placeholder until native PDF rendering is wired up.
    setPdfPath(file.name);
  }, []);

  const handleOpenFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "PDF",
            extensions: ["pdf"],
          },
        ],
      });

      const path = Array.isArray(result) ? result[0] : result;
      if (path) {
        setPdfPath(path as string);
        setLoading(true);
        // TODO: Render PDF pages to images on the Rust side
        // For now, show placeholder
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to open PDF:", err);
      setLoading(false);
    }
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
      // Process each page's regions
      for (const [pageIdx, pageRegions] of regions.entries()) {
        const questions = pageRegions.filter((r) => r.role === "question");
        const answers = pageRegions.filter((r) => r.role === "answer");
        const pageImage = pageImages[pageIdx];
        if (!pageImage) continue;

        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const a = answers[i];

          const qPath = await commands.cropRegion(
            pageImage,
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
              // fall back to image
            }
          }

          let aType: "image" | "latex" | undefined;
          let aContent: string | undefined;

          if (a) {
            const aPath = await commands.cropRegion(
              pageImage,
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

      router.push(`/folder?id=${folderId}`);
    } catch (err) {
      console.error("Failed to create flashcards:", err);
    } finally {
      setCreating(false);
    }
  };

  if (!folderId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Import from PDF</h1>
          <p className="text-sm text-muted-foreground">
            Select a folder to import PDFs into.
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 py-10 text-center">
            <p className="text-muted-foreground">
              Import is only available inside a folder.
            </p>
            <Button onClick={() => router.push("/")}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import from PDF</h1>
        <p className="text-sm text-muted-foreground">
          Segment questions and answers directly from PDF pages.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-4">
          <Badge variant="secondary">Target folder</Badge>
          <span className="text-sm font-medium">
            {folderName || "Untitled"}
          </span>
        </CardContent>
      </Card>

      {!pdfPath ? (
        <Card
          className="border-dashed"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) {
              handlePdfDrop(file);
            }
          }}
        >
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted-foreground">
              Select a PDF file to import flashcards from.
            </p>
            <Button onClick={handleOpenFile}>Open PDF</Button>
            <div className="text-xs text-muted-foreground">
              or drag and drop a PDF here
            </div>
          </CardContent>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground">Loading PDF...</p>
      ) : pageImages.length === 0 ? (
        <Card>
          <CardContent className="space-y-4 py-10 text-center">
            <p className="text-muted-foreground">
              PDF rendering needs a native pipeline. Convert your PDF pages to
              images and use Image Import for now.
            </p>
            <Button onClick={() => router.push(`/import/image?folderId=${folderId}`)}>
              Go to Image Import
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
            >
              Prev
            </Button>
            <span className="text-sm">
              Page {currentPage + 1} of {pageImages.length}
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                setCurrentPage((p) => Math.min(pageImages.length - 1, p + 1))
              }
              disabled={currentPage === pageImages.length - 1}
            >
              Next
            </Button>
          </div>

          <AnnotationCanvas
            imageUrl={pageImages[currentPage]}
            onRegionsChange={handleRegionsChange}
          />

          <Card>
            <CardHeader>
              <CardTitle>Card creation</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useOcr}
                  onChange={(e) => setUseOcr(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                OCR to LaTeX
              </label>

              <div className="ml-auto flex items-center gap-3">
                <Badge variant="secondary">
                  {allQuestionRegions.length} question
                  {allQuestionRegions.length !== 1 ? "s" : ""}
                </Badge>
                <Button
                  onClick={handleCreateCards}
                  disabled={creating || allQuestionRegions.length === 0 || !folderId}
                >
                  {creating
                    ? "Creating..."
                    : `Create ${allQuestionRegions.length} Card${
                        allQuestionRegions.length !== 1 ? "s" : ""
                      }`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
