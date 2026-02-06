# FlashMath

FlashMath is a desktop, Anki-style math flashcard app focused on fast capture and targeted review. Create cards from screenshots, PDFs, or images, optionally OCR to LaTeX, set timers (including LLM-estimated difficulty), and study with a modified SM-2 scheduler that penalizes slow responses. Folder-level deadlines compress schedules to keep you on track.

## Features
- Global screenshot capture (Cmd+Shift+M) with box selection.
- OCR to LaTeX (optional) for questions and answers.
- PDF/image import with annotation boxes for Q/A regions.
- Optional answers per flashcard.
- Folder organization + deadlines with progress tracking.
- Timers: 1 min, 5 min, 10 min, or LLM-estimated.
- Study sessions with a modified SM-2 algorithm (speed-aware).
- Tauri v2 desktop app (Rust backend + Next.js frontend).

## Tech Stack
- Tauri v2 (Rust backend)
- Next.js + TypeScript + Tailwind + shadcn/ui
- SQLite via `@tauri-apps/plugin-sql`
- OCR/Difficulty via configurable LLM providers

## Getting Started
```bash
npm install
npm run tauri dev
```

## Build
```bash
npm run build
cargo tauri build
```

## Project Structure
```
src/               # Next.js frontend
src-tauri/         # Tauri (Rust) backend
public/overlay.html # Screenshot selection overlay
```

## App Flow
1. Capture a question/answer via screenshot, PDF, or image import.
2. OCR to LaTeX if desired.
3. Assign to a folder (optional) and pick a timer.
4. Review due cards; speed and accuracy update scheduling.
5. Set folder deadlines to compress schedules and hit mastery dates.

## Notes
- For static export compatibility, dynamic views use query parameters:
  - `folder?id=...`, `card?id=...`, `study?folderId=...`
- LLM provider settings are in the Settings page.

## License
MIT
