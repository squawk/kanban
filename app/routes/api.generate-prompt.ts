import OpenAI from "openai";
import type { Route } from "./+types/api.generate-prompt";
import { getSession } from "~/lib/auth";
import { checkRateLimit, rateLimitResponse, INPUT_LIMITS } from "~/lib/security";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    // SECURITY FIX: Require authentication to prevent unauthorized API abuse
    const session = await getSession(request);
    if (!session.userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Rate limiting to prevent OpenAI API cost abuse
    const rateLimit = checkRateLimit(session.userId, "openai");
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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openai = new OpenAI({ apiKey });

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const generatedPrompt = completion.choices[0]?.message?.content;

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
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
