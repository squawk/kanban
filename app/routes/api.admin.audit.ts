import { api, requireAdmin } from "~/lib/access.server";
import { queryAuditLogs } from "~/lib/audit.server";
import { json } from "~/lib/http";

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// GET /api/admin/audit?action=&actorId=&entityType=&q=&before=&limit=&format=csv
export const loader = api("load audit log", async ({ request }: { request: Request }) => {
  await requireAdmin(request);
  const p = new URL(request.url).searchParams;
  const format = p.get("format");

  const result = queryAuditLogs({
    action: p.get("action") || undefined,
    actorId: p.get("actorId") || undefined,
    entityType: p.get("entityType") || undefined,
    entityId: p.get("entityId") || undefined,
    boardId: p.get("boardId") || undefined,
    search: p.get("q") || undefined,
    before: parseDate(p.get("before")),
    since: parseDate(p.get("since")),
    limit: format === "csv" ? 200 : Number(p.get("limit")) || 50,
  });

  if (format === "csv") {
    // Quote every field and neutralize spreadsheet formula injection (=, +, -, @)
    const esc = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ["time", "actor", "action", "entity_type", "entity_id", "board_id", "summary", "ip"];
    const lines = result.entries.map((e) =>
      [e.createdAt, e.actorEmail, e.action, e.entityType, e.entityId, e.boardId, e.summary, e.ipAddress].map(esc).join(",")
    );
    return new Response([header.join(","), ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return json(result);
});
