/**
 * AI Chat service with tool-calling support.
 *
 * Uses OpenAI-compatible message format internally — the Rust backend
 * translates to Anthropic format when needed.  The frontend executes
 * tools locally (it has direct DB access) and loops back to the LLM
 * until no more tool calls are requested.
 */

import * as commands from "./commands";
import type { Flashcard, Folder, StudyStats } from "./types";

// ── Types ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ── Tool definitions (OpenAI format) ───────────────────────────────

const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_all_folders",
      description: "List every deck/folder the user has, including card counts and deadlines.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_flashcards",
      description:
        "Get all flashcards in a specific folder. Returns card content, SRS stats (ease, interval, reps, due date), and timer settings.",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "The folder ID to fetch cards from" },
        },
        required: ["folder_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_due_flashcards",
      description: "Get flashcards that are currently due for review. Optionally filter by folder.",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "Optional folder ID to filter by" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_study_stats",
      description:
        "Get study statistics: total cards, due today, overdue, reviewed today, accuracy today. Optionally scoped to a folder.",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "Optional folder ID" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_flashcard_detail",
      description:
        "Get full details of a single flashcard by ID, including its question content (LaTeX or image path), answer, SRS parameters, and review history.",
      parameters: {
        type: "object",
        properties: {
          flashcard_id: { type: "string", description: "The flashcard ID" },
        },
        required: ["flashcard_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_review_history",
      description: "Get the review history for a flashcard — timestamps, correct/incorrect, speed ratios, ease changes.",
      parameters: {
        type: "object",
        properties: {
          flashcard_id: { type: "string", description: "The flashcard ID" },
        },
        required: ["flashcard_id"],
      },
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case "get_all_folders": {
        const folders: Folder[] = await commands.getFolders();
        const results = [];
        for (const f of folders) {
          const stats: StudyStats = await commands.getStudyStats(f.id);
          results.push({
            id: f.id,
            name: f.name,
            emoji: f.emoji,
            deadline: f.deadline,
            total_cards: stats.total_cards,
            due_today: stats.due_today,
            reviewed_today: stats.reviewed_today,
            accuracy: Math.round(stats.accuracy_today * 100) + "%",
          });
        }
        return JSON.stringify(results, null, 2);
      }

      case "get_flashcards": {
        const folderId = args.folder_id as string;
        const cards: Flashcard[] = await commands.getFlashcards(folderId);
        const summary = cards.map((c) => ({
          id: c.id,
          title: c.title,
          question_type: c.question_type,
          question_preview:
            c.question_type === "latex"
              ? c.question_content.slice(0, 120)
              : "[image]",
          has_answer: Boolean(c.answer_content),
          timer_mode: c.timer_mode,
          ease_factor: c.ease_factor,
          interval_days: Math.round(c.interval_days * 10) / 10,
          repetitions: c.repetitions,
          due_date: c.due_date,
          last_reviewed: c.last_reviewed,
        }));
        return JSON.stringify(summary, null, 2);
      }

      case "get_due_flashcards": {
        const fId = args.folder_id as string | undefined;
        const due: Flashcard[] = await commands.getDueFlashcards(fId);
        const summary = due.map((c) => ({
          id: c.id,
          title: c.title,
          question_preview:
            c.question_type === "latex"
              ? c.question_content.slice(0, 120)
              : "[image]",
          ease_factor: c.ease_factor,
          interval_days: Math.round(c.interval_days * 10) / 10,
          repetitions: c.repetitions,
          due_date: c.due_date,
        }));
        return JSON.stringify(summary, null, 2);
      }

      case "get_study_stats": {
        const sid = args.folder_id as string | undefined;
        const stats: StudyStats = await commands.getStudyStats(sid);
        return JSON.stringify(stats, null, 2);
      }

      case "get_flashcard_detail": {
        const card: Flashcard = await commands.getFlashcard(args.flashcard_id as string);
        return JSON.stringify(
          {
            ...card,
            question_content:
              card.question_type === "latex"
                ? card.question_content
                : "[image at " + card.question_content + "]",
            answer_content:
              card.answer_type === "latex"
                ? card.answer_content
                : card.answer_content
                ? "[image]"
                : null,
          },
          null,
          2
        );
      }

      case "get_review_history": {
        const reviews = await commands.getReviewHistory(args.flashcard_id as string);
        return JSON.stringify(reviews.slice(0, 20), null, 2);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}

// ── Normalise LLM response ────────────────────────────────────────

interface NormalisedResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

function normaliseResponse(raw: Record<string, unknown>): NormalisedResponse {
  // OpenAI format
  const choices = raw.choices as Array<{ message: Record<string, unknown> }> | undefined;
  if (choices?.[0]?.message) {
    const msg = choices[0].message;
    return {
      content: (msg.content as string) ?? null,
      toolCalls: (msg.tool_calls as ToolCall[]) ?? [],
    };
  }

  // Anthropic format
  const contentBlocks = raw.content as Array<Record<string, unknown>> | undefined;
  if (contentBlocks) {
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of contentBlocks) {
      if (block.type === "text") text += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id as string,
          type: "function",
          function: {
            name: block.name as string,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }
    return { content: text || null, toolCalls };
  }

  return { content: null, toolCalls: [] };
}

// ── Main chat function ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are FlashMath AI, a helpful study assistant embedded in a flashcard app. You have access to tools that let you look up the user's decks, flashcards, review history, and study statistics.

When the user asks about their flashcards, study progress, or needs help understanding a concept from their cards, use the tools to fetch real data first, then respond with specific, accurate information.

Keep responses concise and helpful. Use markdown formatting sparingly (bold for emphasis, lists when appropriate). When discussing math, use LaTeX notation.

If the user asks you to explain a concept or solve a problem from one of their flashcards, do so clearly and step-by-step.`;

const MAX_TOOL_ROUNDS = 6;

export async function sendChat(
  history: ChatMessage[],
  onToolCall?: (name: string) => void
): Promise<ChatMessage> {
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const raw = await commands.chatCompletion(messages, TOOLS);
    const { content, toolCalls } = normaliseResponse(raw);

    if (toolCalls.length === 0) {
      // Done — return the assistant's final message
      return { role: "assistant", content: content || "(No response)" };
    }

    // The assistant wants to call tools — add its message with tool_calls
    messages.push({ role: "assistant", content, tool_calls: toolCalls });

    // Execute each tool and add results
    for (const tc of toolCalls) {
      onToolCall?.(tc.function.name);
      const args = JSON.parse(tc.function.arguments || "{}");
      const result = await executeTool(tc.function.name, args);
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
        name: tc.function.name,
      });
    }
  }

  // Exhausted rounds — ask the LLM for a final answer without tools
  const finalRaw = await commands.chatCompletion(messages, undefined);
  const { content } = normaliseResponse(finalRaw);
  return { role: "assistant", content: content || "(No response)" };
}
