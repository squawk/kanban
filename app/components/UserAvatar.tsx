import type { UserSummary } from "~/lib/types";
import { cn } from "~/lib/utils";

const PALETTE = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#4f46e5", "#b45309"];

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function UserAvatar({
  user,
  size = "sm",
  className,
}: {
  user: UserSummary;
  size?: "xs" | "sm" | "md";
  className?: string;
}) {
  const sizes = { xs: "h-5 w-5 text-[9px]", sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-card",
        sizes[size],
        className
      )}
      style={{ backgroundColor: colorFor(user.id) }}
      title={`${user.name} (${user.email})`}
      aria-label={user.name}
    >
      {initials(user.name)}
    </span>
  );
}
