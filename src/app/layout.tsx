"use client";

import { Suspense } from "react";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Separator } from "@/components/ui/separator";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-muted/40 text-foreground">
        <div className="flex min-h-screen">
          <Suspense fallback={<div className="w-72 bg-card border-r border-border" />}>
            <Sidebar />
          </Suspense>
          <div className="flex min-h-screen flex-1 flex-col">
            <header className="sticky top-0 z-10 bg-background/70 backdrop-blur">
              <div className="flex h-14 items-center justify-between px-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    FlashMath
                  </p>
                  <p className="text-sm font-semibold">
                    Build mastery, one card at a time
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  Focus mode ready
                </div>
              </div>
              <Separator />
            </header>
            <main className="flex-1 px-6 py-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
