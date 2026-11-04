import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { UserAvatar } from "./UserAvatar";
import type { CurrentUser } from "~/lib/types";
import { apiFetch } from "~/lib/api";

interface AccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: CurrentUser;
  onUserChange: (user: CurrentUser) => void;
}

export function AccountDialog({ open, onOpenChange, user, onUserChange }: AccountDialogProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleNotifications = async (enabled: boolean) => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: enabled }),
      });
      if (!res.ok) {
        setError((await res.json()).error || "Couldn't save your preference");
        return;
      }
      onUserChange({ ...user, emailNotifications: enabled });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription>Your profile and notification preferences.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size="md" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{user.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{user.role}</span>
        </div>
        <label className="flex items-start gap-3 rounded-lg border-2 border-border p-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={user.emailNotifications}
            disabled={saving}
            onChange={(e) => toggleNotifications(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-foreground">Email notifications</span>
            <span className="block text-xs text-muted-foreground">
              Get an email when someone assigns you a card, comments on or moves a card you created or are assigned
              to, or shares a board with you.
            </span>
          </span>
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
