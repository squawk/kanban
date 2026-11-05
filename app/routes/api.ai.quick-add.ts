import Anthropic from "@anthropic-ai/sdk";
import { asc, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { columns, tags } from "~/lib/db/schema";
import { api, getBoardParticipants, requireUser, resolveBoard } from "~/lib/access.server";
import { json, jsonError, readJson } from "~/lib/http";
import { checkRateLimit, rateLimitResponse } from "~/lib/security";
import { createCard } from "~/lib/card-create.server";
import {
  AI_LIMITS,
  claudeCaller,
  interpretCardRequest,
  isValidDay,
  type FollowUp,
} from "~/lib/ai-card.server";

/**
 * POST /api/ai/quick-add
 * Body: { boardId?, request, followUps?: [{ questions, answer }], today? (YYYY-MM-DD) }
 * Returns { status: "created", card, column, skipped } or { status: "needs_info", questions }.
 */
export const action = api("create card with AI", async ({ request }: { request: Request }) => {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const user = await requireUser(request);
  const rateLimit = await checkRateLimit(user.id, "ai");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfter!);

  const body = await readJson<{ boardId?: string | null; request?: unknown; followUps?: unknown; today?: unknown }>(request);
  const text = typeof body.request === "string" ? body.request.trim() : "";
  if (!text) return jsonError("Describe the card you want to create", 400);
  if (text.length > AI_LIMITS.requestChars) return jsonError(`Keep it under ${AI_LIMITS.requestChars} characters`, 400);

  const followUps: FollowUp[] = [];
  if (Array.isArray(body.followUps)) {
    if (body.followUps.length > AI_LIMITS.followUps) {
      return jsonError("Too many follow-ups. Start over with everything in one message.", 400);
    }
    for (const f of body.followUps as { questions?: unknown; answer?: unknown }[]) {
      const answer = typeof f?.answer === "string" ? f.answer.trim() : "";
      const questions = Array.isArray(f?.questions)
        ? f.questions.filter((q): q is string => typeof q === "string").slice(0, AI_LIMITS.questions).map((q) => q.slice(0, 300))
        : [];
      if (!answer || answer.length > AI_LIMITS.answerChars) return jsonError("Each answer must be 1 to 1000 characters", 400);
      followUps.push({ questions, answer });
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonError("AI isn't set up on this server (ANTHROPIC_API_KEY is missing)", 503);

  const { board } = await resolveBoard(user, body.boardId);
  const boardColumns = await db
    .select({ id: columns.id, title: columns.title })
    .from(columns)
    .where(eq(columns.boardId, board.id))
    .orderBy(asc(columns.position));
  if (boardColumns.length === 0) return jsonError("This board has no columns yet", 400);
  const members = (await getBoardParticipants(board.id)).map(({ id, name, email }) => ({ id, name, email }));
  const allTags = await db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(asc(tags.name));

  // The browser sends its local date so "tomorrow" means the person's tomorrow
  const today = isValidDay(body.today) ? body.today : new Date().toISOString().slice(0, 10);

  let result;
  try {
    result = await interpretCardRequest(
      { today, currentUser: { id: user.id, name: user.name, email: user.email }, columns: boardColumns, members, tags: allTags },
      text,
      followUps,
      claudeCaller(apiKey),
    );
  } catch (error) {
    console.error("AI quick add error:", error instanceof Error ? error.message : error);
    if (error instanceof Anthropic.RateLimitError) return jsonError("The AI service is busy. Try again in a moment.", 429);
    return jsonError("The AI service couldn't read that request. Try again, or use Add card.", 502);
  }

  if (result.status === "refused") return jsonError("Claude declined this request. Try rewording it.", 422);
  if (result.status === "needs_info") return json({ status: "needs_info", questions: result.questions });

  const { card, column } = await createCard(user, result.card, request, { via: "AI quick add" });
  return json({ status: "created", card, column: { id: column.id, title: column.title }, skipped: result.skipped }, 201);
});
