import { useState, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImagePlus, Upload } from "lucide-react";

export default function ImportImagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folderId") || "";
  const { folders } = useAppStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      const savedPath = await commands.saveImageFromDataUrl(dataUrl);
      setImagePath(savedPath);
    } catch {
      setImagePath(null);
    }
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
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileBlob(file);
  };

  const handleRegionsChange = useCallback((newRegions: Region[]) => {
    setRegions(newRegions);
  }, []);

  const handleCreateCards = async () => {
    if (!folderId || !imagePath || regions.length === 0) return;
    setCreating(true);

    try {
      const questions = regions.filter((r) => r.role === "question");
      const answers = regions.filter((r) => r.role === "answer");

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const a = answers[i];

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
            /* fall back */
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

      navigate(`/folder?id=${folderId}`);
    } catch (err) {
      console.error("Failed to create flashcards:", err);
    } finally {
      setCreating(false);
    }
  };

  const questionCount = regions.filter((r) => r.role === "question").length;

  if (!folderId) {
    return (
      <div className="space-y-6 animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight">
          Import Image
        </h1>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-muted-foreground">
              Open a deck first, then import images from there.
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
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
      />

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">
          Import Image
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Into{" "}
          <span className="font-semibold text-foreground">
            {folderName || "deck"}
          </span>{" "}
          — draw rectangles around questions and answers
        </p>
      </div>

      {!imageUrl ? (
        <Card
          className={`border-dashed border-2 cursor-pointer transition-colors ${
            isDragOver
              ? "border-primary bg-primary/5"
              : "hover:border-primary/40"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFileBlob(file);
          }}
          onClick={handleOpenFile}
        >
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ImagePlus className="h-7 w-7 text-primary" />
            </div>
            <div>
              <p className="font-semibold">
                {isDragOver
                  ? "Drop image here"
                  : "Drop an image or click to browse"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                PNG, JPG, GIF, WebP, BMP supported
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Draw rectangles, then tag each as <strong>Q</strong> or{" "}
              <strong>A</strong>
            </p>
            <Button variant="ghost" size="sm" onClick={handleOpenFile}>
              Change image
            </Button>
          </div>

          <AnnotationCanvas
            imageUrl={imageUrl}
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
                  {questionCount} question{questionCount !== 1 ? "s" : ""}
                </Badge>
                <Button
                  onClick={handleCreateCards}
                  disabled={creating || questionCount === 0 || !folderId}
                >
                  {creating ? (
                    "Creating..."
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-1.5" />
                      Create {questionCount} Card
                      {questionCount !== 1 ? "s" : ""}
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
