import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { apiFetch } from "~/lib/api";
import type { KanbanCard } from "~/lib/types";

interface AiQuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId?: string;
  /** Called after a card is created (refresh the board) */
  onCreated: (card: KanbanCard) => void | Promise<void>;
  onOpenCard: (cardId: string) => void;
}

type Turn = { request: string } | { questions: string[]; answer?: string };

interface Created {
  card: KanbanCard;
  column: { id: string; title: string };
  skipped: string[];
}

const MAX_FOLLOW_UPS = 3;

/** The person's local date, so "tomorrow" means their tomorrow */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDue(day: string) {
  return new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function AiQuickAddDialog({ open, onOpenChange, boardId, onCreated, onOpenCard }: AiQuickAddDialogProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [created, setCreated] = useState<Created | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const reset = () => {
    setTurns([]);
    setInput("");
    setError(undefined);
    setCreated(null);
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  const pendingQuestions = (() => {
    const last = turns[turns.length - 1];
    return last && "questions" in last && last.answer === undefined ? last.questions : null;
  })();
  const followUpCount = turns.filter((t) => "questions" in t && t.answer !== undefined).length;

  const submit = async () => {
    const text = input.trim();
    if (!text || busy) return;

    // Fill in the answer to the open questions, or start with the request
    const nextTurns: Turn[] = pendingQuestions
      ? [...turns.slice(0, -1), { questions: pendingQuestions, answer: text }]
      : [{ request: text }];
    const first = nextTurns[0];
    if (!first || !("request" in first)) return;
    const followUps = nextTurns
      .filter((t): t is { questions: string[]; answer: string } => "questions" in t && t.answer !== undefined)
      .map(({ questions, answer }) => ({ questions, answer }));

    setTurns(nextTurns);
    setInput("");
    setBusy(true);
    setError(undefined);
    try {
      const res = await apiFetch("/api/ai/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, request: first.request, followUps, today: localToday() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        // Let them edit what they sent instead of retyping it
        setTurns(turns);
        setInput(text);
        return;
      }
      if (data.status === "needs_info") {
        setTurns([...nextTurns, { questions: data.questions }]);
      } else if (data.status === "created") {
        setCreated({ card: data.card, column: data.column, skipped: data.skipped ?? [] });
        await onCreated(data.card);
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setTurns(turns);
      setInput(text);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  const outOfFollowUps = pendingQuestions !== null && followUpCount >= MAX_FOLLOW_UPS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" data-testid="ai-quick-add-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
            Quick add with AI
          </DialogTitle>
          <DialogDescription>
            Describe the task in your own words. Include a due date, who it's for, priority or tags if you like.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-3 py-2" data-testid="ai-quick-add-created">
            <p className="text-sm text-foreground">
              Added to <span className="font-medium">{created.column.title}</span>:
            </p>
            <div className="rounded-lg border border-border bg-muted p-3 space-y-1">
              <p className="font-medium text-foreground">{created.card.title}</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {created.card.dueDate && <li>Due {formatDue(created.card.dueDate)}</li>}
                {created.card.assignee && <li>Assigned to {created.card.assignee.name}</li>}
                <li>{created.card.priority[0].toUpperCase() + created.card.priority.slice(1)} priority</li>
                {created.card.tags && created.card.tags.length > 0 && (
                  <li>Tags: {created.card.tags.map((t) => t.name).join(", ")}</li>
                )}
              </ul>
            </div>
            {created.skipped.length > 0 && (
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                {created.skipped.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {turns.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto" aria-live="polite">
                {turns.map((t, i) =>
                  "request" in t ? (
                    <p key={i} className="ml-8 rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">
                      {t.request}
                    </p>
                  ) : (
                    <div key={i} className="space-y-2">
                      <div className="mr-8 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground" data-testid="ai-quick-add-questions">
                        <p className="mb-1 text-xs font-medium text-muted-foreground">Before I add it:</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {t.questions.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ul>
                      </div>
                      {t.answer !== undefined && (
                        <p className="ml-8 rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground whitespace-pre-wrap">{t.answer}</p>
                      )}
                    </div>
                  )
                )}
                {busy && <p className="text-sm text-muted-foreground animate-pulse">Thinking…</p>}
              </div>
            )}

            {outOfFollowUps ? (
              <p className="text-sm text-muted-foreground">
                That's a lot of back and forth. Start over with everything in one message, or use Add card.
              </p>
            ) : (
              <Textarea
                ref={inputRef}
                autoFocus
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                maxLength={pendingQuestions ? 1000 : 2000}
                rows={3}
                disabled={busy}
                aria-label={pendingQuestions ? "Your answer" : "Describe the card"}
                placeholder={
                  pendingQuestions
                    ? "Answer here, or say \"skip\" to leave it out"
                    : "e.g. Renew the domain by Friday, assign it to me, high priority"
                }
              />
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {created ? (
            <>
              <Button variant="outline" onClick={reset}>
                Add another
              </Button>
              <Button variant="outline" onClick={() => onOpenCard(created.card.id)}>
                Open card
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <>
              {turns.length > 0 && (
                <Button variant="outline" onClick={reset} disabled={busy}>
                  Start over
                </Button>
              )}
              {!outOfFollowUps && (
                <Button onClick={submit} disabled={busy || !input.trim()}>
                  {busy ? "Working…" : pendingQuestions ? "Send answer" : "Create card"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
