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

export function KanbanBoard() {
  const [board, setBoard] = useState<KanbanBoardType>({ columns: [], cards: {} });
  const [loading, setLoading] = useState(true);
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

  // Load board from database on mount
  useEffect(() => {
    fetchBoard();
  }, []);

  const fetchBoard = async () => {
    try {
      const response = await fetch("/api/board");
      if (response.ok) {
        const data = await response.json();
        setBoard(data);
      } else {
        console.error("Failed to fetch board");
      }
    } catch (error) {
      console.error("Error fetching board:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const card = board.cards[active.id as string];
    setActiveCard(card);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
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

    let newColumns = board.columns;

    if (activeColumn.id === overColumn.id) {
      // Reordering within the same column
      const oldIndex = activeColumn.cardIds.indexOf(activeId);
      const newIndex = activeColumn.cardIds.indexOf(overId);

      if (oldIndex !== newIndex) {
        newColumns = board.columns.map((col) =>
          col.id === activeColumn.id
            ? {
                ...col,
                cardIds: arrayMove(col.cardIds, oldIndex, newIndex),
              }
            : col
        );

        setBoard((prev) => ({
          ...prev,
          columns: newColumns,
        }));

        // Save to database
        await fetch("/api/board", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ columns: newColumns }),
        });
      }
    } else {
      // Moving to a different column
      newColumns = board.columns.map((col) => {
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
      });

      setBoard((prev) => ({
        ...prev,
        columns: newColumns,
      }));

      // Save to database
      await fetch("/api/board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: newColumns }),
      });

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

  const handleSaveCard = async (data: {
    title: string;
    notes: string;
    dueDate?: string;
    priority: 'low' | 'medium' | 'high';
    tagIds: string[];
  }) => {
    if (editingCard) {
      // Update existing card
      try {
        const response = await fetch(`/api/cards/${editingCard.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            notes: data.notes,
            dueDate: data.dueDate,
            priority: data.priority,
            tagIds: data.tagIds,
          }),
        });

        if (response.ok) {
          // Refresh board to get updated card with tags
          await fetchBoard();
        }
      } catch (error) {
        console.error("Error updating card:", error);
      }
    } else if (targetColumnId) {
      // Create new card
      try {
        const response = await fetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            notes: data.notes,
            dueDate: data.dueDate,
            priority: data.priority,
            tagIds: data.tagIds,
            columnId: targetColumnId,
          }),
        });

        if (response.ok) {
          // Refresh the board to get the new card
          await fetchBoard();
        }
      } catch (error) {
        console.error("Error creating card:", error);
      }
    }

    setIsCardDialogOpen(false);
    setEditingCard(null);
    setTargetColumnId(null);
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      const response = await fetch(`/api/cards/${cardId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove from local state
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
      }
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  const handleAddColumn = async (title: string) => {
    try {
      const response = await fetch("/api/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (response.ok) {
        // Refresh the board to get the new column
        await fetchBoard();
      }
    } catch (error) {
      console.error("Error creating column:", error);
    }

    setIsColumnDialogOpen(false);
  };

  const handleDeleteColumn = async (columnId: string) => {
    try {
      const response = await fetch(`/api/columns/${columnId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove from local state
        setBoard((prev) => {
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
      }
    } catch (error) {
      console.error("Error deleting column:", error);
    }
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

      // Save the generated prompt to the database
      await fetch(`/api/cards/${card.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: card.title,
          notes: card.notes,
          generatedPrompt: data.prompt,
        }),
      });

      // Update local state
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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your kanban board...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div>
            <p className="hidden sm:block text-muted-foreground">
              Organize your projects with style
            </p>
          </div>
          <Button
            onClick={() => setIsColumnDialogOpen(true)}
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
          <div className="flex gap-4 sm:gap-6 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
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
        initialCard={editingCard || undefined}
        cardId={editingCard?.id}
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
