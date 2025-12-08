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
import type { Comment, Tag, KanbanCard, KanbanColumn } from "~/lib/types";
import { MessageSquare, Send, Calendar, Tag as TagIcon, AlertCircle, Plus, Columns } from "lucide-react";

interface CardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    title: string;
    notes: string;
    dueDate?: string;
    priority: 'low' | 'medium' | 'high';
    tagIds: string[];
  }) => void;
  initialCard?: KanbanCard;
  cardId?: string;
  columns?: KanbanColumn[];
  currentColumnId?: string;
  onColumnChange?: (columnId: string) => void;
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
}: CardDialogProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

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

  const handleSave = () => {
    if (title.trim()) {
      onSave({
        title: title.trim(),
        notes: notes.trim(),
        dueDate: dueDate || undefined,
        priority,
        tagIds: selectedTagIds,
      });
      handleClose();
    }
  };

  const handleClose = () => {
    setTitle("");
    setNotes("");
    setDueDate("");
    setPriority('medium');
    setSelectedTagIds([]);
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

          {/* Comments Section - Only show when editing existing card */}
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
                      <p className="text-sm text-foreground">
                        {comment.content}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(comment.createdAt)}
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
            disabled={!title.trim()}
          >
            {initialCard ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
