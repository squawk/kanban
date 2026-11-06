import { useEffect, useRef, useState } from "react";
import { Briefcase, Check, Plus, X } from "lucide-react";
import { apiFetch } from "~/lib/api";
import type { ClientSummary } from "~/lib/types";
import { Button } from "./ui/button";

export const CLIENT_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#475569"];

interface ClientPickerProps {
  /** Selected client id, or "" for none */
  value: string;
  onChange: (clientId: string) => void;
  /** The card's current client: kept in the list even if it's been archived */
  current?: ClientSummary | null;
  disabled?: boolean;
}

/**
 * Optional "who is this for" picker. Anyone can add a client on the spot with a name
 * and a color; typing a name that already exists (in any case) picks that client.
 */
export function ClientPicker({ value, onChange, current, disabled }: ClientPickerProps) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(CLIENT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch("/api/clients")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClients(Array.isArray(data) ? data : []))
      .catch(() => setClients([]));
  }, []);

  useEffect(() => {
    if (adding) nameRef.current?.focus();
  }, [adding]);

  // Keep the card's archived client selectable so saving doesn't silently drop it
  const options = current && !clients.some((c) => c.id === current.id) ? [...clients, current] : clients;
  const selected = options.find((c) => c.id === value);

  const add = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const res = await apiFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't add that client");
        return;
      }
      const client = body as ClientSummary;
      setClients((list) =>
        (list.some((c) => c.id === client.id) ? list : [...list, client]).sort((a, b) => a.name.localeCompare(b.name)),
      );
      onChange(client.id);
      setAdding(false);
      setName("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="client-picker">
      <label htmlFor="client" className="text-sm font-medium text-foreground flex items-center gap-1">
        <Briefcase className="h-3 w-3" />
        Client
      </label>
      {!adding ? (
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            {selected && (
              <span
                className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: selected.color }}
                aria-hidden="true"
              />
            )}
            <select
              id="client"
              value={value}
              disabled={disabled}
              onChange={(e) => onChange(e.target.value)}
              className={`w-full py-2 pr-3 border-2 border-border rounded-md bg-card text-foreground text-sm ${selected ? "pl-8" : "pl-3"}`}
            >
              <option value="">No client</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={disabled} onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            New
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border-2 border-border p-3">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
              placeholder="Client name"
              aria-label="New client name"
              maxLength={80}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Client color">
            {CLIENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className="flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform hover:scale-110"
                style={{ backgroundColor: c, boxShadow: color === c ? `0 0 0 2px hsl(var(--card)), 0 0 0 4px ${c}` : undefined }}
              >
                {color === c && <Check className="h-3.5 w-3.5 text-white" aria-hidden="true" />}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!name.trim() || saving} onClick={add}>
              {saving ? "Adding…" : "Add client"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
