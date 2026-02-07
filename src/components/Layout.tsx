import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "@/stores/app-store";
import * as commands from "@/lib/commands";

export function Layout() {
  const navigate = useNavigate();
  const setPendingScreenshot = useAppStore((s) => s.setPendingScreenshot);

  // Listen for global screenshot shortcut (Cmd+Shift+6) from any screen
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen("screenshot-shortcut", async () => {
          try {
            const dataUrl = await commands.takeScreenshot();
            if (dataUrl) {
              setPendingScreenshot(dataUrl);
              navigate("/card");
            }
          } catch (err) {
            console.error("Screenshot failed:", err);
          }
        });
        cleanup = unlisten;
      } catch {
        // Not running in Tauri
      }
    })();

    return () => {
      cleanup?.();
    };
  }, [navigate, setPendingScreenshot]);

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
