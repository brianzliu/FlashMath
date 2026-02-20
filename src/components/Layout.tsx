import { useEffect, useRef } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AIChatPanel } from "./AIChatPanel";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";
import { MessageCircle } from "lucide-react";
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
    <div className="flex h-screen overflow-hidden bg-background text-foreground antialiased">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 pb-8 lg:px-10">
          <Outlet />
        </div>
      </main>

      {/* Floating AI chat trigger */}
      {!aiPanelOpen && (
        <button
          onClick={() => setAiPanelOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full border transition-all shadow-lg",
            "bg-card text-primary border-primary/40 hover:bg-primary/10 hover:border-primary/60"
          )}
          title="Open AI Chat"
          aria-label="Open AI Chat"
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {/* AI Chat Panel — inline split view */}
      <AIChatPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </div>
  );
}
