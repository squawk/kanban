import crypto from "crypto";
import { getReminderConfig } from "~/lib/config";
import { runDueReminders } from "~/lib/due-reminders.server";
import { json, jsonError } from "~/lib/http";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// POST /api/cron/due-reminders  (Authorization: Bearer $CRON_SECRET)
// For external schedulers; also wakes hosts that stop idle machines.
export async function action({ request }: { request: Request }) {
  if (request.method !== "POST") return jsonError("Method not allowed", 405);

  const { cronSecret } = getReminderConfig();
  if (!cronSecret) return jsonError("Not found", 404); // endpoint disabled unless CRON_SECRET is set

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, cronSecret)) return jsonError("Unauthorized", 401);

  try {
    return json(await runDueReminders());
  } catch (error) {
    console.error("Cron due reminders error:", error instanceof Error ? error.message : error);
    return jsonError("Failed to run reminders", 500);
  }
}
