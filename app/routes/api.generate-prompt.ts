import Anthropic from "@anthropic-ai/sdk";
import type { Route } from "./+types/api.generate-prompt";
import { getSession, isActiveUser } from "~/lib/auth";
import { checkRateLimit, rateLimitResponse, INPUT_LIMITS } from "~/lib/security";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // SECURITY FIX: Require authentication to prevent unauthorized API abuse
    const session = await getSession(request);
    if (!session.userId || !await isActiveUser(session.userId)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limiting to prevent AI API cost abuse
    const rateLimit = await checkRateLimit(session.userId, "ai");
    if (!rateLimit.allowed) {
      return rateLimitResponse(rateLimit.retryAfter!);
    }

    const { title, notes } = await request.json();

    // Input length validation
    if (title && title.length > INPUT_LIMITS.cardTitle) {
      return new Response(
        JSON.stringify({ error: "Title too long" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    if (notes && notes.length > INPUT_LIMITS.cardNotes) {
      return new Response(
        JSON.stringify({ error: "Notes too long" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!title) {
      return new Response(
        JSON.stringify({ error: "Title is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Claude API key not configured. Please set the ANTHROPIC_API_KEY secret."
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic({ apiKey });

    const systemPrompt = `You are an AI assistant that helps developers create detailed prompts for Claude Code, an AI coding assistant.
Your job is to take a feature title and optional notes from a kanban card and transform it into a clear, detailed prompt that can be given to Claude Code to implement that feature.

The prompt should:
- Be specific and actionable
- Include technical details when relevant
- Mention the tech stack (React Router 7, TypeScript, Tailwind CSS, shadcn/ui)
- Break down complex features into clear steps
- Include any relevant context from the notes
- Be written in a clear, professional tone

Keep the prompt concise but comprehensive, typically 2-5 sentences.`;

    const userPrompt = `Feature Title: ${title}${notes ? `\n\nAdditional Context: ${notes}` : ""}

Generate a prompt I can give to Claude Code to implement this feature.`;

    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      // Room for adaptive thinking (always on for this model) plus the 2-5 sentence answer
      max_tokens: 4000,
      output_config: { effort: "low" },
      // If Claude's safety classifiers decline a benign request, retry it server-side
      // on Anthropic's recommended fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    if (response.stop_reason === "refusal") {
      return new Response(
        JSON.stringify({ error: "Claude declined to generate a prompt for this card" }),
        { status: 422, headers: { "Content-Type": "application/json" } }
      );
    }

    const generatedPrompt = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();

    if (!generatedPrompt) {
      return new Response(
        JSON.stringify({ error: "Failed to generate prompt" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ prompt: generatedPrompt }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating prompt:", error);
    if (error instanceof Anthropic.RateLimitError) {
      return new Response(
        JSON.stringify({ error: "The AI service is busy. Please try again in a moment." }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
    if (error instanceof Anthropic.APIError) {
      // Don't leak upstream details (e.g. an invalid key) to the browser
      return new Response(
        JSON.stringify({ error: "The AI service returned an error" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
