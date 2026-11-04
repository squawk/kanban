import { api, requireBoardAccess, requireUser } from "~/lib/access.server";
import { json, jsonError } from "~/lib/http";
import { isPrivateMode, isRealtimeConfigured, signRealtimeToken } from "~/lib/realtime.server";
import { checkRateLimit, getClientIP, rateLimitResponse } from "~/lib/security";

// GET /api/realtime-token?boardId= - short-lived JWT for one board's private Realtime channel
export const loader = api("issue realtime token", async ({ request }: { request: Request }) => {
  const rateLimit = await checkRateLimit(getClientIP(request), "api");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfter!);

  if (!isRealtimeConfigured() || !isPrivateMode()) return jsonError("Realtime private channels are not enabled", 404);

  const user = await requireUser(request);
  const boardId = new URL(request.url).searchParams.get("boardId");
  if (!boardId) return jsonError("boardId is required", 400);
  await requireBoardAccess(user, boardId); // 404 if the user can't see this board

  const { token, expiresAt } = await signRealtimeToken(user.id, boardId);
  return json({ token, expiresAt }, 200, { "Cache-Control": "no-store" });
});
