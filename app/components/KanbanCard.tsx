import { useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KanbanCard as KanbanCardType, UserSummary } from "~/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { MessageSquare, Calendar, Lock, ArrowUpRight, EyeOff } from "lucide-react";
import { UserAvatar } from "./UserAvatar";

interface KanbanCardProps {
  card: KanbanCardType;
  onEdit: (card: KanbanCardType) => void;
  onDelete: (cardId: string) => void;
  onGeneratePrompt: (card: KanbanCardType) => void;
  /** Someone else has this card locked for editing */
  lockedBy?: UserSummary;
  /** When set, a card assigned to someone else is dimmed */
  currentUserId?: string;
  /** Spotlight state: "match" glows, "dim" fades into the background */
  spotlight?: "match" | "dim";
  /** Glow color (HSL hue) for a spotlighted card */
  glowHue?: number;
}

export function KanbanCard({ card, onEdit, onDelete, onGeneratePrompt, lockedBy, currentUserId, spotlight, glowHue = 38 }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  // Releasing a drag can fire a click on the same card: remember a drag happened since
  // the last press so that click doesn't open the editor
  const draggedSincePress = useRef(false);
  useEffect(() => {
    if (isDragging) draggedSincePress.current = true;
  }, [isDragging]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-destructive';
      case 'low': return 'border-l-muted';
      default: return 'border-l-primary';
    }
  };

  const formatDueDate = (dateString: string) => {
    // Parse as local date to avoid timezone issues
    // If it's an ISO string, extract just the date part
    const datePart = dateString.split('T')[0];
    const [year, month, day] = datePart.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Compare dates only, not times
    const isOverdue = date < now;
    const isToday = date.toDateString() === now.toDateString();
    const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);

    return {
      text: isToday ? "Today" : days === 1 ? "Tomorrow" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      isOverdue,
      isToday,
      isSoon: days > 0 && days <= 7,
    };
  };

  const dueInfo = card.dueDate ? formatDueDate(card.dueDate) : null;
  // Someone else's card: dim it so your own work stands out
  const assignedToOther = !!(currentUserId && card.assigneeId && card.assigneeId !== currentUserId);
  const hasComments = !!card.comments && card.comments.length > 0;
  const hasFooter = !!dueInfo || hasComments || !!card.assignee;
  const fade =
    spotlight === "dim"
      ? "opacity-25 grayscale scale-[0.97] hover:opacity-100 hover:grayscale-0 hover:scale-100 focus-within:opacity-100"
      : spotlight === "match"
        ? ""
        : assignedToOther
          ? "opacity-60 hover:opacity-100 focus-within:opacity-100"
          : "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group transition-all duration-300 ${isDragging ? "opacity-50" : fade}`}
      data-testid="kanban-card"
      data-assigned-to-other={assignedToOther || undefined}
      data-spotlight={spotlight}
      {...attributes}
      {...listeners}
      // A click opens the card (a drag needs 8px of movement first, so it never fires this);
      // Enter does the same for keyboard users, since the card is focusable
      onPointerDown={(e) => {
        draggedSincePress.current = false;
        listeners?.onPointerDown?.(e);
      }}
      onClick={() => {
        if (draggedSincePress.current) {
          draggedSincePress.current = false;
          return;
        }
        onEdit(card);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) onEdit(card);
        else listeners?.onKeyDown?.(e);
      }}
    >
      <Card
        className={`mb-2.5 rounded-xl cursor-pointer active:cursor-grabbing transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 bg-card border-2 border-border border-l-[6px] ${getPriorityColor(card.priority)}`}
        style={
          spotlight === "match"
            ? {
                boxShadow: `0 0 0 2px hsl(${glowHue} 75% 52%), 0 8px 24px -6px hsl(${glowHue} 75% 50% / 0.55)`,
              }
            : undefined
        }
      >
        <CardHeader className={`p-3.5 ${hasFooter || card.notes ? "pb-2" : ""}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold text-foreground line-clamp-2">
                {card.isPrivate && (
                  <span
                    className="mr-1.5 inline-flex translate-y-[1px] items-center rounded-full bg-muted p-1 align-baseline text-muted-foreground"
                    title="Private: only you can see this card"
                    data-testid="card-private"
                  >
                    <EyeOff className="h-3 w-3" aria-label="Private" />
                  </span>
                )}
                {card.title}
              </CardTitle>
              {card.linkedFrom && (
                <p
                  className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground"
                  title={`This card lives on ${card.linkedFrom.boardName}. It shows here because it's assigned to you; moving it here moves it there too.`}
                  data-testid="card-linked-from"
                >
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  {card.linkedFrom.boardName}
                </p>
              )}
            </div>
            <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onGeneratePrompt(card);
                }}
                className="p-1 rounded-md hover:bg-primary/10 transition-colors"
                aria-label="Generate AI prompt"
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
                  className="text-primary"
                >
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M15 13v2" />
                  <path d="M9 13v2" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(card);
                }}
                className="p-1 rounded-md hover:bg-muted transition-colors"
                aria-label="Edit card"
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
                  className="text-muted-foreground"
                >
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  <path d="m15 5 4 4" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(card.id);
                }}
                disabled={!!lockedBy}
                title={lockedBy ? `${lockedBy.name} is editing this card` : undefined}
                className="p-1 rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Delete card"
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
            </div>
          </div>

          {/* Someone else has this card locked for editing */}
          {lockedBy && (
            <div
              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400"
              data-testid="card-locked"
              title={`${lockedBy.name} has this card open. It's read-only for others until they close it.`}
            >
              <Lock className="h-3 w-3" aria-hidden="true" />
              <UserAvatar user={lockedBy} size="xs" />
              {lockedBy.name.split(" ")[0]} is editing
            </div>
          )}

          {/* Tags */}
          {card.tags && card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {card.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </CardHeader>
        {(card.notes || hasFooter) && (
        <CardContent className="p-3.5 pt-0 space-y-2">
          {card.notes && (
            <p className="text-xs text-muted-foreground line-clamp-3">
              {card.notes}
            </p>
          )}

          {/* Footer with due date and comments */}
          {hasFooter && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-2">
              {/* Due date */}
              {dueInfo && (
                <div
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    dueInfo.isOverdue
                      ? 'bg-destructive/15 text-destructive font-semibold'
                      : dueInfo.isToday
                      ? 'bg-primary/15 text-primary font-semibold'
                      : dueInfo.isSoon
                      ? 'bg-amber-500/15 text-amber-600 font-medium'
                      : 'bg-muted'
                  }`}
                  title={dueInfo.isOverdue ? 'Overdue!' : dueInfo.isToday ? 'Due today' : 'Due date'}
                >
                  <Calendar className="h-3 w-3" />
                  <span>{dueInfo.text}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Comments count */}
              {hasComments && card.comments && (
                <div className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  <span>{card.comments.length}</span>
                </div>
              )}

              {/* Assignee */}
              {card.assignee && (
                <span data-testid="card-assignee" title={`Assigned to ${card.assignee.name}`}>
                  <UserAvatar user={card.assignee} size="xs" />
                </span>
              )}
            </div>
          </div>
          )}
        </CardContent>
        )}
      </Card>
    </div>
  );
}
