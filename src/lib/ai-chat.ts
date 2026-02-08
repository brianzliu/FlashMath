/**
 * AI Chat service with tool-calling support.
 *
 * Uses OpenAI-compatible message format internally — the Rust backend
 * translates to Anthropic format when needed.  The frontend executes
 * tools locally (it has direct DB access) and loops back to the LLM
 * until no more tool calls are requested.
 */

import * as commands from "./commands";
import { useAppStore } from "@/stores/app-store";
import type { Flashcard, Folder, StudyStats, CreateFlashcardInput } from "./types";

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
  {
    type: "function",
    function: {
      name: "create_flashcard",
      description:
        "Create a single flashcard in a specific folder. Use $...$ for inline math and $$...$$ for display math in question/answer text. The card is saved immediately.",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "The folder ID to create the card in" },
          question: { type: "string", description: "The question text (use $...$ for math)" },
          answer: { type: "string", description: "The answer text (use $...$ for math)" },
        },
        required: ["folder_id", "question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_flashcards",
      description:
        "Propose multiple flashcards for the user to review before creating them. Returns a preview. The user must confirm before cards are saved. Use this when the user asks to create many cards at once or when bulk-generating cards on a topic.",
      parameters: {
        type: "object",
        properties: {
          folder_id: { type: "string", description: "The folder ID to create cards in" },
          cards: {
            type: "array",
            description: "Array of proposed flashcards",
            items: {
              type: "object",
              properties: {
                question: { type: "string", description: "The question text" },
                answer: { type: "string", description: "The answer text" },
              },
              required: ["question", "answer"],
            },
          },
        },
        required: ["folder_id", "cards"],
      },
    },
  },
];

// Editor tools — only included when user is in the card editor
const EDITOR_TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "set_editor_question",
      description:
        "Set the question text in the currently open card editor. The user will see the change in real time. Use $...$ for inline math and $$...$$ for display math.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The question text to set" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_editor_answer",
      description:
        "Set the answer text in the currently open card editor. The user will see the change in real time. Use $...$ for inline math and $$...$$ for display math.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The answer text to set" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_editor_timer",
      description:
        "Set the timer for the currently open card editor. Mode can be '1min', '5min', '10min', or 'custom'. For custom, provide minutes and seconds.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["1min", "5min", "10min", "custom"], description: "Timer mode" },
          minutes: { type: "number", description: "Custom timer minutes (only for custom mode)" },
          seconds: { type: "number", description: "Custom timer seconds (only for custom mode)" },
        },
        required: ["mode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_editor_field",
      description: "Clear the question or answer field in the currently open card editor.",
      parameters: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["question", "answer", "both"], description: "Which field to clear" },
        },
        required: ["field"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_editor_content",
      description: "Read the current question and answer text from the open card editor.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ── Tool executor ──────────────────────────────────────────────────

// Callback for proposed cards that need user confirmation
let _onProposedCards: ((cards: Array<{ question: string; answer: string; folderId: string | null }>) => void) | null = null;

export function setOnProposedCards(
  cb: ((cards: Array<{ question: string; answer: string; folderId: string | null }>) => void) | null
) {
  _onProposedCards = cb;
}

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

      case "create_flashcard": {
        const input: CreateFlashcardInput = {
          folder_id: (args.folder_id as string) || null,
          question_type: "latex",
          question_content: args.question as string,
          answer_type: args.answer ? "latex" : undefined,
          answer_content: args.answer as string | undefined,
        };
        const card = await commands.createFlashcard(input);
        return JSON.stringify({
          success: true,
          card_id: card.id,
          message: "Flashcard created successfully",
        });
      }

      case "propose_flashcards": {
        const proposedCards = (args.cards as Array<{ question: string; answer: string }>).map(
          (c) => ({
            question: c.question,
            answer: c.answer,
            folderId: (args.folder_id as string) || null,
          })
        );
        // Notify the UI about proposed cards
        if (_onProposedCards) {
          _onProposedCards(proposedCards);
        }
        return JSON.stringify({
          success: true,
          count: proposedCards.length,
          message: `Proposed ${proposedCards.length} cards. The user will review and confirm them in the UI.`,
        });
      }

      // ── Editor tools ──
      case "set_editor_question": {
        const cbs = useAppStore.getState().editorCallbacks;
        if (!cbs) return JSON.stringify({ error: "No card editor is open" });
        cbs.setQuestion(args.content as string);
        return JSON.stringify({ success: true, message: "Question updated in editor" });
      }

      case "set_editor_answer": {
        const cbs = useAppStore.getState().editorCallbacks;
        if (!cbs) return JSON.stringify({ error: "No card editor is open" });
        cbs.setAnswer(args.content as string);
        return JSON.stringify({ success: true, message: "Answer updated in editor" });
      }

      case "set_editor_timer": {
        const cbs = useAppStore.getState().editorCallbacks;
        if (!cbs) return JSON.stringify({ error: "No card editor is open" });
        const mode = args.mode as string;
        if (mode === "custom") {
          cbs.setTimerSeconds((args.minutes as number) || 0, (args.seconds as number) || 0);
        } else {
          cbs.setTimerMode(mode);
        }
        return JSON.stringify({ success: true, message: `Timer set to ${mode}` });
      }

      case "clear_editor_field": {
        const cbs = useAppStore.getState().editorCallbacks;
        if (!cbs) return JSON.stringify({ error: "No card editor is open" });
        const field = args.field as string;
        if (field === "question" || field === "both") cbs.setQuestion("");
        if (field === "answer" || field === "both") cbs.setAnswer("");
        return JSON.stringify({ success: true, message: `Cleared ${field}` });
      }

      case "get_editor_content": {
        const cbs = useAppStore.getState().editorCallbacks;
        if (!cbs) return JSON.stringify({ error: "No card editor is open" });
        return JSON.stringify({
          question: cbs.getQuestion(),
          answer: cbs.getAnswer(),
        });
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

const SYSTEM_PROMPT = `You are FlashMath AI, a helpful study assistant embedded in a flashcard app. You have access to tools that let you look up the user's decks, flashcards, review history, and study statistics. You can also CREATE flashcards.

When the user asks about their flashcards, study progress, or needs help understanding a concept from their cards, use the tools to fetch real data first, then respond with specific, accurate information.

CARD CREATION:
- When the user asks to create a single card, use create_flashcard to save it immediately.
- When the user asks to create many cards or generate cards on a topic, use propose_flashcards. This shows the user a preview for confirmation before saving.
- Always look up the user's folders first so you know which folder_id to use.

MATH FORMATTING:
- Use $...$ for inline math (e.g. "What is $\\int_0^1 x^2 \\, dx$?")
- Use $$...$$ for display math on its own line
- NEVER put entire sentences inside dollar signs — only math expressions
- Regular text goes outside dollar signs

Keep responses concise and helpful. Use markdown formatting sparingly (bold for emphasis, lists when appropriate).

If the user asks you to explain a concept or solve a problem from one of their flashcards, do so clearly and step-by-step.`;

const MAX_TOOL_ROUNDS = 6;

export async function sendChat(
  history: ChatMessage[],
  onToolCall?: (name: string) => void
): Promise<ChatMessage> {
  const editorOpen = useAppStore.getState().editorCallbacks !== null;
  const editorCtx = useAppStore.getState().aiEditorContext;
  const tools = editorOpen ? [...TOOLS, ...EDITOR_TOOLS] : TOOLS;

  let systemPrompt = SYSTEM_PROMPT;
  if (editorOpen) {
    systemPrompt += `\n\nEDITOR MODE:
The user currently has a card editor open${editorCtx?.folderName ? ` for deck "${editorCtx.folderName}"` : ""}. You have additional tools to directly edit the card:
- set_editor_question / set_editor_answer: Write content into the question or answer fields (user sees changes in real time)
- set_editor_timer: Set the card timer
- clear_editor_field: Clear question, answer, or both fields
- get_editor_content: Read what's currently in the editor
Use these tools when the user asks you to help write, edit, or fill in their card content.`;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const raw = await commands.chatCompletion(messages, tools);
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
