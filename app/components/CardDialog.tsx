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
import type { Comment } from "~/lib/types";
import { MessageSquare, Send } from "lucide-react";

interface CardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (title: string, notes: string) => void;
  initialTitle?: string;
  initialNotes?: string;
  cardId?: string;
}

export function CardDialog({
  open,
  onOpenChange,
  onSave,
  initialTitle = "",
  initialNotes = "",
  cardId,
}: CardDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [addingComment, setAddingComment] = useState(false);

  useEffect(() => {
    setTitle(initialTitle);
    setNotes(initialNotes);

    // Fetch comments when editing an existing card
    if (open && cardId) {
      fetchComments();
    } else {
      setComments([]);
      setNewComment("");
    }
  }, [initialTitle, initialNotes, open, cardId]);

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
      onSave(title.trim(), notes.trim());
      setTitle("");
      setNotes("");
      setComments([]);
      setNewComment("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialTitle ? "Edit Card" : "Create New Card"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label
              htmlFor="title"
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
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
          <div className="space-y-2">
            <label
              htmlFor="notes"
              className="text-sm font-medium text-gray-900 dark:text-gray-100"
            >
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
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                <MessageSquare className="h-4 w-4" />
                <span>Comments ({comments.length})</span>
              </div>

              {loadingComments ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-2">
                  Loading comments...
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-1"
                    >
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {comment.content}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(comment.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
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
                  className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white"
                >
                  <Send className="h-3 w-3 mr-1" />
                  {addingComment ? "Adding..." : "Add Comment"}
                </Button>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Press Cmd/Ctrl + Enter to save card
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!title.trim()}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
          >
            {initialTitle ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
