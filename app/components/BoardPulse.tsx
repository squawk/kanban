import { useEffect } from "react";
import { AlertTriangle, ArrowUp, CalendarClock, CircleDashed, UserRound, X } from "lucide-react";
import { SPOTLIGHT_LABELS, type BoardPulse as BoardPulseData, type SpotlightKind } from "~/lib/board-pulse";

interface BoardPulseProps {
  pulse: BoardPulseData;
  spotlight: SpotlightKind | null;
  onSpotlightChange: (kind: SpotlightKind | null) => void;
  /** Hide the "Mine" lens when there's no signed-in user */
  showMine?: boolean;
}

const LENS_ICONS: Record<SpotlightKind, typeof AlertTriangle> = {
  overdue: AlertTriangle,
  dueSoon: CalendarClock,
  high: ArrowUp,
  mine: UserRound,
  unassigned: CircleDashed,
};

/** Accent hue per lens, so a lit card's glow tells you why it's lit */
export const LENS_HUES: Record<SpotlightKind, number> = {
  overdue: 4,
  dueSoon: 38,
  high: 330,
  mine: 205,
  unassigned: 260,
};

function ProgressRing({ percent }: { percent: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0" aria-hidden="true">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke="hsl(145 55% 45%)"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground tabular-nums">
        {percent}%
      </span>
    </div>
  );
}

export function BoardPulse({ pulse, spotlight, onSpotlightChange, showMine = true }: BoardPulseProps) {
  // Escape turns the spotlight off
  useEffect(() => {
    if (!spotlight) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) onSpotlightChange(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spotlight, onSpotlightChange]);

  const lenses = (Object.keys(SPOTLIGHT_LABELS) as SpotlightKind[]).filter((k) => showMine || k !== "mine");

  return (
    <section
      className="mb-5 sm:mb-6 rounded-2xl border-2 border-border bg-card/80 backdrop-blur-sm p-4 sm:p-5 shadow-sm"
      aria-label="Board pulse"
      data-testid="board-pulse"
    >
      <div className="flex items-center gap-4 sm:gap-6">
        <ProgressRing percent={pulse.percentDone} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground" data-testid="pulse-done">
                {pulse.doneCount} of {pulse.total}
              </span>{" "}
              {pulse.total === 1 ? "card" : "cards"} done
            </p>
            {pulse.counts.overdue > 0 && (
              <p className="hidden sm:block text-xs font-medium text-destructive">
                {pulse.counts.overdue} need{pulse.counts.overdue === 1 ? "s" : ""} attention
              </p>
            )}
          </div>

          {/* Flow bar: one segment per column, sized by its share of the cards */}
          <div
            className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={pulse.lanes.map((l) => `${l.title}: ${l.count}`).join(", ")}
          >
            {pulse.total > 0 &&
              pulse.lanes
                .filter((l) => l.count > 0)
                .map((lane) => (
                  <div
                    key={lane.id}
                    className="h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full [&:not(:last-child)]:border-r-2 [&:not(:last-child)]:border-card"
                    style={{ width: `${(lane.count / pulse.total) * 100}%`, backgroundColor: `hsl(${lane.hue} 60% 52%)` }}
                    title={`${lane.title}: ${lane.count}`}
                  />
                ))}
          </div>

          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {pulse.lanes.map((lane) => (
              <li key={lane.id} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: `hsl(${lane.hue} 60% 52%)` }}
                  aria-hidden="true"
                />
                {lane.title}
                <span className="font-semibold text-foreground tabular-nums">{lane.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Spotlight lenses: light up matching cards, fade the rest */}
      <div className="mt-4 flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-0.5">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Spotlight
        </span>
        {lenses.map((kind) => {
          const Icon = LENS_ICONS[kind];
          const count = pulse.counts[kind];
          const active = spotlight === kind;
          const hue = LENS_HUES[kind];
          return (
            <button
              key={kind}
              type="button"
              disabled={count === 0 && !active}
              aria-pressed={active}
              onClick={() => onSpotlightChange(active ? null : kind)}
              data-testid={`spotlight-${kind}`}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                active ? "text-white shadow-md scale-105" : "border-border bg-background/60 text-foreground hover:-translate-y-0.5 hover:shadow-sm"
              }`}
              style={
                active
                  ? { backgroundColor: `hsl(${hue} 70% 48%)`, borderColor: `hsl(${hue} 70% 48%)` }
                  : count > 0
                    ? { borderColor: `hsl(${hue} 60% 55% / 0.45)` }
                    : undefined
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" style={active ? undefined : { color: `hsl(${hue} 65% 48%)` }} />
              {SPOTLIGHT_LABELS[kind]}
              <span className={`tabular-nums ${active ? "" : "text-muted-foreground"}`}>{count}</span>
            </button>
          );
        })}
        {spotlight && (
          <button
            type="button"
            onClick={() => onSpotlightChange(null)}
            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            data-testid="spotlight-clear"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Clear <kbd className="hidden sm:inline ml-1 rounded border border-border px-1 text-[10px]">Esc</kbd>
          </button>
        )}
      </div>
    </section>
  );
}
