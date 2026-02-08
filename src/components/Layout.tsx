import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AIChatPanel } from "./AIChatPanel";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

export function Layout() {
  const navigate = useNavigate();
  const setPendingScreenshot = useAppStore((s) => s.setPendingScreenshot);
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen);
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen);
  const navigateRef = useRef(navigate);
  const setPendingScreenshotRef = useRef(setPendingScreenshot);

  useEffect(() => {
    navigateRef.current = navigate;
    setPendingScreenshotRef.current = setPendingScreenshot;
  }, [navigate, setPendingScreenshot]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen("screenshot-shortcut", async () => {
          try {
            const dataUrl = await commands.takeScreenshot();
            if (dataUrl) {
              setPendingScreenshotRef.current(dataUrl);
              navigateRef.current("/card");
            }
          } catch (err) {
            console.error("Screenshot failed:", err);
          }
        });
      } catch (err) {
        console.log("Not running in Tauri or event listener failed:", err);
      }
    };

    setupListener();

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {/* Top bar with AI toggle */}
        <div className="sticky top-0 z-20 flex justify-end px-6 pt-3 pb-0 lg:px-10 pointer-events-none">
          <button
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            className={cn(
              "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg transition-all",
              aiPanelOpen
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title={aiPanelOpen ? "Close AI Chat" : "Open AI Chat"}
          >
            <Bot className="h-4 w-4" />
          </button>
        </div>
        <div className="mx-auto max-w-5xl px-6 pb-8 lg:px-10">
          <Outlet />
        </div>
      </main>

      {/* AI Chat Panel — inline split view */}
      <AIChatPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </div>
  );
}
