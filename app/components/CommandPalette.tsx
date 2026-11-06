import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUpRight, Calendar, CornerDownLeft, EyeOff, LayoutGrid, Loader2, Search, StickyNote } from "lucide-react";
import { apiFetch } from "~/lib/api";
import { highlightParts, rankItems } from "~/lib/command-search";
import { daysUntil } from "~/lib/board-pulse";
import { COMBINED_BOARD_ID } from "~/lib/linked-cards";
import type { BoardListItem, KanbanBoard, KanbanCard } from "~/lib/types";
import { UserAvatar } from "./UserAvatar";

export interface PaletteAction {
  id: string;
  title: string;
  icon: ReactNode;
  /** Extra words that should find it ("dark", "theme") */
  keywords?: string[];
  /** Shown on the right, e.g. "⌘K" */
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boards: BoardListItem[];
  currentBoardId: string;
  actions: PaletteAction[];
  onOpenCard: (boardId: string, cardId: string) => void;
  onSelectBoard: (boardId: string) => void;
}

type CardHit = KanbanCard & { boardId: string; boardName: string; columnTitle: string | null };

type Row =
  | { kind: "action"; key: string; action: PaletteAction }
  | { kind: "board"; key: string; board: { id: string; name: string; current: boolean } }
  | { kind: "card"; key: string; card: CardHit };

const MAX_CARDS = 30;

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.match ? (
          <mark key={i} className="rounded-sm bg-primary/25 px-px text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function DuePill({ dueDate }: { dueDate: string }) {
  const days = daysUntil(dueDate);
  const label =
    days === 0
      ? "Today"
      : days === 1
        ? "Tomorrow"
        : new Date(`${dueDate.split("T")[0]}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const tone = days < 0 ? "bg-destructive/15 text-destructive" : days <= 7 ? "bg-amber-500/15 text-amber-600" : "bg-muted";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px ${tone}`}>
      <Calendar className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * ⌘K: one box to find any card on any board you can open, jump between boards, and
 * run actions. Cards come from the Everyone view, so the server's visibility rules
 * (private cards included) apply exactly as they do on the board.
 */
export function CommandPalette({ open, onOpenChange, boards, currentBoardId, actions, onOpenCard, onSelectBoard }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [cards, setCards] = useState<CardHit[] | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Fresh cards every time it opens (cheap, and never stale after edits)
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    let cancelled = false;
    apiFetch(`/api/board?boardId=${COMBINED_BOARD_ID}`)
      .then((r) => (r.ok ? (r.json() as Promise<KanbanBoard>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        const columnOf = new Map<string, string>();
        for (const col of data.columns) for (const id of col.cardIds) columnOf.set(id, col.title);
        setCards(
          Object.values(data.cards).map((c) => ({
            ...c,
            boardId: c.linkedFrom?.boardId ?? c.boardId ?? "",
            boardName: c.linkedFrom?.boardName ?? "",
            columnTitle: c.linkedFrom?.columnTitle ?? columnOf.get(c.id) ?? null,
          })),
        );
      })
      .catch(() => !cancelled && setCards([]));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const boardItems = [
      ...boards.map((b) => ({
        id: b.id,
        name: b.displayName ?? (b.role === "owner" ? b.name : `${b.ownerName ?? "Shared"}'s board`),
        current: b.id === currentBoardId,
      })),
      { id: COMBINED_BOARD_ID, name: "Everyone (all boards)", current: currentBoardId === COMBINED_BOARD_ID },
    ];
    const q = query.trim();

    const actionRows = rankItems(
      actions.map((a) => ({ ...a, extra: a.keywords })),
      q,
      q ? 5 : 6,
    ).map(({ item }): Row => ({ kind: "action", key: `a:${item.id}`, action: item }));

    const boardRows = (boards.length > 1 ? rankItems(boardItems.map((b) => ({ ...b, title: b.name })), q, q ? 4 : 0) : []).map(
      ({ item }): Row => ({ kind: "board", key: `b:${item.id}`, board: item }),
    );

    let cardList: CardHit[];
    if (!cards) cardList = [];
    else if (!q) {
      // Nothing typed: what's coming up next, soonest due first
      cardList = cards
        .filter((c) => c.dueDate && !/^(completed?|done|finished|closed)$/i.test(c.columnTitle ?? ""))
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
        .slice(0, 6);
    } else {
      cardList = rankItems(
        cards.map((c) => ({
          ...c,
          extra: [c.notes, c.boardName, c.columnTitle, c.assignee?.name, ...(c.tags ?? []).map((t) => t.name), c.isPrivate ? "private" : null],
        })),
        q,
        MAX_CARDS,
      ).map((r) => r.item);
    }
    const cardRows = cardList.map((c): Row => ({ kind: "card", key: `c:${c.id}`, card: c }));

    // Typing usually means looking for a card, so cards come first then
    return q ? [...cardRows, ...boardRows, ...actionRows] : [...actionRows, ...cardRows];
  }, [query, cards, actions, boards, currentBoardId]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-row-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (row: Row | undefined) => {
    if (!row) return;
    onOpenChange(false);
    // Let the palette close (and give focus back) before the next thing opens
    setTimeout(() => {
      if (row.kind === "action") row.action.run();
      else if (row.kind === "board") onSelectBoard(row.board.id);
      else onOpenCard(row.card.boardId, row.card.id);
    }, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    }
  };

  const q = query.trim();
  const sectionOf = (row: Row) =>
    row.kind === "action" ? "Actions" : row.kind === "board" ? "Boards" : q ? "Cards" : "Coming up";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[10vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border-2 border-border bg-card shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          data-testid="command-palette"
        >
          <DialogPrimitive.Title className="sr-only">Search cards, boards and actions</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b-2 border-border px-4">
            <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards, boards, and actions…"
              className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-list"
              aria-activedescendant={rows[active] ? `cp-row-${active}` : undefined}
              data-testid="command-palette-input"
            />
            {!cards && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-label="Loading cards" />}
            <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </div>

          <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
            {rows.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                {cards ? (
                  <>
                    Nothing matches <span className="font-medium text-foreground">“{q}”</span>
                  </>
                ) : (
                  "Loading…"
                )}
              </div>
            )}
            {rows.map((row, i) => {
              const heading = i === 0 || sectionOf(rows[i - 1]) !== sectionOf(row) ? sectionOf(row) : null;
              const isActive = i === active;
              return (
                <div key={row.key}>
                  {heading && (
                    <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-1">
                      {heading}
                    </div>
                  )}
                  <div
                    id={`cp-row-${i}`}
                    role="option"
                    aria-selected={isActive}
                    data-row-index={i}
                    data-testid={`palette-${row.kind}`}
                    onMouseMove={() => !isActive && setActive(i)}
                    onClick={() => choose(row)}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${isActive ? "ring-1 ring-primary/30" : ""}`}
                    style={isActive ? { backgroundColor: "hsl(var(--primary) / 0.12)" } : undefined}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                      aria-hidden="true"
                    >
                      {row.kind === "action" ? row.action.icon : row.kind === "board" ? <LayoutGrid className="h-4 w-4" /> : row.card.isPrivate ? <EyeOff className="h-4 w-4" /> : <StickyNote className="h-4 w-4" />}
                    </span>

                    <div className="min-w-0 flex-1">
                      {row.kind === "card" ? (
                        <>
                          <div className="truncate text-sm font-medium text-foreground">
                            <Highlighted text={row.card.title} query={q} />
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {row.card.boardName && <span className="truncate">{row.card.boardName}</span>}
                            {row.card.columnTitle && <span>· {row.card.columnTitle}</span>}
                            {row.card.dueDate && <DuePill dueDate={row.card.dueDate} />}
                            {(row.card.tags ?? []).slice(0, 3).map((t) => (
                              <span key={t.id} className="rounded-full px-1.5 py-px text-[10px] font-medium text-white" style={{ backgroundColor: t.color }}>
                                {t.name}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : row.kind === "board" ? (
                        <div className="truncate text-sm font-medium text-foreground">
                          <Highlighted text={row.board.name} query={q} />
                          {row.board.current && <span className="ml-2 text-xs font-normal text-muted-foreground">current</span>}
                        </div>
                      ) : (
                        <div className="truncate text-sm font-medium text-foreground">
                          <Highlighted text={row.action.title} query={q} />
                        </div>
                      )}
                    </div>

                    {row.kind === "card" && row.card.assignee && <UserAvatar user={row.card.assignee} size="xs" />}
                    {row.kind === "action" && row.action.hint && (
                      <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">{row.action.hint}</kbd>
                    )}
                    {isActive &&
                      (row.kind === "card" ? (
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ) : (
                        <CornerDownLeft className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden items-center gap-4 border-t-2 border-border px-4 py-2 text-[11px] text-muted-foreground sm:flex">
            <span>
              <kbd className="rounded border border-border px-1">↑</kbd> <kbd className="rounded border border-border px-1">↓</kbd> to move
            </span>
            <span>
              <kbd className="rounded border border-border px-1">↵</kbd> to open
            </span>
            <span className="ml-auto">
              Search titles, notes, tags, boards, columns and people
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
