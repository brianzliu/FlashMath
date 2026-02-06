"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";

export default function ImportImagePage() {
  const router = useRouter();
  const { folders } = useAppStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);

  const handleOpenFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"],
          },
        ],
      });

      if (path) {
        const pathStr = path as string;
        setImagePath(pathStr);
        // Load the image as data URL for display
        const dataUrl = await commands.getFlashcard("dummy").catch(() => null);
        // Use Tauri to read the file
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const contents = await readFile(pathStr);
        const blob = new Blob([contents]);
        const url = URL.createObjectURL(blob);
        setImageUrl(url);
      }
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  };

  const handleRegionsChange = useCallback((newRegions: Region[]) => {
    setRegions(newRegions);
  }, []);

  const handleCreateCards = async () => {
    if (!imagePath || regions.length === 0) return;
    setCreating(true);

    try {
      // Group regions into Q/A pairs
      const questions = regions.filter((r) => r.role === "question");
      const answers = regions.filter((r) => r.role === "answer");

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const a = answers[i]; // May be undefined

        // Crop question region
        const qPath = await commands.cropRegion(
          imagePath,
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
            // Fall back to image if OCR fails
          }
        }

        let aType: "image" | "latex" | undefined;
        let aContent: string | undefined;

        if (a) {
          const aPath = await commands.cropRegion(
            imagePath,
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

      router.push(selectedFolder ? `/folder/${selectedFolder}` : "/");
    } catch (err) {
      console.error("Failed to create flashcards:", err);
    } finally {
      setCreating(false);
    }
  };

  const questionCount = regions.filter((r) => r.role === "question").length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Import from Image</h1>

      {!imageUrl ? (
        <div className="border-2 border-dashed border-border rounded-lg p-12 text-center">
          <p className="text-muted-foreground mb-4">
            Select an image file to import flashcards from.
          </p>
          <button
            onClick={handleOpenFile}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium"
          >
            Open Image
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Draw rectangles around questions (Q) and answers (A). Tag each
              region using the toolbar.
            </p>
            <button
              onClick={handleOpenFile}
              className="text-sm text-primary hover:underline"
            >
              Change image
            </button>
          </div>

          <AnnotationCanvas
            imageUrl={imageUrl}
            onRegionsChange={handleRegionsChange}
          />

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
              Convert to LaTeX (OCR)
            </label>

            <div className="ml-auto">
              <button
                onClick={handleCreateCards}
                disabled={creating || questionCount === 0}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creating
                  ? "Creating..."
                  : `Create ${questionCount} Card${questionCount !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
