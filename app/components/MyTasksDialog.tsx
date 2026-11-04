import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import type { AssignedCard } from "~/lib/types";
import { apiFetch } from "~/lib/api";
import { Calendar, ListChecks } from "lucide-react";

interface MyTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenCard: (boardId: string, cardId: string) => void;
}

function dueLabel(iso: string) {
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    text: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    overdue: date < today,
    today: date.getTime() === today.getTime(),
  };
}

export function MyTasksDialog({ open, onOpenChange, onOpenCard }: MyTasksDialogProps) {
  const [tasks, setTasks] = useState<AssignedCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch("/api/my-tasks")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5" />
            My Tasks
          </DialogTitle>
          <DialogDescription>Open cards assigned to you across all your boards, soonest due first.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing is assigned to you right now.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const due = t.dueDate ? dueLabel(t.dueDate) : null;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenCard(t.boardId, t.id);
                    }}
                    className="w-full rounded-lg border-2 border-border bg-card p-3 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-foreground">{t.title}</span>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">
                        {t.priority}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{t.boardName}</span>
                      {t.columnTitle && <span>· {t.columnTitle}</span>}
                      {due && (
                        <span
                          className={`flex items-center gap-1 ${due.overdue ? "font-semibold text-destructive" : due.today ? "font-semibold text-primary" : ""}`}
                        >
                          <Calendar className="h-3 w-3" />
                          {due.overdue ? `Overdue · ${due.text}` : due.today ? "Due today" : due.text}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
