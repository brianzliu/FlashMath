import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AIChatPanel } from "./AIChatPanel";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { Sparkles } from "lucide-react";
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
        <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
          <Outlet />
        </div>
      </main>

      {/* AI Chat Panel — inline split view */}
      <AIChatPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />

      {/* AI Chat floating toggle */}
      <button
        onClick={() => setAiPanelOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center",
          "rounded-2xl shadow-lg transition-all duration-300 hover:scale-105 active:scale-95",
          "bg-gradient-to-br from-primary/90 to-primary hover:shadow-primary/25 hover:shadow-xl",
          aiPanelOpen && "opacity-0 pointer-events-none scale-90"
        )}
        title="Open AI Chat"
      >
        <Sparkles className="h-5 w-5 text-white" />
      </button>
    </div>
  );
}
