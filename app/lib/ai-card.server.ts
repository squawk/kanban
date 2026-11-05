/**
 * AI quick add: turn a sentence like "remind me to renew the domain by Friday, high
 * priority" into a card draft, or into a few follow-up questions when something
 * the person said can't be pinned down.
 *
 * Claude only proposes. Every id it returns is checked against the real board here,
 * and the card itself is created by the same code path as the normal form.
 */
import Anthropic from "@anthropic-ai/sdk";
import { INPUT_LIMITS } from "./security";
import { PRIORITIES } from "./card-create.server";

export const AI_LIMITS = {
  requestChars: 2000,
  answerChars: 1000,
  followUps: 3,
  questions: 3,
} as const;

export interface CardContext {
  today: string; // YYYY-MM-DD in the person's time zone
  currentUser: { id: string; name: string; email: string };
  columns: { id: string; title: string }[]; // board order; the first is the default
  members: { id: string; name: string; email: string }[];
  tags: { id: string; name: string }[];
}

export interface FollowUp {
  questions: string[];
  answer: string;
}

export interface CardDraft {
  title: string;
  notes: string;
  columnId: string;
  dueDate: string | null;
  priority: (typeof PRIORITIES)[number];
  assigneeId: string | null;
  tagIds: string[];
}

export type Interpretation =
  | { status: "ready"; card: CardDraft; skipped: string[] }
  | { status: "needs_info"; questions: string[] }
  | { status: "refused" };

/** What the model returns (before validation) */
export interface RawModelOutput {
  status: "ready" | "needs_info";
  questions: string[];
  skipped: string[];
  card: {
    title: string;
    notes: string;
    columnId: string | null;
    dueDate: string | null;
    priority: string;
    assigneeId: string | null;
    tagIds: string[];
  };
}

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "questions", "skipped", "card"],
  properties: {
    status: { type: "string", enum: ["ready", "needs_info"] },
    questions: { type: "array", items: { type: "string" } },
    skipped: { type: "array", items: { type: "string" } },
    card: {
      type: "object",
      additionalProperties: false,
      required: ["title", "notes", "columnId", "dueDate", "priority", "assigneeId", "tagIds"],
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
        columnId: nullableString,
        dueDate: { anyOf: [{ type: "string", format: "date" }, { type: "null" }] },
        priority: { type: "string", enum: [...PRIORITIES] },
        assigneeId: nullableString,
        tagIds: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

export const SYSTEM_PROMPT = `You turn a short request from someone using a kanban board into one new card on that board. You get the request, the board's columns, members and tags, and today's date, and you return JSON that matches the schema.

How to fill the card:
- title: a short, specific task name in the person's own terms (aim for under 80 characters). Use sentence case.
- notes: details the person gave that don't fit elsewhere, such as steps, links or context. If they listed several steps, write them as a "- " checklist. Don't invent details; use an empty string if there are none.
- columnId: the column they name, matched loosely ("doing" can match "In Progress"). Otherwise the first column.
- dueDate: resolve relative dates ("tomorrow", "Friday", "end of the month", "in two weeks") against today's date and write YYYY-MM-DD. A bare weekday means the next one after today. null when they gave no date.
- priority: "high" for urgent, ASAP, critical or important; "low" for someday, nice-to-have or whenever; otherwise "medium".
- assigneeId: "me", "I" or "myself" means the current user. Otherwise match a board member by name, first name or email. Use only ids from the list; null when they didn't ask to assign it.
- tagIds: ids of existing tags whose names match what they asked for. Never invent tags.

When to ask instead:
- Set status "needs_info" only when you can't tell what the task is, a person they named matches no board member or several, or a date they gave can't be pinned down. Ask up to 3 short, specific questions, such as "There are two Alexes on this board, Alex Kim and Alex Ruiz. Which one?" Still fill card with your best draft.
- Don't ask about anything they didn't mention: a missing due date, assignee, priority or tag is fine.
- If they named a column or tag that doesn't exist, don't ask. Leave it off and say so in skipped, for example "No tag named design, so I left it off."
- Earlier questions and their answers may follow the request. Use the answers. If they say to skip something or don't know, leave it empty and set status "ready".

Otherwise set status "ready" and questions to []. Use skipped only for things they asked for that you couldn't apply; otherwise [].`;

export function buildUserMessage(ctx: CardContext, request: string, followUps: FollowUp[]): string {
  const weekday = new Date(`${ctx.today}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const board = {
    today: `${ctx.today} (${weekday})`,
    currentUser: ctx.currentUser,
    columns: ctx.columns,
    members: ctx.members,
    tags: ctx.tags,
  };
  const parts = [
    `<board>\n${JSON.stringify(board, null, 2)}\n</board>`,
    `<request>\n${request}\n</request>`,
  ];
  followUps.forEach((f, i) => {
    parts.push(
      `<follow_up n="${i + 1}">\n<your_questions>\n${f.questions.map((q) => `- ${q}`).join("\n")}\n</your_questions>\n<their_answer>\n${f.answer}\n</their_answer>\n</follow_up>`,
    );
  });
  return parts.join("\n\n");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

/** Check the model's draft against the real board; never trust its ids. */
export function normalizeOutput(raw: RawModelOutput, ctx: CardContext): Interpretation {
  const questions = (raw.questions ?? [])
    .filter((q) => typeof q === "string" && q.trim())
    .slice(0, AI_LIMITS.questions)
    .map((q) => clip(q.trim(), 300));
  const skipped = (raw.skipped ?? [])
    .filter((s) => typeof s === "string" && s.trim())
    .slice(0, 5)
    .map((s) => clip(s.trim(), 300));

  const c = raw.card ?? ({} as RawModelOutput["card"]);
  const title = clip((c.title ?? "").trim(), INPUT_LIMITS.cardTitle);

  if (raw.status === "needs_info" && questions.length > 0) return { status: "needs_info", questions };
  if (!title) {
    return { status: "needs_info", questions: questions.length ? questions : ["What should the card say? Describe the task in a few words."] };
  }

  const columnIds = new Set(ctx.columns.map((col) => col.id));
  const memberIds = new Set(ctx.members.map((m) => m.id));
  const tagIds = new Set(ctx.tags.map((t) => t.id));

  const assigneeId = c.assigneeId && memberIds.has(c.assigneeId) ? c.assigneeId : null;
  if (c.assigneeId && !assigneeId) skipped.push("Couldn't match the assignee to a board member, so it's unassigned.");

  return {
    status: "ready",
    skipped,
    card: {
      title,
      notes: clip((c.notes ?? "").trim(), INPUT_LIMITS.cardNotes),
      columnId: c.columnId && columnIds.has(c.columnId) ? c.columnId : ctx.columns[0].id,
      dueDate: isValidDay(c.dueDate) ? c.dueDate : null,
      priority: (PRIORITIES as readonly string[]).includes(c.priority) ? (c.priority as CardDraft["priority"]) : "medium",
      assigneeId,
      tagIds: [...new Set((c.tagIds ?? []).filter((id) => tagIds.has(id)))],
    },
  };
}

export type ModelCaller = (system: string, user: string) => Promise<RawModelOutput | "refused">;

export function claudeCaller(apiKey: string): ModelCaller {
  const client = new Anthropic({ apiKey });
  return async (system, user) => {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      // Room for adaptive thinking (always on for this model) plus a small JSON answer
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      // If a safety classifier declines a benign request, retry it server-side on
      // Anthropic's recommended fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    });
    if (response.stop_reason === "refusal") return "refused";
    if (response.stop_reason === "max_tokens") throw new Error("AI quick add response was cut off");
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return JSON.parse(text) as RawModelOutput;
  };
}

export async function interpretCardRequest(
  ctx: CardContext,
  request: string,
  followUps: FollowUp[],
  callModel: ModelCaller,
): Promise<Interpretation> {
  const raw = await callModel(SYSTEM_PROMPT, buildUserMessage(ctx, request, followUps));
  if (raw === "refused") return { status: "refused" };
  return normalizeOutput(raw, ctx);
}
