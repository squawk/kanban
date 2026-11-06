import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { apiFetch } from "~/lib/api";
import type { BoardMember } from "~/lib/types";
import { History, RotateCcw } from "lucide-react";

export interface CardRevision {
  id: string;
  version: number;
  title: string;
  notes: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
  tags: { id: string; name: string; color: string }[];
  client?: { id: string; name: string; color: string } | null;
  changedFields: string[];
  actor: { id: string; name: string } | null;
  restoredFromVersion: number | null;
  createdAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  notes: "Notes",
  priority: "Priority",
  dueDate: "Due date",
  assigneeId: "Assignee",
  tags: "Tags",
  client: "Client",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function display(field: string, r: CardRevision, members: BoardMember[]): string {
  switch (field) {
    case "dueDate":
      return r.dueDate ? new Date(r.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "None";
    case "assigneeId":
      return r.assigneeId ? members.find((m) => m.id === r.assigneeId)?.name ?? "A former member" : "Unassigned";
    case "tags":
      return r.tags.length ? r.tags.map((t) => t.name).join(", ") : "None";
    case "client":
      return r.client?.name ?? "None";
    case "notes":
      return r.notes || "(empty)";
    default:
      return String(r[field as keyof CardRevision] ?? "");
  }
}

export function CardHistory({
  cardId,
  members,
  readOnly,
  refreshKey,
  onRestore,
}: {
  cardId: string;
  members: BoardMember[];
  /** Disable restoring (e.g. someone else has the card locked) */
  readOnly: boolean;
  /** Change to reload (e.g. after a save or restore) */
  refreshKey?: unknown;
  onRestore: (version: number, latestVersion: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [revisions, setRevisions] = useState<CardRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch(`/api/cards/${encodeURIComponent(cardId)}/revisions`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setRevisions)
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false));
  }, [open, cardId, refreshKey]);

  const latest = revisions[0]?.version ?? 0;

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
        aria-expanded={open}
      >
        <History className="h-4 w-4" />
        {open ? "Hide history" : "Show history"}
      </button>
      {open &&
        (loading && revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No edits recorded yet.</p>
        ) : (
          <ol className="space-y-2 max-h-72 overflow-y-auto" aria-label="Card versions" data-testid="card-history">
            {revisions.map((r, i) => {
              const previous = revisions[i + 1];
              const isLatest = r.version === latest;
              const fields = r.changedFields.filter((f) => FIELD_LABELS[f]);
              return (
                <li key={r.id} className="rounded-lg border border-border bg-muted/40 p-2 text-xs" data-testid="card-version">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">v{r.version}</span>
                    {isLatest && <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">current</span>}
                    <span className="text-muted-foreground">
                      {r.actor?.name ?? "Before history"} · {when(r.createdAt)}
                    </span>
                    <span className="ml-auto flex gap-1">
                      {fields.length > 0 && previous && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => setExpanded(expanded === r.version ? null : r.version)}
                          aria-expanded={expanded === r.version}
                        >
                          {expanded === r.version ? "Hide changes" : "Changes"}
                        </Button>
                      )}
                      {!isLatest && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={readOnly || restoring !== null}
                          title={readOnly ? "Someone else is editing this card" : `Make version ${r.version} current again`}
                          onClick={async () => {
                            if (!window.confirm(`Restore version ${r.version}? Unsaved changes in this dialog will be replaced. You can undo this.`)) return;
                            setRestoring(r.version);
                            try {
                              await onRestore(r.version, latest);
                            } finally {
                              setRestoring(null);
                            }
                          }}
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          {restoring === r.version ? "Restoring..." : "Restore"}
                        </Button>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {r.restoredFromVersion
                      ? `Restored version ${r.restoredFromVersion}`
                      : fields.length
                        ? `Changed ${fields.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")}`
                        : r.version === 1 && r.actor
                          ? "Created"
                          : "Starting point"}
                  </p>
                  {expanded === r.version && previous && (
                    <dl className="mt-2 space-y-1.5" data-testid="version-diff">
                      {fields.map((f) => (
                        <div key={f}>
                          <dt className="font-medium text-foreground">{FIELD_LABELS[f]}</dt>
                          <dd className="grid gap-1 sm:grid-cols-2">
                            <span className="whitespace-pre-wrap break-words rounded bg-red-500/10 px-1.5 py-0.5 text-red-800 line-through decoration-red-800/40 dark:text-red-300 max-h-24 overflow-y-auto">
                              {display(f, previous, members)}
                            </span>
                            <span className="whitespace-pre-wrap break-words rounded bg-green-500/10 px-1.5 py-0.5 text-green-800 dark:text-green-300 max-h-24 overflow-y-auto">
                              {display(f, r, members)}
                            </span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ol>
        ))}
    </div>
  );
}
