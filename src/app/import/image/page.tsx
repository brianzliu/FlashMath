"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

      router.push(selectedFolder ? `/folder?id=${selectedFolder}` : "/");
    } catch (err) {
      console.error("Failed to create flashcards:", err);
    } finally {
      setCreating(false);
    }
  };

  const questionCount = regions.filter((r) => r.role === "question").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import from Image</h1>
        <p className="text-sm text-muted-foreground">
          Draw question and answer regions, then generate cards.
        </p>
      </div>

      {!imageUrl ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted-foreground">
              Select an image file to import flashcards from.
            </p>
            <Button onClick={handleOpenFile}>Open Image</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Draw rectangles around questions (Q) and answers (A). Tag each
              region using the toolbar.
            </p>
            <Button variant="ghost" onClick={handleOpenFile}>
              Change image
            </Button>
          </div>

          <AnnotationCanvas
            imageUrl={imageUrl}
            onRegionsChange={handleRegionsChange}
          />

          <Card>
            <CardHeader>
              <CardTitle>Card creation</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Folder</label>
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
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
                  className="h-4 w-4 rounded border-border"
                />
                Convert to LaTeX (OCR)
              </label>

              <div className="ml-auto flex items-center gap-3">
                <Badge variant="secondary">
                  {questionCount} question{questionCount !== 1 ? "s" : ""}
                </Badge>
                <Button
                  onClick={handleCreateCards}
                  disabled={creating || questionCount === 0}
                >
                  {creating
                    ? "Creating..."
                    : `Create ${questionCount} Card${
                        questionCount !== 1 ? "s" : ""
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
