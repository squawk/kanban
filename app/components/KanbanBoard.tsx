import { useState, useEffect, useCallback, useRef } from "react";
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
import { ArchivedCardsDialog } from "./ArchivedCardsDialog";
import { BoardMembersDialog } from "./BoardMembersDialog";
import { UserAvatar } from "./UserAvatar";
import { Button } from "./ui/button";
import { Archive, Users } from "lucide-react";
import type {
  KanbanCard as KanbanCardType,
  KanbanBoard as KanbanBoardType,
  BoardMember,
  UserSummary,
  CurrentUser,
} from "~/lib/types";
import { apiFetch } from "~/lib/api";
import { useCardLock } from "~/lib/use-card-lock";
import {
  subscribeToBoard,
  type BoardSubscription,
  type BoardViewer,
  type RealtimeStatus,
} from "~/lib/realtime-client";

type AssigneeFilter = "all" | "mine" | "unassigned";

/** Polling for shared boards: frequent without Realtime, a slow safety net with it */
const REFRESH_INTERVAL_MS = 30_000;
const LIVE_REFRESH_INTERVAL_MS = 5 * 60_000;

interface KanbanBoardProps {
  /** Board to show; defaults to the current user's own board */
  boardId?: string | null;
  currentUser?: CurrentUser;
  /** Card to open on load (e.g. from an email link) */
  openCardId?: string | null;
  onOpenCardHandled?: () => void;
  /** Called when the user leaves a shared board */
  onLeftBoard?: () => void;
  /** Called after the board loads (name, role) */
  onBoardLoaded?: (info: { id: string; name: string; role: "owner" | "member" }) => void;
}

export function KanbanBoard({
  boardId,
  currentUser,
  openCardId,
  onOpenCardHandled,
  onLeftBoard,
  onBoardLoaded,
}: KanbanBoardProps = {}) {
  const [board, setBoard] = useState<KanbanBoardType>({ columns: [], cards: {} });
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);
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

  // Archive dialog state
  const [isArchivedDialogOpen, setIsArchivedDialogOpen] = useState(false);
  const [archivedCount, setArchivedCount] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const boardQuery = boardId ? `?boardId=${encodeURIComponent(boardId)}` : "";
  const resolvedBoardId = board.board?.id ?? boardId ?? undefined;
  const isOwner = !board.board || board.board.role === "owner";
  const members: BoardMember[] = board.members ?? [];
  const isShared = members.length > 1;

  // Load board from database on mount / when switching boards
  useEffect(() => {
    setLoading(true);
    setAssigneeFilter("all");
    fetchBoard();
    fetchArchivedCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // Open a specific card once the board has loaded (deep link from email)
  useEffect(() => {
    if (!openCardId || loading) return;
    const card = board.cards[openCardId];
    if (card) handleEditCard(card);
    onOpenCardHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCardId, loading]);

  // Keep shared boards fresh. Refreshes wait while something is being edited or
  // dragged (so a collaborator's change never yanks a dialog or drag out from under you)
  // and run as soon as you're done.
  const isBusy = isCardDialogOpen || isColumnDialogOpen || isArchivedDialogOpen || isMembersDialogOpen || !!activeCard;
  const busyRef = useRef(false);
  busyRef.current = isBusy;
  const pendingRefreshRef = useRef(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const [liveStatus, setLiveStatus] = useState<RealtimeStatus | null>(null);
  const [viewers, setViewers] = useState<BoardViewer[]>([]);
  const subscriptionRef = useRef<BoardSubscription | null>(null);

  const lockRecheckRef = useRef<(() => void) | null>(null);
  const refresh = useCallback(() => {
    // A lock may have been released or taken over: re-check the open card's lock right away
    lockRecheckRef.current?.();
    if (busyRef.current || document.visibilityState !== "visible") {
      pendingRefreshRef.current = true;
      return;
    }
    pendingRefreshRef.current = false;
    window.clearTimeout(debounceRef.current);
    // Coalesce bursts (e.g. a drag that moves several cards) into one fetch
    debounceRef.current = window.setTimeout(() => {
      fetchBoard();
      fetchArchivedCount();
    }, 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  useEffect(() => {
    if (!isBusy && pendingRefreshRef.current) refresh();
  }, [isBusy, refresh]);

  // Live updates over Supabase Realtime for shared boards
  const realtimeTopic = isShared ? board.realtime?.topic : undefined;
  useEffect(() => {
    if (!realtimeTopic || !board.realtime || !board.board || !currentUser) {
      setLiveStatus(null);
      setViewers([]);
      return;
    }
    const subscription = subscribeToBoard({
      boardId: board.board.id,
      userId: currentUser.id,
      info: board.realtime,
      onChange: refresh,
      onStatus: setLiveStatus,
      onPresence: setViewers,
    });
    subscriptionRef.current = subscription;
    return () => {
      subscriptionRef.current = null;
      subscription.unsubscribe();
      setViewers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeTopic, refresh, currentUser?.id]);

  // Only trust presence from current board members (it's client-reported)
  const memberById = new Map(members.map((m) => [m.id, m]));
  const viewerIds = new Set(viewers.filter((v) => memberById.has(v.userId)).map((v) => v.userId));
  const otherViewerCount = [...viewerIds].filter((id) => id !== currentUser?.id).length;

  // Edit locks (server-side, authoritative): who else is editing which card
  const lockedByOther = new Map<string, UserSummary>();
  for (const card of Object.values(board.cards)) {
    if (card.lock && card.lock.userId !== currentUser?.id) {
      lockedByOther.set(
        card.id,
        memberById.get(card.lock.userId) ?? { id: card.lock.userId, name: card.lock.name, email: "" }
      );
    }
  }

  // Hold the lock for the card open in the edit dialog
  const [saveError, setSaveError] = useState<string | undefined>();
  const cardLock = useCardLock(isCardDialogOpen && editingCard ? editingCard.id : null, {
    // We waited for (or took over from) another editor: show their latest saved version
    onReacquired: async (cardId) => {
      const fresh = await fetchBoard();
      if (fresh?.cards?.[cardId]) setEditingCard(fresh.cards[cardId]);
    },
  });
  lockRecheckRef.current = isCardDialogOpen && editingCard ? cardLock.recheck : null;

  useEffect(() => {
    if (!isShared) return;
    const interval = liveStatus === "live" ? LIVE_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS;
    const id = window.setInterval(refresh, interval);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isShared, liveStatus, refresh]);

  const saveColumns = (newColumns: KanbanBoardType["columns"]) =>
    apiFetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        resolvedBoardId ? { boardId: resolvedBoardId, columns: newColumns } : { columns: newColumns }
      ),
    });

  const fetchArchivedCount = async () => {
    try {
      const response = await apiFetch(`/api/archived-cards${boardQuery}`);
      if (response.ok) {
        const data = await response.json();
        setArchivedCount(data.length);
      }
    } catch (error) {
      console.error("Error fetching archived count:", error);
    }
  };

  const fetchBoard = async (): Promise<KanbanBoardType | null> => {
    try {
      const response = await apiFetch(`/api/board${boardQuery}`);
      if (response.ok) {
        const data = await response.json();
        setBoard(data);
        if (data.board) onBoardLoaded?.(data.board);
        return data;
      } else if (response.status === 404 && boardId) {
        // Removed from this shared board (or it was deleted): go back to your own board
        onLeftBoard?.();
      } else {
        console.error("Failed to fetch board");
      }
    } catch (error) {
      console.error("Error fetching board:", error);
    } finally {
      setLoading(false);
    }
    return null;
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
        await saveColumns(newColumns);
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
      await saveColumns(newColumns);

      // Trigger confetti if card is moved to completed column (check by title)
      console.log(`Move detected: from "${activeColumn.title}" to "${overColumn.title}"`);
      if (overColumn.title.toLowerCase() === "completed" && activeColumn.title.toLowerCase() !== "completed") {
        console.log('Triggering confetti for card moved to Completed');
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
    // Find the column this card belongs to
    const column = board.columns.find(col => col.cardIds.includes(card.id));
    setTargetColumnId(column?.id || null);
    setIsCardDialogOpen(true);
  };

  const handleColumnChange = async (newColumnId: string) => {
    if (!editingCard || !targetColumnId || newColumnId === targetColumnId) return;

    const sourceColumn = board.columns.find(col => col.id === targetColumnId);
    const destColumn = board.columns.find(col => col.id === newColumnId);

    if (!sourceColumn || !destColumn) return;

    // Build new columns array with card moved
    const newColumns = board.columns.map((col) => {
      if (col.id === targetColumnId) {
        return {
          ...col,
          cardIds: col.cardIds.filter((id) => id !== editingCard.id),
        };
      }
      if (col.id === newColumnId) {
        return {
          ...col,
          cardIds: [...col.cardIds, editingCard.id],
        };
      }
      return col;
    });

    // Update local state
    setBoard((prev) => ({
      ...prev,
      columns: newColumns,
    }));
    setTargetColumnId(newColumnId);

    // Save to database
    await saveColumns(newColumns);

    // Trigger confetti if card is moved to completed column
    if (destColumn.title.toLowerCase() === "completed" && sourceColumn.title.toLowerCase() !== "completed") {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#60a5fa', '#a78bfa', '#f472b6'],
      });
    }
  };

  const handleSaveCard = async (data: {
    title: string;
    notes: string;
    dueDate?: string;
    priority: 'low' | 'medium' | 'high';
    tagIds: string[];
    assigneeId?: string | null;
  }): Promise<boolean> => {
    setSaveError(undefined);
    if (editingCard) {
      // Update existing card
      try {
        const response = await apiFetch(`/api/cards/${editingCard.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            notes: data.notes,
            dueDate: data.dueDate,
            priority: data.priority,
            tagIds: data.tagIds,
            ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
          }),
        });

        if (response.status === 423) {
          // Someone else holds the edit lock: keep the dialog open so nothing is lost
          const body = await response.json().catch(() => ({}));
          setSaveError(body.error || "Someone else is editing this card");
          return false;
        }
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
        const response = await apiFetch("/api/cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title,
            notes: data.notes,
            dueDate: data.dueDate,
            priority: data.priority,
            tagIds: data.tagIds,
            columnId: targetColumnId,
            ...(data.assigneeId && { assigneeId: data.assigneeId }),
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
    return true;
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      const response = await apiFetch(`/api/cards/${cardId}`, {
        method: "DELETE",
      });

      if (response.status === 423) {
        const body = await response.json().catch(() => ({}));
        window.alert(body.error || "Someone else is editing this card");
        return;
      }

      if (response.ok) {
        // Poof/smoke effect for archive
        const colors = ['#94a3b8', '#cbd5e1', '#e2e8f0'];
        confetti({
          particleCount: 40,
          spread: 100,
          origin: { y: 0.6 },
          colors: colors,
          shapes: ['circle'],
          gravity: 0.3,
          scalar: 1.2,
          drift: 0,
          ticks: 80,
          startVelocity: 15,
        });

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
        // Update archived count
        setArchivedCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  const handleAddColumn = async (title: string) => {
    try {
      const response = await apiFetch("/api/columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resolvedBoardId ? { title, boardId: resolvedBoardId } : { title }),
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
      const response = await apiFetch(`/api/columns/${columnId}`, {
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
      const response = await apiFetch("/api/generate-prompt", {
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
      await apiFetch(`/api/cards/${card.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Only the prompt: re-sending title/notes could overwrite someone else's edits
        body: JSON.stringify({ generatedPrompt: data.prompt }),
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

  // Default column titles that cannot be deleted
  const defaultColumnTitles = ["to do", "in progress", "completed"];

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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
          <div className="min-w-0">
            {board.board && (
              <h2 className="text-lg font-semibold text-foreground truncate" data-testid="board-name">
                {board.board.name}
                {!isOwner && (
                  <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">shared with you</span>
                )}
                {liveStatus === "live" && (
                  <span
                    className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-muted-foreground"
                    title="Changes from other people appear automatically"
                    data-testid="live-indicator"
                  >
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
                    Live
                  </span>
                )}
              </h2>
            )}
            <p className="hidden sm:block text-muted-foreground">
              Organize your projects with style
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {members.length > 0 && (
              <div className="flex items-center gap-2">
                {isShared && (
                  <div
                    className="hidden sm:flex items-center -space-x-2"
                    aria-label={
                      liveStatus === "live"
                        ? `Board members, ${otherViewerCount} other${otherViewerCount === 1 ? "" : "s"} viewing now`
                        : "Board members"
                    }
                    data-testid="member-stack"
                  >
                    {/* People viewing right now first, then everyone else dimmed */}
                    {[...members]
                      .sort((a, b) => Number(viewerIds.has(b.id)) - Number(viewerIds.has(a.id)))
                      .slice(0, 5)
                      .map((m) => {
                        const viewing = viewerIds.has(m.id);
                        return (
                          <span
                            key={m.id}
                            className={`relative ${liveStatus === "live" && !viewing ? "opacity-40" : ""}`}
                            title={
                              liveStatus !== "live"
                                ? m.name
                                : viewing
                                  ? `${m.name}${m.id === currentUser?.id ? " (you)" : ""} · viewing now`
                                  : `${m.name} · not here`
                            }
                            data-testid={viewing ? "viewer-present" : undefined}
                            data-user-id={m.id}
                          >
                            <UserAvatar user={m} />
                            {liveStatus === "live" && viewing && (
                              <span
                                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-card"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                        );
                      })}
                    {members.length > 5 && (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] ring-2 ring-card">
                        +{members.length - 5}
                      </span>
                    )}
                  </div>
                )}
                <select
                  aria-label="Filter by assignee"
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value as AssigneeFilter)}
                  className="h-9 px-2 border-2 border-border rounded-md bg-card text-foreground text-sm"
                >
                  <option value="all">All cards</option>
                  <option value="mine">Assigned to me</option>
                  <option value="unassigned">Unassigned</option>
                </select>
                <Button variant="outline" onClick={() => setIsMembersDialogOpen(true)}>
                  <Users className="h-4 w-4 mr-2" />
                  {isOwner ? "Share" : "Members"}
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              onClick={() => setIsArchivedDialogOpen(true)}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive
              {archivedCount > 0 && (
                <span className="ml-2 bg-muted text-muted-foreground text-xs font-medium px-1.5 py-0.5 rounded-full">
                  {archivedCount}
                </span>
              )}
            </Button>
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
                  .filter(Boolean)
                  .filter((card) =>
                    assigneeFilter === "all"
                      ? true
                      : assigneeFilter === "mine"
                        ? card.assigneeId === currentUser?.id
                        : !card.assigneeId
                  )}
                lockedByOther={lockedByOther}
                onAddCard={handleAddCard}
                onEditCard={handleEditCard}
                onDeleteCard={handleDeleteCard}
                onGeneratePrompt={handleGeneratePrompt}
                onDeleteColumn={handleDeleteColumn}
                isDeletable={isOwner && !defaultColumnTitles.includes(column.title.toLowerCase())}
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
        onOpenChange={(open) => {
          setIsCardDialogOpen(open);
          if (!open) setSaveError(undefined);
        }}
        onSave={handleSaveCard}
        initialCard={editingCard || undefined}
        cardId={editingCard?.id}
        columns={board.columns}
        currentColumnId={targetColumnId || undefined}
        onColumnChange={handleColumnChange}
        members={board.members}
        currentUserId={currentUser?.id}
        lockState={editingCard ? cardLock.state : undefined}
        onTakeOver={cardLock.takeOver}
        saveError={saveError}
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

      <ArchivedCardsDialog
        open={isArchivedDialogOpen}
        onOpenChange={setIsArchivedDialogOpen}
        columns={board.columns}
        boardId={resolvedBoardId}
        canDelete={isOwner}
        onCardRestored={() => {
          fetchBoard();
          fetchArchivedCount();
        }}
      />

      {board.board && currentUser && (
        <BoardMembersDialog
          open={isMembersDialogOpen}
          onOpenChange={setIsMembersDialogOpen}
          boardId={board.board.id}
          boardName={board.board.name}
          isOwner={isOwner}
          currentUserId={currentUser.id}
          members={members}
          onMembersChange={(next) => {
            setBoard((prev) => ({ ...prev, members: next }));
            fetchBoard();
          }}
          onLeft={onLeftBoard}
        />
      )}
    </div>
  );
}
