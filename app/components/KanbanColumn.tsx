import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { KanbanCard as KanbanCardType, KanbanColumn as KanbanColumnType, UserSummary } from "~/lib/types";
import { KanbanCard } from "./KanbanCard";
import { Button } from "./ui/button";
import { matchesSpotlight, type SpotlightKind } from "~/lib/board-pulse";
import { isDoneColumn } from "~/lib/due-reminders";
import { LENS_HUES } from "./BoardPulse";

interface KanbanColumnProps {
  column: KanbanColumnType;
  cards: KanbanCardType[];
  /** Omit to hide "Add Card" (e.g. the combined view) */
  onAddCard?: (columnId: string) => void;
  /** Cards assigned to someone else are dimmed */
  currentUserId?: string;
  onEditCard: (card: KanbanCardType) => void;
  onDeleteCard: (cardId: string) => void;
  onGeneratePrompt: (card: KanbanCardType) => void;
  onDeleteColumn?: (columnId: string) => void;
  isDeletable?: boolean;
  /** Cards someone else has locked for editing, with who */
  lockedByOther?: Map<string, UserSummary>;
  /** Lane color (HSL hue) shared with the Board Pulse flow bar */
  hue?: number;
  /** Active spotlight lens: matching cards light up, the rest fade */
  spotlight?: SpotlightKind | null;
}

export function KanbanColumn({
  column,
  cards,
  onAddCard,
  onEditCard,
  onDeleteCard,
  onGeneratePrompt,
  onDeleteColumn,
  isDeletable = false,
  lockedByOther,
  currentUserId,
  hue,
  spotlight,
}: KanbanColumnProps) {
  const isDone = isDoneColumn(column.title);
  const litCount = spotlight
    ? cards.filter((card) => matchesSpotlight(card, spotlight, { currentUserId, isDone })).length
    : 0;
  const lane = hue === undefined ? undefined : `hsl(${hue} 60% 52%)`;
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  return (
    <div className="flex-shrink-0 w-72 sm:w-80">
      <div
        className="relative overflow-hidden bg-card/80 backdrop-blur-sm rounded-2xl p-3 sm:p-4 pt-5 sm:pt-5 shadow-sm border-2 border-border"
        style={lane ? { backgroundImage: `linear-gradient(to bottom, hsl(${hue} 60% 52% / 0.09), transparent 140px)` } : undefined}
        data-testid="kanban-column"
      >
        {lane && (
          <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: lane }} aria-hidden="true" />
        )}
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            {lane && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: lane }} aria-hidden="true" />}
            <h3 className="font-bold text-foreground">
              {column.title}
            </h3>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums bg-muted text-foreground"
              style={lane ? { backgroundColor: `hsl(${hue} 60% 52% / 0.18)` } : undefined}
            >
              {spotlight ? `${litCount}/${cards.length}` : cards.length}
            </span>
          </div>
          {isDeletable && onDeleteColumn && (
            <button
              onClick={() => onDeleteColumn(column.id)}
              className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
              aria-label="Delete column"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-destructive"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>

        <SortableContext
          items={cards.map((card) => card.id)}
          strategy={verticalListSortingStrategy}
        >
          <div
            ref={setNodeRef}
            className="min-h-[200px] space-y-2"
          >
            {cards.length === 0 && (
              <div className="flex h-28 items-center justify-center rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground">
                Drop cards here
              </div>
            )}
            {cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                spotlight={
                  spotlight
                    ? matchesSpotlight(card, spotlight, { currentUserId, isDone })
                      ? "match"
                      : "dim"
                    : undefined
                }
                glowHue={spotlight ? LENS_HUES[spotlight] : undefined}
                lockedBy={lockedByOther?.get(card.id)}
                currentUserId={currentUserId}
                onEdit={onEditCard}
                onDelete={onDeleteCard}
                onGeneratePrompt={onGeneratePrompt}
              />
            ))}
          </div>
        </SortableContext>

        {onAddCard && (
        <Button
          variant="ghost"
          className="w-full mt-3 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          onClick={() => onAddCard(column.id)}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          Add Card
        </Button>
        )}
      </div>
    </div>
  );
}
