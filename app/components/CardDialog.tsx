import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Button } from "./ui/button";
import type { ActivityEntry, BoardMember, Comment, Tag, KanbanCard, KanbanColumn } from "~/lib/types";
import { MessageSquare, Send, Calendar, Tag as TagIcon, AlertCircle, Plus, Columns, User as UserIcon, History } from "lucide-react";
import { UserAvatar } from "./UserAvatar";
import type { CardLockState } from "~/lib/use-card-lock";
import { Lock } from "lucide-react";
import { CardHistory } from "./CardHistory";

interface CardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    title: string;
    notes: string;
    dueDate?: string;
    priority: 'low' | 'medium' | 'high';
    tagIds: string[];
    assigneeId?: string | null;
  }) => void | boolean | Promise<void | boolean>;
  initialCard?: KanbanCard;
  cardId?: string;
  columns?: KanbanColumn[];
  currentColumnId?: string;
  onColumnChange?: (columnId: string) => void;
  /** People who can be assigned (board owner + members). Enables the assignee picker. */
  members?: BoardMember[];
  currentUserId?: string;
  /** Edit-lock state for an existing card (the dialog is read-only unless we hold it) */
  lockState?: CardLockState;
  onTakeOver?: () => void;
  /** Error from the last save attempt (e.g. the card was locked) */
  saveError?: string;
  /** The save failed because someone else saved first: offer to load their version */
  onReloadLatest?: () => void;
  /** Restore a previous version from the history panel */
  onRestoreVersion?: (version: number, latestVersion: number) => Promise<void>;
  /** Changes whenever the card's history changes (reloads the panel) */
  historyRefreshKey?: unknown;
  /** Status shown inside the dialog, e.g. "Restored version 3 · Undo" (toasts can't be clicked behind a modal) */
  notice?: { message: string; actionLabel?: string; onAction?: () => void };
}

export function CardDialog({
  open,
  onOpenChange,
  onSave,
  initialCard,
  cardId,
  columns,
  currentColumnId,
  onColumnChange,
  members,
  currentUserId,
  lockState,
  onTakeOver,
  saveError,
  onReloadLatest,
  onRestoreVersion,
  historyRefreshKey,
  notice,
}: CardDialogProps) {
  // Existing cards are editable only while we hold the edit lock. If the lock
  // service is unreachable ("error") we allow editing; the server still enforces on save.
  const readOnly =
    !!cardId &&
    !!lockState &&
    (lockState.status === "locked" || lockState.status === "lost" || lockState.status === "acquiring");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [assigneeId, setAssigneeId] = useState<string>("");

  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [addingComment, setAddingComment] = useState(false);

  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  // New tag creation
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [creatingTag, setCreatingTag] = useState(false);

  useEffect(() => {
    if (open) {
      // Load available tags
      fetchTags();

      // Set initial values
      setTitle(initialCard?.title || "");
      setNotes(initialCard?.notes || "");
      setDueDate(initialCard?.dueDate ? initialCard.dueDate.split('T')[0] : "");
      setPriority(initialCard?.priority || 'medium');
      setSelectedTagIds(initialCard?.tags?.map(t => t.id) || []);
      setAssigneeId(initialCard?.assigneeId || "");
      setShowActivity(false);
      setActivity([]);

      // Fetch comments when editing an existing card
      if (cardId) {
        fetchComments();
      } else {
        setComments([]);
        setNewComment("");
      }
    }
  }, [initialCard, open, cardId]);

  const fetchTags = async () => {
    setLoadingTags(true);
    try {
      const response = await fetch("/api/tags");
      if (response.ok) {
        const data = await response.json();
        setAvailableTags(data);
      }
    } catch (error) {
      console.error("Error fetching tags:", error);
    } finally {
      setLoadingTags(false);
    }
  };

  const fetchComments = async () => {
    if (!cardId) return;

    setLoadingComments(true);
    try {
      const response = await fetch(`/api/cards/${cardId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoadingComments(false);
    }
  };

  const fetchActivity = async () => {
    if (!cardId) return;
    setLoadingActivity(true);
    try {
      const response = await fetch(`/api/cards/${cardId}/activity`);
      if (response.ok) {
        setActivity(await response.json());
      }
    } catch (error) {
      console.error("Error fetching activity:", error);
    } finally {
      setLoadingActivity(false);
    }
  };

  const toggleActivity = () => {
    const next = !showActivity;
    setShowActivity(next);
    if (next) fetchActivity();
  };

  const handleAddComment = async () => {
    if (!cardId || !newComment.trim()) return;

    setAddingComment(true);
    try {
      const response = await fetch(`/api/cards/${cardId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (response.ok) {
        const comment = await response.json();
        setComments([...comments, comment]);
        setNewComment("");
      } else {
        const error = await response.json();
        console.error("Error adding comment:", error);
      }
    } catch (error) {
      console.error("Error adding comment:", error);
    } finally {
      setAddingComment(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (readOnly || saving) return;
    if (title.trim()) {
      setSaving(true);
      const result = await onSave({
        title: title.trim(),
        notes: notes.trim(),
        dueDate: dueDate || undefined,
        priority,
        tagIds: selectedTagIds,
        ...(members ? { assigneeId: assigneeId || null } : {}),
      });
      setSaving(false);
      // A failed save (e.g. someone else holds the lock) keeps the dialog and your edits
      if (result !== false) handleClose();
    }
  };

  const handleClose = () => {
    setTitle("");
    setNotes("");
    setDueDate("");
    setPriority('medium');
    setSelectedTagIds([]);
    setAssigneeId("");
    setComments([]);
    setNewComment("");
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter(id => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    setCreatingTag(true);
    try {
      const response = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor,
        }),
      });

      if (response.ok) {
        const newTag = await response.json();
        // Add to available tags
        setAvailableTags([...availableTags, newTag]);
        // Auto-select the new tag
        setSelectedTagIds([...selectedTagIds, newTag.id]);
        // Reset form
        setNewTagName("");
        setNewTagColor("#3b82f6");
        setShowNewTagInput(false);
      } else {
        const error = await response.json();
        console.error("Error creating tag:", error);
        alert(error.error || "Failed to create tag");
      }
    } catch (error) {
      console.error("Error creating tag:", error);
      alert("Failed to create tag");
    } finally {
      setCreatingTag(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700';
      default: return 'bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialCard ? "Edit Card" : "Create New Card"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {cardId && (lockState?.status === "locked" || lockState?.status === "lost") && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
              role="status"
              data-testid="card-lock-banner"
            >
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                {lockState.status === "locked" ? (
                  <>
                    <strong>{lockState.holder.name}</strong> is editing this card, so it's read-only for you. It
                    unlocks automatically when they're done; you can still comment.
                  </>
                ) : (
                  <>
                    {lockState.holder ? <strong>{lockState.holder.name}</strong> : "Someone else"} took over editing
                    this card. Your unsaved changes weren't saved.
                  </>
                )}
              </span>
              {lockState.status === "locked" && lockState.canTakeOver && onTakeOver && (
                <Button type="button" size="sm" variant="outline" onClick={onTakeOver}>
                  Take over editing
                </Button>
              )}
            </div>
          )}

          {notice && (
            <div
              className="flex flex-wrap items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-800 dark:text-green-300"
              role="status"
              data-testid="dialog-notice"
            >
              <span className="flex-1">{notice.message}</span>
              {notice.actionLabel && notice.onAction && (
                <Button type="button" size="sm" variant="outline" onClick={notice.onAction}>
                  {notice.actionLabel}
                </Button>
              )}
            </div>
          )}

          {saveError && (
            <div
              className="flex flex-wrap items-center gap-2 bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20"
              role="alert"
              data-testid="save-error"
            >
              <span className="flex-1">{saveError}</span>
              {onReloadLatest && (
                <Button type="button" size="sm" variant="outline" onClick={onReloadLatest}>
                  Load latest version
                </Button>
              )}
            </div>
          )}

          <fieldset disabled={readOnly} className="space-y-4 min-w-0 border-0 p-0 m-0" data-testid="card-fields">

          {/* Title */}
          <div className="space-y-2">
            <label htmlFor="title" className="text-sm font-medium text-foreground">
              Title
            </label>
            <Input
              id="title"
              placeholder="Enter card title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {/* Priority and Due Date Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div className="space-y-2">
              <label htmlFor="priority" className="text-sm font-medium text-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Priority
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                className="w-full px-3 py-2 border-2 border-border rounded-md bg-card text-foreground text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            {/* Due Date */}
            <div className="space-y-2">
              <label htmlFor="dueDate" className="text-sm font-medium text-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Due Date
              </label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Assignee */}
          {members && members.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="assignee" className="text-sm font-medium text-foreground flex items-center gap-1">
                <UserIcon className="h-3 w-3" />
                Assignee
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="assignee"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-border rounded-md bg-card text-foreground text-sm"
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}{m.id === currentUserId ? " (me)" : ""}
                    </option>
                  ))}
                  {/* Keep a former member visible if still assigned */}
                  {assigneeId && !members.some((m) => m.id === assigneeId) && initialCard?.assignee && (
                    <option value={assigneeId}>{initialCard.assignee.name} (no longer on board)</option>
                  )}
                </select>
                {currentUserId && assigneeId !== currentUserId && members.some((m) => m.id === currentUserId) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setAssigneeId(currentUserId)}
                  >
                    Assign to me
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Status - Only show when editing existing card */}
          {cardId && columns && columns.length > 0 && onColumnChange && (
            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium text-foreground flex items-center gap-1">
                <Columns className="h-3 w-3" />
                Status
              </label>
              <select
                id="status"
                value={currentColumnId || ''}
                onChange={(e) => onColumnChange(e.target.value)}
                className="w-full px-3 py-2 border-2 border-border rounded-md bg-card text-foreground text-sm"
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <TagIcon className="h-3 w-3" />
                Tags
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowNewTagInput(!showNewTagInput)}
                className="h-7 text-xs"
              >
                <Plus className="h-3 w-3 mr-1" />
                New Tag
              </Button>
            </div>

            {loadingTags ? (
              <p className="text-sm text-muted-foreground">Loading tags...</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        selectedTagIds.includes(tag.id)
                          ? 'ring-2 ring-offset-2 ring-offset-card'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: selectedTagIds.includes(tag.id) ? tag.color : `${tag.color}40`,
                        color: selectedTagIds.includes(tag.id) ? 'white' : tag.color,
                      }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>

                {/* New Tag Creation */}
                {showNewTagInput && (
                  <div className="border-2 border-border rounded-lg p-3 space-y-2 bg-muted">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Tag name..."
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        className="flex-1"
                        disabled={creatingTag}
                      />
                      <input
                        type="color"
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="w-12 h-9 rounded border-2 border-border cursor-pointer"
                        title="Choose tag color"
                        disabled={creatingTag}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleCreateTag}
                        disabled={!newTagName.trim() || creatingTag}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                      >
                        {creatingTag ? "Creating..." : "Create Tag"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowNewTagInput(false);
                          setNewTagName("");
                          setNewTagColor("#3b82f6");
                        }}
                        disabled={creatingTag}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label htmlFor="notes" className="text-sm font-medium text-foreground">
              Notes
            </label>
            <Textarea
              id="notes"
              placeholder="Add notes or description..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
            />
          </div>

          </fieldset>

          {/* Comments Section - Only show when editing existing card (allowed even while locked) */}
          {cardId && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Comments ({comments.length})</span>
              </div>

              {loadingComments ? (
                <div className="text-sm text-muted-foreground py-2">
                  Loading comments...
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="bg-muted rounded-lg p-3 space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        {comment.author && <UserAvatar user={comment.author} size="xs" />}
                        <span className="text-xs font-medium text-foreground">
                          {comment.author?.name ?? "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">
                  No comments yet
                </p>
              )}

              {/* Add Comment */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  disabled={addingComment}
                />
                <Button
                  size="sm"
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || addingComment}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Send className="h-3 w-3 mr-1" />
                  {addingComment ? "Adding..." : "Add Comment"}
                </Button>
              </div>
            </div>
          )}

          {/* Activity (audit trail) - Only for existing cards */}
          {cardId && (
            <div className="space-y-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={toggleActivity}
                className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
                aria-expanded={showActivity}
              >
                <History className="h-4 w-4" />
                {showActivity ? "Hide activity" : "Show activity"}
              </button>
              {showActivity && (
                loadingActivity ? (
                  <p className="text-sm text-muted-foreground">Loading activity...</p>
                ) : activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                ) : (
                  <ol className="space-y-2 max-h-48 overflow-y-auto border-l-2 border-border pl-3">
                    {activity.map((entry) => (
                      <li key={entry.id} className="text-xs">
                        <span className="text-foreground">{entry.summary}</span>
                        <span className="block text-muted-foreground">
                          {entry.actorEmail ?? "system"} · {formatDate(entry.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )
              )}
            </div>
          )}

          {/* Edit history with restore */}
          {cardId && onRestoreVersion && (
            <CardHistory
              cardId={cardId}
              members={members ?? []}
              readOnly={readOnly}
              refreshKey={historyRefreshKey}
              onRestore={onRestoreVersion}
            />
          )}

          <p className="text-xs text-muted-foreground">
            Press Cmd/Ctrl + Enter to save card
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim() || readOnly || saving}
          >
            {initialCard ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
