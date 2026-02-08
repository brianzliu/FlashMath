import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import type { Flashcard, StudyStats } from "@/lib/types";
import { cn, daysUntil } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  BookOpen,
  Target,
  TrendingUp,
  Clock,
  FolderOpen,
  RotateCcw,
} from "lucide-react";

const DECK_EMOJIS = [
  "\u{1F4D0}", "\u{1F4D0}", "\u{1F4DA}", "\u{1F4D6}", "\u{1F9EE}", "\u{1F4CA}", "\u{1F52C}", "\u{1F9EA}", "\u{1F9EC}",
  "\u{1F4BB}", "\u{1F5A5}\uFE0F", "\u{1F310}", "\u{1F30D}", "\u{1F4D0}", "\u{1F3AF}", "\u{1F9E0}", "\u{1F3B5}", "\u{1F3A8}",
  "\u{2795}", "\u{2796}", "\u{2716}\uFE0F", "\u{2797}", "\u{221A}", "\u{03C0}", "\u{1F4AF}", "\u{2B50}", "\u{26A1}",
  "\u{1F680}", "\u{1F525}", "\u{1F4A1}",
];

interface FolderMetrics {
  stats: StudyStats;
  mastery: number; // percentage of cards with interval >= 7 days
  avgEase: number;
}

export default function Dashboard() {
  const { folders, setFolders, updateFolder } = useAppStore();
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [folderMetrics, setFolderMetrics] = useState<Map<string, FolderMetrics>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [emojiPickerFolderId, setEmojiPickerFolderId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([commands.getStudyStats(), commands.getFolders()])
      .then(async ([studyStats, loadedFolders]) => {
        if (!active) return;
        setStats(studyStats);
        setFolders(loadedFolders);

        const metricsMap = new Map<string, FolderMetrics>();
        for (const folder of loadedFolders) {
          try {
            const [fStats, cards] = await Promise.all([
              commands.getStudyStats(folder.id),
              commands.getFlashcards(folder.id),
            ]);
            const mastered = cards.filter((c: Flashcard) => c.interval_days >= 7).length;
            const mastery = cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0;
            const avgEase = cards.length > 0
              ? Math.round((cards.reduce((sum: number, c: Flashcard) => sum + c.ease_factor, 0) / cards.length) * 100) / 100
              : 2.5;
            metricsMap.set(folder.id, { stats: fStats, mastery, avgEase });
          } catch {
            /* noop */
          }
        }
        if (active) setFolderMetrics(metricsMap);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setFolders]);

  const handleSetEmoji = async (folderId: string, emoji: string | null) => {
    try {
      await commands.setFolderEmoji(folderId, emoji);
      updateFolder(folderId, { emoji });
    } catch {
      /* noop */
    }
    setEmojiPickerFolderId(null);
  };

  const totalDue = stats?.due_today ?? 0;
  const accuracy = stats ? Math.round(stats.accuracy_today * 100) : 0;

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {getGreeting()}
          </h1>
          <p className="text-muted-foreground mt-1">
            {totalDue > 0
              ? `You have ${totalDue} card${totalDue !== 1 ? "s" : ""} waiting for review.`
              : "You're all caught up! Nice work."}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {totalDue > 0 && (
            <Button asChild>
              <Link to="/study">
                <Zap className="h-4 w-4 mr-1.5" />
                Study Now ({totalDue})
              </Link>
            </Button>
          )}
          {(stats?.total_cards ?? 0) > 0 && (
            <Button variant="outline" asChild>
              <Link to="/study?mode=all">
                <RotateCcw className="h-4 w-4 mr-1.5" />
                Review All
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 stagger-children">
        <StatCard
          icon={<BookOpen className="h-4 w-4" />}
          label="Total Cards"
          value={loading ? "--" : (stats?.total_cards ?? 0).toString()}
          accent="text-primary"
        />
        <StatCard
          icon={<Clock className="h-4 w-4" />}
          label="Due Today"
          value={loading ? "--" : totalDue.toString()}
          accent="text-warning"
          pulse={totalDue > 0}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Reviewed Today"
          value={loading ? "--" : (stats?.reviewed_today ?? 0).toString()}
          accent="text-success"
        />
        <StatCard
          icon={<Target className="h-4 w-4" />}
          label="Accuracy"
          value={loading ? "--" : `${accuracy}%`}
          accent="text-primary"
          ring={!loading ? accuracy : undefined}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Your Decks</h2>
          <span className="text-sm text-muted-foreground">
            {folders.length} deck{folders.length !== 1 ? "s" : ""}
          </span>
        </div>
        {folders.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-muted-foreground">
                No decks yet. Create one from the sidebar to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
            {folders.map((folder) => {
              const metrics = folderMetrics.get(folder.id);
              const due = metrics?.stats.due_today ?? 0;
              const total = metrics?.stats.total_cards ?? 0;
              const reviewed = metrics?.stats.reviewed_today ?? 0;
              const mastery = metrics?.mastery ?? 0;
              const avgEase = metrics?.avgEase ?? 2.5;

              return (
                <div key={folder.id} className="group relative">
                  <Link
                    to={`/folder?id=${folder.id}`}
                  >
                    <Card className="h-full transition-all hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5">
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEmojiPickerFolderId(
                                  emojiPickerFolderId === folder.id ? null : folder.id
                                );
                              }}
                              className="shrink-0 h-8 w-8 rounded-lg bg-muted/50 hover:bg-muted flex items-center justify-center text-lg transition-colors"
                              title="Set emoji"
                            >
                              {folder.emoji || "\u{1F4C1}"}
                            </button>
                            <h3 className="font-bold text-sm group-hover:text-primary transition-colors truncate">
                              {folder.name}
                            </h3>
                          </div>
                          {folder.deadline && (
                            <DeadlineBadge deadline={folder.deadline} />
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {total} card{total !== 1 ? "s" : ""}
                          </span>
                          {due > 0 && (
                            <span className="text-primary font-semibold">
                              {due} due
                            </span>
                          )}
                          {reviewed > 0 && (
                            <span className="text-success">
                              {reviewed} reviewed
                            </span>
                          )}
                        </div>

                        {total > 0 && (
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span title="Cards with interval >= 7 days">
                              Mastery: <span className={cn("font-semibold", mastery >= 70 ? "text-success" : mastery >= 40 ? "text-warning" : "text-muted-foreground")}>{mastery}%</span>
                            </span>
                            <span title="Average ease factor">
                              Ease: <span className="font-semibold">{avgEase.toFixed(2)}</span>
                            </span>
                          </div>
                        )}

                        {total > 0 && (
                          <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary/60 transition-all"
                              style={{
                                width: `${Math.min(100, total > 0 ? ((total - due) / total) * 100 : 0)}%`,
                              }}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>

                  {emojiPickerFolderId === folder.id && (
                    <EmojiPicker
                      currentEmoji={folder.emoji}
                      onSelect={(emoji) => handleSetEmoji(folder.id, emoji)}
                      onClose={() => setEmojiPickerFolderId(null)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmojiPicker({
  currentEmoji,
  onSelect,
  onClose,
}: {
  currentEmoji: string | null;
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-14 left-4 z-50 rounded-xl border border-border bg-popover shadow-lg p-3 w-64 animate-fade-up"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground">Pick an emoji</p>
        {currentEmoji && (
          <button
            onClick={() => onSelect(null)}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      <div className="grid grid-cols-8 gap-1">
        {DECK_EMOJIS.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            onClick={() => onSelect(emoji)}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center text-base hover:bg-accent transition-colors",
              currentEmoji === emoji && "bg-primary/15 ring-1 ring-primary"
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  icon,
  label,
  value,
  accent,
  pulse,
  ring,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  pulse?: boolean;
  ring?: number;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          {ring !== undefined ? (
            <span className="relative">
              <ProgressRing percent={ring} size={24} stroke={2.5} />
              <span className={cn("absolute inset-0 flex items-center justify-center", accent)}>
                {icon}
              </span>
            </span>
          ) : (
            <span className={cn("opacity-60", accent)}>{icon}</span>
          )}
          {pulse && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-warning opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-warning" />
            </span>
          )}
        </div>
        <p className={cn("text-2xl font-extrabold", accent)}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}

function ProgressRing({
  percent,
  size,
  stroke,
}: {
  percent: number;
  size: number;
  stroke: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-border"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all duration-700"
        style={{ animation: "progress-fill 0.8s ease-out" }}
      />
    </svg>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = daysUntil(deadline);
  const variant =
    days <= 3 ? "destructive" : days <= 7 ? "warning" : "secondary";
  return (
    <Badge variant={variant} className="text-[10px] shrink-0">
      {days <= 0 ? "Overdue" : `${days}d left`}
    </Badge>
  );
}
