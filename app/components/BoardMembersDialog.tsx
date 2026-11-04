import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { UserAvatar } from "./UserAvatar";
import type { BoardMember, UserSummary } from "~/lib/types";
import { apiFetch } from "~/lib/api";
import { UserPlus, X, LogOut } from "lucide-react";

interface BoardMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  boardName: string;
  isOwner: boolean;
  currentUserId: string;
  members: BoardMember[];
  onMembersChange: (members: BoardMember[]) => void;
  onLeft?: () => void;
}

export function BoardMembersDialog({
  open,
  onOpenChange,
  boardId,
  boardName,
  isOwner,
  currentUserId,
  members,
  onMembersChange,
  onLeft,
}: BoardMembersDialogProps) {
  const [directory, setDirectory] = useState<UserSummary[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !isOwner) return;
    setError("");
    setQuery("");
    apiFetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then(setDirectory)
      .catch(() => setDirectory([]));
  }, [open, isOwner]);

  const candidates = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    const q = query.trim().toLowerCase();
    return directory
      .filter((u) => !memberIds.has(u.id))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [directory, members, query]);

  const mutate = async (method: "POST" | "DELETE", userId: string) => {
    setBusy(userId);
    setError("");
    try {
      const res = await apiFetch(`/api/boards/${encodeURIComponent(boardId)}/members`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      if (method === "DELETE" && userId === currentUserId) {
        onOpenChange(false);
        onLeft?.();
        return;
      }
      onMembersChange(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share "{boardName}"</DialogTitle>
          <DialogDescription>
            Members can view and edit cards on this board and can be assigned work.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y divide-border" aria-label="Board members">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <UserAvatar user={m} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {m.name}
                  {m.id === currentUserId && <span className="text-muted-foreground"> (you)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <span className="text-xs text-muted-foreground capitalize">{m.boardRole}</span>
              {m.boardRole !== "owner" && (isOwner || m.id === currentUserId) && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy === m.id}
                  onClick={() => mutate("DELETE", m.id)}
                  aria-label={m.id === currentUserId ? "Leave board" : `Remove ${m.name}`}
                  title={m.id === currentUserId ? "Leave board" : `Remove ${m.name}`}
                >
                  {m.id === currentUserId ? <LogOut className="h-4 w-4" /> : <X className="h-4 w-4" />}
                </Button>
              )}
            </li>
          ))}
        </ul>

        {isOwner && (
          <div className="space-y-2 border-t border-border pt-4">
            <label htmlFor="member-search" className="text-sm font-medium text-foreground">
              Add people
            </label>
            <Input
              id="member-search"
              placeholder="Search by name or email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {directory.length <= members.length
                  ? "Everyone with an account already has access. An admin can invite more people."
                  : "No matching people."}
              </p>
            ) : (
              <ul className="space-y-1">
                {candidates.map((u) => (
                  <li key={u.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted">
                    <UserAvatar user={u} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{u.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy === u.id} onClick={() => mutate("POST", u.id)}>
                      <UserPlus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">{error}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
