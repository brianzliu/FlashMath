"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ImportImagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folderId") || "";
  const { folders } = useAppStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);

  const folderName = useMemo(
    () => folders.find((f) => f.id === folderId)?.name || "",
    [folders, folderId]
  );

  const handleFileBlob = useCallback(async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
    const savedPath = await commands.saveImageFromDataUrl(dataUrl);
    setImagePath(savedPath);
    setImageUrl(dataUrl);
  }, []);

  const handleOpenFile = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"],
          },
        ],
      });

      const path = Array.isArray(result) ? result[0] : result;
      if (path) {
        const pathStr = path as string;
        setImagePath(pathStr);
        const dataUrl = await commands.getImageAsDataUrl(pathStr);
        setImageUrl(dataUrl);
      }
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  };

  const handleRegionsChange = useCallback((newRegions: Region[]) => {
    setRegions(newRegions);
  }, []);

  const handleCreateCards = async () => {
    if (!folderId || !imagePath || regions.length === 0) return;
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
          folder_id: folderId,
          question_type: qType,
          question_content: qContent,
          answer_type: aType,
          answer_content: aContent,
        });
      }

      router.push(`/folder?id=${folderId}`);
    } catch (err) {
      console.error("Failed to create flashcards:", err);
    } finally {
      setCreating(false);
    }
  };

  const questionCount = regions.filter((r) => r.role === "question").length;

  if (!folderId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Import from Image</h1>
          <p className="text-sm text-muted-foreground">
            Select a folder to import images into.
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
        <h1 className="text-2xl font-semibold">Import from Image</h1>
        <p className="text-sm text-muted-foreground">
          Draw question and answer regions, then generate cards.
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

      {!imageUrl ? (
        <Card
          className="border-dashed"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) {
              void handleFileBlob(file);
            }
          }}
        >
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <p className="text-muted-foreground">
              Select an image file to import flashcards from.
            </p>
            <Button onClick={handleOpenFile}>Open Image</Button>
            <div className="text-xs text-muted-foreground">
              or drag and drop an image file here
            </div>
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
                  disabled={creating || questionCount === 0 || !folderId}
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
