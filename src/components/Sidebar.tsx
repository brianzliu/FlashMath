"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { Folder } from "@/lib/types";
import {
  LayoutDashboard,
  Settings,
  FolderPlus,
  Folder as FolderIcon,
  Trash2,
  ImagePlus,
  FileDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeFolderId = pathname === "/folder" ? searchParams.get("id") : null;
  const { folders, setFolders, addFolder, removeFolder, updateFolder } =
    useAppStore();
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      const data = await commands.getFolders();
      setFolders(data);
    } catch {
      // Running outside Tauri (dev mode) - use empty state
    }
  }, [setFolders]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreateError("Folder name is required.");
      return;
    }
    try {
      const folder = await commands.createFolder(name);
      addFolder(folder);
      setNewFolderName("");
      setIsCreating(false);
      setCreateError(null);
    } catch {
      setCreateError("Failed to create folder. Try again.");
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await commands.renameFolder(id, editName.trim());
      updateFolder(id, { name: editName.trim() });
      setEditingId(null);
    } catch {
      // Handle error
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      await commands.deleteFolder(id);
      removeFolder(id);
    } catch {
      // Handle error
    }
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: "grid" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];

  return (
    <aside className="flex h-screen w-72 flex-col border-r border-border bg-background">
      <div className="px-6 py-5">
        <p className="text-xs font-medium text-muted-foreground">Workspace</p>
        <h1 className="text-lg font-semibold">FlashMath</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Focused recall and spaced repetition
        </p>
      </div>

      <nav className="px-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === item.href
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-foreground hover:bg-accent"
            )}
          >
            {item.icon === "grid" && <LayoutDashboard className="h-4 w-4" />}
            {item.icon === "settings" && <Settings className="h-4 w-4" />}
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-3 pt-4">
        <Separator />
      </div>

      <div className="px-3 py-3">
        <div className="flex items-center justify-between px-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </span>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setIsCreating(true);
              setCreateError(null);
            }}
            aria-label="Create folder"
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>

        {isCreating && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setIsCreating(false);
              }}
              placeholder="Folder name"
              autoFocus
            />
            {createError && (
              <p className="text-xs text-destructive">{createError}</p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreateFolder}>
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsCreating(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3 space-y-1">
          {folders.length === 0 && (
            <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
              No folders yet. Create one to start building decks.
            </div>
          )}
          {folders.map((folder) => (
            <FolderItem
              key={folder.id}
              folder={folder}
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
          ))}
        </div>
      </div>

      <div className="mt-auto px-3 pb-4">
        <Separator className="mb-3" />
        <Link
          href="/import/pdf"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <FileDown className="h-4 w-4" />
          Import PDF
        </Link>
        <Link
          href="/import/image"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          <ImagePlus className="h-4 w-4" />
          Import Image
        </Link>
      </div>
    </aside>
  );
}

function FolderItem({
  folder,
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
      <div className="px-2 py-1">
        <Input
          type="text"
          value={editName}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center justify-between rounded-md px-2">
      <Link
        href={`/folder?id=${folder.id}`}
        className={cn(
          "flex-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-foreground hover:bg-accent"
        )}
        onDoubleClick={onStartEdit}
      >
        <FolderIcon className="h-4 w-4" />
        <span className="truncate">{folder.name}</span>
        {folder.deadline && (
          <span className="ml-auto text-xs opacity-60">
            {new Date(folder.deadline).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </Link>
      <button
        onClick={onDelete}
        className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100"
        title="Delete folder"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
