import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnnotationCanvas, type Region } from "@/components/AnnotationCanvas";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ImagePlus,
  Upload,
  Type,
  Link as LinkIcon,
  History,
  RefreshCw,
} from "lucide-react";
import {
  listRecentImports,
  linkFlashcardsToImport,
  saveImageImport,
  touchImport,
  type ImageImportItem,
} from "@/lib/import-library";

export default function ImportImagePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get("folderId") || "";
  const { folders } = useAppStore();

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);

  const [activeMode, setActiveMode] = useState<"question" | "answer" | null>("question");
  const [creating, setCreating] = useState(false);
  const [useOcr, setUseOcr] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [recentImports, setRecentImports] = useState<ImageImportItem[]>([]);
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folderName = useMemo(
    () => folders.find((f) => f.id === folderId)?.name || "",
    [folders, folderId]
  );

  const refreshRecentImports = useCallback(async () => {
    const items = await listRecentImports("image", 8);
    setRecentImports(items as ImageImportItem[]);
  }, []);

  useEffect(() => {
    refreshRecentImports();
  }, [refreshRecentImports]);

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
    setRegions([]);
    const savedImport = await saveImageImport({ name: file.name, dataUrl });
    setActiveImportId(savedImport.id);
    await refreshRecentImports();
  }, [refreshRecentImports]);

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
        setRegions([]);
        const savedImport = await saveImageImport({
          name: pathStr.split("/").pop() || "Imported image",
          dataUrl,
          sourcePath: pathStr,
        });
        setActiveImportId(savedImport.id);
        await refreshRecentImports();
      }
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleUseRecentImport = useCallback(
    async (item: ImageImportItem) => {
      setImageUrl(item.dataUrl);
      setRegions([]);

      if (item.sourcePath) {
        setImagePath(item.sourcePath);
      } else {
        const savedPath = await commands.saveImageFromDataUrl(item.dataUrl);
        setImagePath(savedPath);
      }

      setActiveImportId(item.id);
      await touchImport(item.id);
      await refreshRecentImports();
    },
    [refreshRecentImports]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileBlob(file);
  };

  const sortedQuestions = useMemo(() => regions.filter(r => r.role === 'question').sort((a, b) => a.y - b.y), [regions]);
  const sortedAnswers = useMemo(() => regions.filter(r => r.role === 'answer').sort((a, b) => a.y - b.y), [regions]);

  const getLabel = useCallback((region: Region) => {
    if (region.role === 'question') {
      const idx = sortedQuestions.findIndex(r => r.id === region.id);
      return `Q${idx + 1}`;
    } else {
      const idx = sortedAnswers.findIndex(r => r.id === region.id);
      return `A${idx + 1}`;
    }
  }, [sortedQuestions, sortedAnswers]);

  const handleCreateCards = async () => {
    if (!folderId || !imagePath || sortedQuestions.length === 0) return;
    setCreating(true);

    try {
      const createdCardIds: string[] = [];
      for (let i = 0; i < sortedQuestions.length; i++) {
        const q = sortedQuestions[i];
        const a = sortedAnswers[i]; // May be undefined

        const qPath = await commands.cropRegion(
          imagePath,
          q.x,
          q.y,
          q.width,
          q.height
        );

        let qType: "image" | "latex" = "image";
        let qContent = qPath;
        let qTitle: string | null = null;

        if (useOcr) {
          try {
            const latex = await commands.ocrImage(qPath);
            qType = "latex";
            qContent = latex;
          } catch {
            /* fall back */
          }
        }

        // Generate title for image questions using LLM
        if (qType === "image") {
          try {
            qTitle = await commands.generateImageTitle(qPath);
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

        const created = await commands.createFlashcard({
          folder_id: folderId,
          title: qTitle,
          question_type: qType,
          question_content: qContent,
          answer_type: aType,
          answer_content: aContent,
        });
        createdCardIds.push(created.id);
      }

      if (activeImportId && createdCardIds.length > 0) {
        await linkFlashcardsToImport(activeImportId, createdCardIds);
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
        <div className="space-y-4">
          <Card
            className={`border-dashed border-2 cursor-pointer transition-colors ${isDragOver
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
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Select a tool, then draw regions corresponding to questions and answers.
            </p>
            <Button variant="outline" size="sm" onClick={handleOpenFile}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Replace image
            </Button>
          </div>

          <div className="flex gap-2 items-center justify-center mb-2">
            <Button
              variant={activeMode === "question" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveMode("question")}
              className={activeMode === "question" ? "font-bold" : ""}
            >
              <Type className="h-4 w-4 mr-2" /> Draw Question
            </Button>
            <Button
              variant={activeMode === "answer" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveMode("answer")}
              className={activeMode === 'answer' ? 'bg-success hover:bg-success text-white font-bold border-success' : ''}
            >
              <LinkIcon className="h-4 w-4 mr-2" /> Draw Answer
            </Button>
          </div>

          <AnnotationCanvas
            imageUrl={imageUrl}
            pageIndex={0}
            regions={regions}
            activeMode={activeMode}
            onRegionAdded={(r) => setRegions(prev => [...prev, r])}
            onRegionDeleted={(id) => setRegions(prev => prev.filter(r => r.id !== id))}
            getLabel={getLabel}
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
                  {sortedQuestions.length} question{sortedQuestions.length !== 1 ? "s" : ""}
                </Badge>
                <Button
                  onClick={handleCreateCards}
                  disabled={creating || sortedQuestions.length === 0 || !folderId}
                >
                  {creating ? (
                    "Creating..."
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-1.5" />
                      Create {sortedQuestions.length} Card
                      {sortedQuestions.length !== 1 ? "s" : ""}
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
