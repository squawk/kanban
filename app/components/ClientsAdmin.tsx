import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, X } from "lucide-react";
import { apiFetch } from "~/lib/api";
import type { ClientSummary } from "~/lib/types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { CLIENT_COLORS } from "./ClientPicker";

/** Admin → Clients: rename, recolor, archive and restore. (Anyone can add clients from a card.) */
export function ClientsAdmin() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", color: "" });
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    apiFetch("/api/clients?all=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const patch = async (id: string, body: Partial<{ name: string; color: string; archived: boolean }>) => {
    setError(undefined);
    const res = await apiFetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Couldn't update the client");
      return false;
    }
    const updated = (await res.json()) as ClientSummary;
    setClients((list) => list.map((c) => (c.id === id ? updated : c)));
    return true;
  };

  const active = clients.filter((c) => !c.archived);
  const archived = clients.filter((c) => c.archived);

  const row = (c: ClientSummary) => (
    <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-testid="admin-client">
      {editing === c.id ? (
        <>
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: draft.color }} aria-hidden="true" />
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            aria-label="Client name"
            maxLength={80}
            className="h-8 max-w-xs"
            autoFocus
          />
          <div className="flex gap-1" role="radiogroup" aria-label="Client color">
            {CLIENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={draft.color === color}
                aria-label={`Color ${color}`}
                onClick={() => setDraft((d) => ({ ...d, color }))}
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: color }}
              >
                {draft.color === color && <Check className="h-3 w-3 text-white" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <Button size="sm" onClick={async () => (await patch(c.id, draft)) && setEditing(null)} disabled={!draft.name.trim()}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} aria-label="Cancel">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden="true" />
          <span className={`font-medium ${c.archived ? "text-muted-foreground" : "text-foreground"}`}>{c.name}</span>
          <div className="ml-auto flex gap-1">
            {!c.archived && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(c.id);
                  setDraft({ name: c.name, color: c.color });
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Edit
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => patch(c.id, { archived: !c.archived })}>
              {c.archived ? (
                <>
                  <ArchiveRestore className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Archive
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </li>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Anyone can add a client from a card's editor. Here you can rename or recolor them, and archive ones you no
        longer work with: archived clients stay on their cards but aren't offered for new ones.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No clients yet. Add one from any card's editor.
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Active ({active.length})</h2>
            <ul className="divide-y-2 divide-border rounded-lg border-2 border-border bg-card">{active.map(row)}</ul>
          </section>
          {archived.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Archived ({archived.length})</h2>
              <ul className="divide-y-2 divide-border rounded-lg border-2 border-border bg-card">{archived.map(row)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
