"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";

export default function ImportPdfPage() {
  const router = useRouter();
  const { folders } = useAppStore();
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [regions, setRegions] = useState<Map<number, Region[]>>(new Map());
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleOpenFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "PDF",
            extensions: ["pdf"],
          },
        ],
      });

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
    if (allQuestionRegions.length === 0) return;
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
            folder_id: selectedFolder || null,
            question_type: qType,
            question_content: qContent,
            answer_type: aType,
            answer_content: aContent,
          });
        }
      }

      router.push(selectedFolder ? `/folder/${selectedFolder}` : "/");
    } catch (err) {
      console.error("Failed to create flashcards:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Import from PDF</h1>

      {!pdfPath ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">
            Select a PDF file to import flashcards from. You can draw rectangles
            around questions and answers on each page.
          </p>
          <button
            onClick={handleOpenFile}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium"
          >
            Open PDF
          </button>
        </div>
      ) : loading ? (
        <p className="text-muted-foreground">Loading PDF...</p>
      ) : pageImages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            PDF rendering requires additional setup. For now, you can convert
            your PDF pages to images and use the Image Import instead.
          </p>
          <button
            onClick={() => router.push("/import/image")}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium"
          >
            Go to Image Import
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Page navigation */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md text-sm disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-sm">
              Page {currentPage + 1} of {pageImages.length}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(pageImages.length - 1, p + 1))
              }
              disabled={currentPage === pageImages.length - 1}
              className="px-3 py-1 bg-secondary text-secondary-foreground rounded-md text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>

          {/* Annotation */}
          <AnnotationCanvas
            imageUrl={pageImages[currentPage]}
            onRegionsChange={handleRegionsChange}
          />

          {/* Controls */}
          <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
            <div>
              <label className="block text-sm font-medium mb-1">Folder</label>
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="px-3 py-1.5 border border-border rounded-md bg-background text-sm"
              >
                <option value="">No folder</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useOcr}
                onChange={(e) => setUseOcr(e.target.checked)}
                className="rounded"
              />
              OCR to LaTeX
            </label>

            <div className="ml-auto">
              <button
                onClick={handleCreateCards}
                disabled={creating || allQuestionRegions.length === 0}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creating
                  ? "Creating..."
                  : `Create ${allQuestionRegions.length} Card${
                      allQuestionRegions.length !== 1 ? "s" : ""
                    }`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
