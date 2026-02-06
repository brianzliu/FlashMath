"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import type { StudyStats } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { folders, setFolders } = useAppStore();
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([commands.getStudyStats(), commands.getFolders()])
      .then(([studyStats, loadedFolders]) => {
        if (!active) return;
        setStats(studyStats);
        setFolders(loadedFolders);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setFolders]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Keep momentum with daily reviews and focused sessions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link href="/study">Study All</Link>
          </Button>
          <Button asChild>
            <Link href="/import/pdf">Import Source</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total cards"
          value={stats ? stats.total_cards.toString() : "--"}
          loading={loading}
        />
        <StatCard
          label="Due today"
          value={stats ? stats.due_today.toString() : "--"}
          loading={loading}
          highlight="warning"
        />
        <StatCard
          label="Reviewed today"
          value={stats ? stats.reviewed_today.toString() : "--"}
          loading={loading}
        />
        <StatCard
          label="Accuracy"
          value={
            stats ? `${Math.round(stats.accuracy_today * 100)}%` : "--"
          }
          loading={loading}
          highlight="success"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Folders</CardTitle>
        </CardHeader>
        <CardContent>
          {folders.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              No folders yet. Use the sidebar to create your first deck.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((folder) => (
                <Link
                  key={folder.id}
                  href={`/folder?id=${folder.id}`}
                  className="rounded-lg border border-border bg-background p-4 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{folder.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Created {new Date(folder.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    {folder.deadline ? (
                      <Badge variant="warning">
                        Due {new Date(folder.deadline).toLocaleDateString()}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">No deadline</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  highlight,
}: {
  label: string;
  value: string;
  loading: boolean;
  highlight?: "success" | "warning";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">
          {loading ? "..." : value}
        </p>
        {highlight === "success" && (
          <p className="mt-1 text-xs text-success">Keep the streak going</p>
        )}
        {highlight === "warning" && (
          <p className="mt-1 text-xs text-warning">Time to review</p>
        )}
      </CardContent>
    </Card>
  );
}
