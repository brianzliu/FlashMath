import { useState, useEffect, useCallback } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { Folder, Flashcard } from "@/lib/types";
import {
  LayoutDashboard,
  Settings,
  FolderPlus,
  Folder as FolderIcon,
  Trash2,
  BookOpen,
  Zap,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FolderWithStats extends Folder {
  cardCount: number;
  dueCount: number;
}

export function Sidebar() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pathname = location.pathname;
  const activeFolderId =
    pathname === "/folder" ? searchParams.get("id") : null;
  const { folders, setFolders, addFolder, removeFolder, updateFolder } =
    useAppStore();
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [folderStats, setFolderStats] = useState<
    Map<string, { cardCount: number; dueCount: number }>
  >(new Map());

  const loadFolders = useCallback(async () => {
    try {
      const data = await commands.getFolders();
      setFolders(data);

      // Load stats for each folder
      const statsMap = new Map<
        string,
        { cardCount: number; dueCount: number }
      >();
      for (const folder of data) {
        try {
          const stats = await commands.getStudyStats(folder.id);
          statsMap.set(folder.id, {
            cardCount: stats.total_cards,
            dueCount: stats.due_today,
          });
        } catch {
          statsMap.set(folder.id, { cardCount: 0, dueCount: 0 });
        }
      }
      setFolderStats(statsMap);
    } catch {
      // Running outside Tauri
    }
  }, [setFolders]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreateError("Name required");
      return;
    }
    try {
      const folder = await commands.createFolder(name);
      addFolder(folder);
      setFolderStats((prev) => {
        const next = new Map(prev);
        next.set(folder.id, { cardCount: 0, dueCount: 0 });
        return next;
      });
      setNewFolderName("");
      setIsCreating(false);
      setCreateError(null);
    } catch {
      setCreateError("Failed to create folder.");
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await commands.renameFolder(id, editName.trim());
      updateFolder(id, { name: editName.trim() });
      setEditingId(null);
    } catch {
      /* noop */
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await commands.deleteFolder(id);
      removeFolder(id);
    } catch {
      /* noop */
    }
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-extrabold text-sm">
            FM
          </div>
          <span className="text-lg font-bold tracking-tight">FlashMath</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="px-3 space-y-0.5">
        <NavItem
          to="/"
          label="Dashboard"
          icon={<LayoutDashboard className="h-4 w-4" />}
          active={pathname === "/"}
        />
        <NavItem
          to="/browse"
          label="Browse Cards"
          icon={<Library className="h-4 w-4" />}
          active={pathname === "/browse"}
        />
        <NavItem
          to="/settings"
          label="Settings"
          icon={<Settings className="h-4 w-4" />}
          active={pathname === "/settings"}
        />
      </nav>

      {/* Folders */}
      <div className="mt-5 px-3 flex-1 overflow-y-auto min-h-0">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Decks
          </span>
          <button
            onClick={() => {
              setIsCreating(true);
              setCreateError(null);
            }}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Create folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
        </div>

        {isCreating && (
          <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setIsCreating(false);
              }}
              placeholder="Deck name..."
              autoFocus
              className="h-8 text-sm"
            />
            {createError && (
              <p className="text-[11px] text-destructive">{createError}</p>
            )}
            <div className="flex gap-1.5">
              <Button size="sm" onClick={handleCreateFolder} className="h-7 text-xs px-3">
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsCreating(false)}
                className="h-7 text-xs px-3"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-0.5">
          {folders.length === 0 && !isCreating && (
            <button
              onClick={() => setIsCreating(true)}
              className="w-full rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
            >
              Create your first deck
            </button>
          )}
          {folders.map((folder) => {
            const stats = folderStats.get(folder.id);
            return (
              <FolderItem
                key={folder.id}
                folder={folder}
                cardCount={stats?.cardCount ?? 0}
                dueCount={stats?.dueCount ?? 0}
                isActive={activeFolderId === folder.id}
                isEditing={editingId === folder.id}
                editName={editName}
                onStartEdit={() => {
                  setEditingId(folder.id);
                  setEditName(folder.name);
                }}
                onEditChange={setEditName}
                onSaveEdit={() => handleRenameFolder(folder.id)}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => handleDeleteFolder(folder.id)}
              />
            );
          })}
        </div>
      </div>

      {/* Quick study */}
      <div className="px-3 pb-4 pt-2">
        <Link
          to="/study"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Zap className="h-4 w-4" />
          Quick Study
        </Link>
      </div>
    </aside>
  );
}

function NavItem({
  to,
  label,
  icon,
  active,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:text-foreground hover:bg-accent"
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

function FolderItem({
  folder,
  cardCount,
  dueCount,
  isActive,
  isEditing,
  editName,
  onStartEdit,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  folder: Folder;
  cardCount: number;
  dueCount: number;
  isActive: boolean;
  isEditing: boolean;
  editName: string;
  onStartEdit: () => void;
  onEditChange: (name: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <div className="px-1 py-0.5">
        <Input
          type="text"
          value={editName}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          autoFocus
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="group relative">
      <Link
        to={`/folder?id=${folder.id}`}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-semibold"
            : "text-foreground/80 hover:text-foreground hover:bg-accent"
        )}
        onDoubleClick={onStartEdit}
      >
        {folder.emoji ? (
          <span className="shrink-0 text-sm">{folder.emoji}</span>
        ) : (
          <FolderIcon className="h-4 w-4 shrink-0 opacity-60" />
        )}
        <span className="truncate flex-1">{folder.name}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {dueCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">
              {dueCount}
            </span>
          )}
          {dueCount === 0 && cardCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              {cardCount}
            </span>
          )}
        </span>
      </Link>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="Delete deck"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
