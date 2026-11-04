import { api, requireCardAccess, requireUser } from "~/lib/access.server";
import { queryAuditLogs } from "~/lib/audit.server";
import { json } from "~/lib/http";

// GET /api/cards/:cardId/activity - Audit history for a single card (board members only)
export const loader = api(
  "fetch card activity",
  async ({ request, params }: { request: Request; params: { cardId: string } }) => {
    const user = await requireUser(request);
    const { card } = await requireCardAccess(user, params.cardId);
    const { entries } = await queryAuditLogs({ entityType: "card", entityId: card.id, limit: 100 });
    // Don't expose IP addresses to non-admins
    return json(entries.map(({ ipAddress: _ip, ...rest }) => rest));
  }
);
