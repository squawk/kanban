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

interface CardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (title: string, notes: string) => void;
  initialTitle?: string;
  initialNotes?: string;
}

export function CardDialog({
  open,
  onOpenChange,
  onSave,
  initialTitle = "",
  initialNotes = "",
}: CardDialogProps) {
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState(initialNotes);

  useEffect(() => {
    setTitle(initialTitle);
    setNotes(initialNotes);
  }, [initialTitle, initialNotes, open]);

  const handleSave = () => {
    if (title.trim()) {
      onSave(title.trim(), notes.trim());
      setTitle("");
      setNotes("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      handleSave();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
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
              rows={5}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Press Cmd/Ctrl + Enter to save
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
