import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDialog } from "./CardDialog";
import type { BoardMember, KanbanCard } from "~/lib/types";

global.fetch = vi.fn();

const members: BoardMember[] = [
  { id: "me", name: "Brad", email: "brad@example.com", boardRole: "owner" },
  { id: "bob", name: "Bob", email: "bob@example.com", boardRole: "member" },
];

const existing = (createdById: string, extra: Partial<KanbanCard> = {}): KanbanCard => ({
  id: "c1",
  title: "Existing",
  notes: "",
  priority: "medium",
  createdBy: { id: createdById, name: "Someone", email: "x@example.com" },
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  ...extra,
});

describe("CardDialog private toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => [] } as Response);
  });

  it("creates a private card and drops the assignee picker", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<CardDialog open onOpenChange={vi.fn()} onSave={onSave} members={members} currentUserId="me" />);

    await user.type(screen.getByLabelText(/Title/i), "Gift ideas");
    expect(screen.getByLabelText(/Assignee/i)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/Assignee/i), "bob");

    const toggle = screen.getByTestId("card-private-toggle");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByLabelText(/Assignee/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: "Gift ideas", isPrivate: true, assigneeId: null }));
  });

  it("lets the creator change it, and nobody else", () => {
    const { rerender } = render(
      <CardDialog open onOpenChange={vi.fn()} onSave={vi.fn()} cardId="c1" initialCard={existing("me", { isPrivate: true })} currentUserId="me" />
    );
    expect(screen.getByTestId("card-private-toggle")).toHaveAttribute("aria-checked", "true");

    rerender(<CardDialog open onOpenChange={vi.fn()} onSave={vi.fn()} cardId="c1" initialCard={existing("bob")} currentUserId="me" />);
    expect(screen.queryByTestId("card-private-toggle")).not.toBeInTheDocument();
  });
});
