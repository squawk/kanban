import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import type { KanbanCard, KanbanColumn } from "~/lib/types";
import { Archive, RotateCcw, Trash2, AlertCircle } from "lucide-react";
import { apiFetch } from "~/lib/api";

interface ArchivedCardsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: KanbanColumn[];
  onCardRestored: () => void;
}

export function ArchivedCardsDialog({
  open,
  onOpenChange,
  columns,
  onCardRestored,
}: ArchivedCardsDialogProps) {
  const [archivedCards, setArchivedCards] = useState<KanbanCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchArchivedCards();
    }
  }, [open]);

  const fetchArchivedCards = async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/api/archived-cards");
      if (response.ok) {
        const data = await response.json();
        setArchivedCards(data);
      }
    } catch (error) {
      console.error("Error fetching archived cards:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (cardId: string, columnId?: string) => {
    setActionLoading(cardId);
    try {
      const response = await apiFetch("/api/archived-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "restore",
          cardId,
          columnId: columnId || columns[0]?.id,
        }),
      });

      if (response.ok) {
        setArchivedCards(archivedCards.filter((c) => c.id !== cardId));
        onCardRestored();
      }
    } catch (error) {
      console.error("Error restoring card:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDelete = async (cardId: string) => {
    setActionLoading(cardId);
    try {
      const response = await apiFetch("/api/archived-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          cardId,
        }),
      });

      if (response.ok) {
        setArchivedCards(archivedCards.filter((c) => c.id !== cardId));
        setConfirmDelete(null);
      }
    } catch (error) {
      console.error("Error deleting card:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
      case 'low': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
      default: return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Archived Cards
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading archived cards...</p>
            </div>
          ) : archivedCards.length === 0 ? (
            <div className="text-center py-8">
              <Archive className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground">No archived cards</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Cards you archive will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {archivedCards.map((card) => (
                <div
                  key={card.id}
                  className="border-2 border-border rounded-lg p-4 bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">
                        {card.title}
                      </h3>
                      {card.notes && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {card.notes}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityColor(card.priority)}`}>
                          {card.priority}
                        </span>
                        {card.tags && card.tags.length > 0 && (
                          <>
                            {card.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag.id}
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                              >
                                {tag.name}
                              </span>
                            ))}
                            {card.tags.length > 2 && (
                              <span className="text-xs text-muted-foreground">
                                +{card.tags.length - 2}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {card.archivedAt && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Archived {formatDate(card.archivedAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {confirmDelete === card.id ? (
                        <div className="flex flex-col gap-1">
                          <p className="text-xs text-destructive font-medium">Delete forever?</p>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handlePermanentDelete(card.id)}
                              disabled={actionLoading === card.id}
                              className="h-7 text-xs"
                            >
                              {actionLoading === card.id ? "..." : "Yes"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDelete(null)}
                              disabled={actionLoading === card.id}
                              className="h-7 text-xs"
                            >
                              No
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRestore(card.id)}
                            disabled={actionLoading === card.id}
                            className="h-8"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            {actionLoading === card.id ? "..." : "Restore"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDelete(card.id)}
                            disabled={actionLoading === card.id}
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {archivedCards.length > 0 && (
          <div className="pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Restored cards will be added to the first column
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
