"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { Folder } from "@/lib/types";

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
    if (!newFolderName.trim()) return;
    try {
      const folder = await commands.createFolder(newFolderName.trim());
      addFolder(folder);
      setNewFolderName("");
      setIsCreating(false);
    } catch {
      // Handle error
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
    <aside className="w-64 h-full border-r border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold">FlashMath</h1>
      </div>

      <nav className="p-2 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted text-foreground"
            )}
          >
            {item.icon === "grid" && <GridIcon />}
            {item.icon === "settings" && <SettingsIcon />}
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-2 border-t border-border">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-medium text-muted-foreground">
            Folders
          </span>
          <button
            onClick={() => setIsCreating(true)}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            title="New folder"
          >
            +
          </button>
        </div>

        {isCreating && (
          <div className="px-3 py-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setIsCreating(false);
              }}
              placeholder="Folder name"
              className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
              autoFocus
            />
          </div>
        )}

        <div className="space-y-0.5">
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

      <div className="mt-auto p-2 border-t border-border">
        <Link
          href="/import/pdf"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted text-foreground transition-colors"
        >
          <ImportIcon />
          Import PDF
        </Link>
        <Link
          href="/import/image"
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted text-foreground transition-colors"
        >
          <ImageIcon />
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
      <div className="px-3 py-1">
        <input
          type="text"
          value={editName}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
          className="w-full px-2 py-1 text-sm border border-border rounded bg-background"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center">
      <Link
        href={`/folder?id=${folder.id}`}
        className={cn(
          "flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "hover:bg-muted text-foreground"
        )}
        onDoubleClick={onStartEdit}
      >
        <FolderIcon />
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
        className="opacity-0 group-hover:opacity-100 px-1 text-muted-foreground hover:text-destructive text-xs transition-opacity"
        title="Delete folder"
      >
        x
      </button>
    </div>
  );
}

function GridIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
