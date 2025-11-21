import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { KanbanCard as KanbanCardType, KanbanColumn as KanbanColumnType } from "~/lib/types";
import { KanbanCard } from "./KanbanCard";
import { Button } from "./ui/button";

interface KanbanColumnProps {
  column: KanbanColumnType;
  cards: KanbanCardType[];
  onAddCard: (columnId: string) => void;
  onEditCard: (card: KanbanCardType) => void;
  onDeleteCard: (cardId: string) => void;
  onGeneratePrompt: (card: KanbanCardType) => void;
  onDeleteColumn?: (columnId: string) => void;
  isDeletable?: boolean;
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
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: column.id,
  });

  return (
    <div className="flex-shrink-0 w-80">
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 rounded-xl p-4 shadow-sm border-2 border-gray-300 dark:border-gray-600">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 dark:text-gray-100">
              {column.title}
            </h3>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full">
              {cards.length}
            </span>
          </div>
          {isDeletable && onDeleteColumn && (
            <button
              onClick={() => onDeleteColumn(column.id)}
              className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
                className="text-red-600 dark:text-red-400"
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
            {cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                onEdit={onEditCard}
                onDelete={onDeleteCard}
                onGeneratePrompt={onGeneratePrompt}
              />
            ))}
          </div>
        </SortableContext>

        <Button
          variant="ghost"
          className="w-full mt-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white dark:hover:bg-gray-800 transition-all"
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
      </div>
    </div>
  );
}
