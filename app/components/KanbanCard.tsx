import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { KanbanCard as KanbanCardType } from "~/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { MessageSquare, Calendar, AlertCircle } from "lucide-react";

interface KanbanCardProps {
  card: KanbanCardType;
  onEdit: (card: KanbanCardType) => void;
  onDelete: (cardId: string) => void;
  onGeneratePrompt: (card: KanbanCardType) => void;
}

export function KanbanCard({ card, onEdit, onDelete, onGeneratePrompt }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-destructive';
      case 'low': return 'border-l-primary/50';
      default: return 'border-l-primary';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <AlertCircle className="h-3 w-3 text-destructive" />;
      case 'low': return <AlertCircle className="h-3 w-3 text-primary/50" />;
      default: return <AlertCircle className="h-3 w-3 text-primary" />;
    }
  };

  const formatDueDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isOverdue = date < now;
    const isToday = date.toDateString() === now.toDateString();

    return {
      text: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      isOverdue,
      isToday,
    };
  };

  const dueInfo = card.dueDate ? formatDueDate(card.dueDate) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group ${isDragging ? "opacity-50" : ""}`}
      {...attributes}
      {...listeners}
    >
      <Card className={`mb-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-lg hover:scale-[1.02] bg-card border-2 border-border border-l-4 ${getPriorityColor(card.priority)}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-semibold text-foreground line-clamp-2">
              {card.title}
            </CardTitle>
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
                className="p-1 rounded-md hover:bg-destructive/10 transition-colors"
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
        <CardContent className="pt-0 space-y-2">
          {card.notes && (
            <p className="text-xs text-muted-foreground line-clamp-3">
              {card.notes}
            </p>
          )}

          {/* Footer with due date, priority, and comments */}
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
            <div className="flex items-center gap-2">
              {/* Priority indicator */}
              <div className="flex items-center gap-0.5" title={`Priority: ${card.priority}`}>
                {getPriorityIcon(card.priority)}
              </div>

              {/* Due date */}
              {dueInfo && (
                <div
                  className={`flex items-center gap-1 ${
                    dueInfo.isOverdue
                      ? 'text-destructive font-semibold'
                      : dueInfo.isToday
                      ? 'text-primary font-semibold'
                      : ''
                  }`}
                  title={dueInfo.isOverdue ? 'Overdue!' : dueInfo.isToday ? 'Due today' : 'Due date'}
                >
                  <Calendar className="h-3 w-3" />
                  <span>{dueInfo.text}</span>
                </div>
              )}
            </div>

            {/* Comments count */}
            {card.comments && card.comments.length > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                <span>{card.comments.length}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
