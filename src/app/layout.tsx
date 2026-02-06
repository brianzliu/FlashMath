"use client";

import { Suspense } from "react";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex h-screen overflow-hidden">
          <Suspense fallback={<div className="w-64 bg-card border-r border-border" />}>
            <Sidebar />
          </Suspense>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
