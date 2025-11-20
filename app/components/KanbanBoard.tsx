import { useState, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import confetti from "canvas-confetti";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { CardDialog } from "./CardDialog";
import { ColumnDialog } from "./ColumnDialog";
import { PromptDialog } from "./PromptDialog";
import { Button } from "./ui/button";
import {
  KanbanCard as KanbanCardType,
  KanbanColumn as KanbanColumnType,
  KanbanBoard as KanbanBoardType,
} from "~/lib/types";
import { getInitialBoard, saveBoard, generateId } from "~/lib/storage";

export function KanbanBoard() {
  const [board, setBoard] = useState<KanbanBoardType>(getInitialBoard());
  const [activeCard, setActiveCard] = useState<KanbanCardType | null>(null);
  const [isCardDialogOpen, setIsCardDialogOpen] = useState(false);
  const [isColumnDialogOpen, setIsColumnDialogOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<KanbanCardType | null>(null);
  const [targetColumnId, setTargetColumnId] = useState<string | null>(null);

  // AI Prompt generation state
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [promptError, setPromptError] = useState<string | undefined>();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    saveBoard(board);
  }, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const card = board.cards[active.id as string];
    setActiveCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find which columns the active and over items belong to
    const activeColumn = board.columns.find((col) =>
      col.cardIds.includes(activeId)
    );
    const overColumn =
      board.columns.find((col) => col.id === overId) ||
      board.columns.find((col) => col.cardIds.includes(overId));

    if (!activeColumn || !overColumn) return;

    if (activeColumn.id === overColumn.id) {
      // Reordering within the same column
      const oldIndex = activeColumn.cardIds.indexOf(activeId);
      const newIndex = activeColumn.cardIds.indexOf(overId);

      if (oldIndex !== newIndex) {
        setBoard((prev) => ({
          ...prev,
          columns: prev.columns.map((col) =>
            col.id === activeColumn.id
              ? {
                  ...col,
                  cardIds: arrayMove(col.cardIds, oldIndex, newIndex),
                }
              : col
          ),
        }));
      }
    } else {
      // Moving to a different column
      setBoard((prev) => ({
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id === activeColumn.id) {
            return {
              ...col,
              cardIds: col.cardIds.filter((id) => id !== activeId),
            };
          }
          if (col.id === overColumn.id) {
            const newCardIds = [...col.cardIds];
            const insertIndex = overId === col.id ? newCardIds.length : newCardIds.indexOf(overId);
            newCardIds.splice(insertIndex, 0, activeId);
            return {
              ...col,
              cardIds: newCardIds,
            };
          }
          return col;
        }),
      }));

      // Trigger confetti if card is moved to completed column
      if (overColumn.id === "completed" && activeColumn.id !== "completed") {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#60a5fa', '#a78bfa', '#f472b6'], // Blue, purple, pink to match the gradient
        });
      }
    }
  };

  const handleAddCard = (columnId: string) => {
    setTargetColumnId(columnId);
    setEditingCard(null);
    setIsCardDialogOpen(true);
  };

  const handleEditCard = (card: KanbanCardType) => {
    setEditingCard(card);
    setTargetColumnId(null);
    setIsCardDialogOpen(true);
  };

  const handleSaveCard = (title: string, notes: string) => {
    if (editingCard) {
      // Update existing card
      setBoard((prev) => ({
        ...prev,
        cards: {
          ...prev.cards,
          [editingCard.id]: {
            ...editingCard,
            title,
            notes,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    } else if (targetColumnId) {
      // Create new card
      const newCard: KanbanCardType = {
        id: generateId(),
        title,
        notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setBoard((prev) => ({
        ...prev,
        cards: {
          ...prev.cards,
          [newCard.id]: newCard,
        },
        columns: prev.columns.map((col) =>
          col.id === targetColumnId
            ? { ...col, cardIds: [...col.cardIds, newCard.id] }
            : col
        ),
      }));
    }

    setIsCardDialogOpen(false);
    setEditingCard(null);
    setTargetColumnId(null);
  };

  const handleDeleteCard = (cardId: string) => {
    setBoard((prev) => {
      const newCards = { ...prev.cards };
      delete newCards[cardId];

      return {
        ...prev,
        cards: newCards,
        columns: prev.columns.map((col) => ({
          ...col,
          cardIds: col.cardIds.filter((id) => id !== cardId),
        })),
      };
    });
  };

  const handleAddColumn = (title: string) => {
    const newColumn: KanbanColumnType = {
      id: generateId(),
      title,
      cardIds: [],
    };

    setBoard((prev) => ({
      ...prev,
      columns: [...prev.columns, newColumn],
    }));

    setIsColumnDialogOpen(false);
  };

  const handleDeleteColumn = (columnId: string) => {
    setBoard((prev) => {
      // Remove cards in this column
      const columnToDelete = prev.columns.find((col) => col.id === columnId);
      if (!columnToDelete) return prev;

      const newCards = { ...prev.cards };
      columnToDelete.cardIds.forEach((cardId) => {
        delete newCards[cardId];
      });

      return {
        ...prev,
        cards: newCards,
        columns: prev.columns.filter((col) => col.id !== columnId),
      };
    });
  };

  const handleGeneratePrompt = async (card: KanbanCardType) => {
    setIsPromptDialogOpen(true);
    setIsGenerating(true);
    setPromptError(undefined);
    setGeneratedPrompt("");

    try {
      const response = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: card.title,
          notes: card.notes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate prompt");
      }

      setGeneratedPrompt(data.prompt);

      // Save the generated prompt to the card
      setBoard((prev) => ({
        ...prev,
        cards: {
          ...prev.cards,
          [card.id]: {
            ...card,
            generatedPrompt: data.prompt,
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    } catch (error) {
      console.error("Error generating prompt:", error);
      setPromptError(
        error instanceof Error ? error.message : "Failed to generate prompt"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const defaultColumnIds = ["todo", "in-progress", "completed"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
              Vibe Coding Kanban
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Organize your projects with style
            </p>
          </div>
          <Button
            onClick={() => setIsColumnDialogOpen(true)}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all"
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
            Add Column
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-6 overflow-x-auto pb-4">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds
                  .map((id) => board.cards[id])
                  .filter(Boolean)}
                onAddCard={handleAddCard}
                onEditCard={handleEditCard}
                onDeleteCard={handleDeleteCard}
                onGeneratePrompt={handleGeneratePrompt}
                onDeleteColumn={handleDeleteColumn}
                isDeletable={!defaultColumnIds.includes(column.id)}
              />
            ))}
          </div>

          <DragOverlay>
            {activeCard ? (
              <div className="rotate-3 scale-105">
                <KanbanCard
                  card={activeCard}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onGeneratePrompt={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <CardDialog
        open={isCardDialogOpen}
        onOpenChange={setIsCardDialogOpen}
        onSave={handleSaveCard}
        initialTitle={editingCard?.title}
        initialNotes={editingCard?.notes}
      />

      <ColumnDialog
        open={isColumnDialogOpen}
        onOpenChange={setIsColumnDialogOpen}
        onSave={handleAddColumn}
      />

      <PromptDialog
        open={isPromptDialogOpen}
        onOpenChange={setIsPromptDialogOpen}
        prompt={generatedPrompt}
        isLoading={isGenerating}
        error={promptError}
      />
    </div>
  );
}
