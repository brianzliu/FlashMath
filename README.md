# FlashMath

A desktop flashcard app built for studying math. Take screenshots of problems, organize them into decks, and review them with a smart spaced repetition system that adapts to how well you know each card.

## What it does

- **Screenshot capture** - Press a keyboard shortcut to capture any math problem on your screen and turn it into a flashcard
- **PDF & image import** - Drop a PDF or image file, draw rectangles around questions and answers, and FlashMath creates the cards for you
- **LaTeX support** - Type math formulas directly using LaTeX notation with live preview
- **OCR** - Optionally convert screenshot/image cards to editable LaTeX using an AI model
- **Smart review scheduling** - Uses a spaced repetition algorithm (like Anki) that shows you cards right before you'd forget them. Cards you get right come back less often; cards you struggle with come back sooner
- **Timed practice** - Each card has a timer (1, 5, or 10 minutes). Answering quickly boosts the card's score; taking too long penalizes it
- **Deadline mode** - Set a deadline for a deck (e.g., "exam on March 15") and the algorithm compresses review intervals to make sure you've mastered everything by that date
- **Deck organization** - Group cards into decks, rename them, set deadlines, and track your mastery progress
- **Browse & search** - Search across all your cards, filter by status (due, new, upcoming), and sort by difficulty or date

## Getting started

### Requirements

- [Rust](https://rustup.rs/) (for the desktop app backend)
- [Node.js](https://nodejs.org/) 18+ (for the frontend)

### Run in development

```bash
# Install frontend dependencies
npm install

# Start the app
cargo tauri dev
```

This opens the app in a native window. The frontend hot-reloads as you make changes.

### Build for production

```bash
cargo tauri build
```

This creates an installer for your platform (`.dmg` on Mac, `.msi` on Windows, `.deb`/`.AppImage` on Linux).

## Setting up AI features (optional)

FlashMath can use an AI model for two things:
1. **OCR** - Converting images of math into editable LaTeX
2. **Difficulty estimation** - Automatically setting how long a question should take

To enable these, go to **Settings** in the app and configure a provider:

| Provider | What you need |
|----------|--------------|
| OpenAI | API key from platform.openai.com |
| Anthropic | API key from console.anthropic.com |
| OpenRouter | API key from openrouter.ai |
| Ollama | Just install Ollama locally (free, no API key) |
| Custom | Any OpenAI-compatible API endpoint |

The app works perfectly without AI — you just won't have OCR or auto-timing.

## How the review system works

FlashMath uses a modified version of the SM-2 algorithm (the same one Anki uses):

1. **New cards** are shown immediately
2. After you review a card, it gets scheduled for later based on how you did:
   - **Got it right quickly** — Comes back in a longer interval (you know it well)
   - **Got it right at normal speed** — Standard interval increase
   - **Got it right slowly** — Shorter interval (you're struggling a bit)
   - **Got it wrong** — Resets to 1 day (needs more practice)
3. Each card has an "ease factor" that goes up when you do well and down when you struggle
4. If you set a **deadline**, intervals are compressed so you cycle through all cards enough times before the date

## Project structure

```
src/          - Frontend (React + TypeScript)
src-tauri/    - Backend (Rust)
```

Your flashcards are stored in a local database on your computer. Nothing is sent to the cloud (except AI requests if you enable OCR).

## License

MIT
