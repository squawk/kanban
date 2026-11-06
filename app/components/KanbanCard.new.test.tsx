import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KanbanCard } from "./KanbanCard";
import type { KanbanCard as KanbanCardType } from "~/lib/types";
import { DndContext } from "@dnd-kit/core";

// Wrapper for drag-and-drop context
const DndWrapper = ({ children }: { children: React.ReactNode }) => (
  <DndContext>{children}</DndContext>
);

/**
 * Due dates are stored as calendar dates at UTC midnight ("2024-12-25T00:00:00.000Z")
 * and KanbanCard reads the date part as a local calendar date. Build test dates the
 * same way, so they don't shift a day depending on the runner's timezone.
 */
function dueDateInDays(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: d,
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00.000Z`,
  };
}

describe("KanbanCard with Tags, Priority, and Due Date", () => {
  const mockCard: KanbanCardType = {
    id: "card-1",
    title: "Test Task",
    notes: "Test notes",
    priority: "medium",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
  };

  const mockHandlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onGeneratePrompt: vi.fn(),
  };

  it("should render card with basic information", () => {
    render(
      <DndWrapper>
        <KanbanCard card={mockCard} {...mockHandlers} />
      </DndWrapper>
    );

    expect(screen.getByText("Test Task")).toBeInTheDocument();
    expect(screen.getByText("Test notes")).toBeInTheDocument();
  });

  it("should display priority with colored border", () => {
    const highPriorityCard = { ...mockCard, priority: "high" as const };

    const { container } = render(
      <DndWrapper>
        <KanbanCard card={highPriorityCard} {...mockHandlers} />
      </DndWrapper>
    );

    // Priority colors use theme tokens (so they work in both themes): high = destructive
    const cardElement = container.querySelector('[class*="border-l-destructive"]');
    expect(cardElement).toBeInTheDocument();
  });

  it("should display tags as colored badges", () => {
    const cardWithTags: KanbanCardType = {
      ...mockCard,
      tags: [
        { id: "tag-1", name: "Bug", color: "#ef4444", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        { id: "tag-2", name: "Urgent", color: "#f59e0b", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ],
    };

    render(
      <DndWrapper>
        <KanbanCard card={cardWithTags} {...mockHandlers} />
      </DndWrapper>
    );

    expect(screen.getByText("Bug")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();

    const bugBadge = screen.getByText("Bug");
    expect(bugBadge).toHaveStyle({ backgroundColor: "#ef4444" });
  });

  it("should display due date", () => {
    const cardWithDueDate: KanbanCardType = {
      ...mockCard,
      dueDate: "2024-12-25T00:00:00.000Z",
    };

    render(
      <DndWrapper>
        <KanbanCard card={cardWithDueDate} {...mockHandlers} />
      </DndWrapper>
    );

    expect(screen.getByText("Dec 25")).toBeInTheDocument();
  });

  it("should highlight overdue dates in the destructive (red) color", () => {
    const overdueCard: KanbanCardType = {
      ...mockCard,
      dueDate: dueDateInDays(-1).iso,
    };

    render(
      <DndWrapper>
        <KanbanCard card={overdueCard} {...mockHandlers} />
      </DndWrapper>
    );

    const dueDateElement = screen.getByTitle("Overdue!");
    expect(dueDateElement).toHaveClass("text-destructive");
  });

  it("should highlight today's due dates in the primary (accent) color", () => {
    const todayCard: KanbanCardType = {
      ...mockCard,
      dueDate: dueDateInDays(0).iso,
    };

    render(
      <DndWrapper>
        <KanbanCard card={todayCard} {...mockHandlers} />
      </DndWrapper>
    );

    const dueDateElement = screen.getByTitle("Due today");
    expect(dueDateElement).toHaveClass("text-primary");
    expect(dueDateElement).not.toHaveClass("text-destructive");
  });

  it("should not highlight future due dates", () => {
    const futureCard: KanbanCardType = {
      ...mockCard,
      dueDate: dueDateInDays(3).iso,
    };

    render(
      <DndWrapper>
        <KanbanCard card={futureCard} {...mockHandlers} />
      </DndWrapper>
    );

    const dueDateElement = screen.getByTitle("Due date");
    expect(dueDateElement).not.toHaveClass("text-destructive");
    expect(dueDateElement).not.toHaveClass("text-primary");
  });

  it("should display comment count when present", () => {
    const cardWithComments: KanbanCardType = {
      ...mockCard,
      comments: [
        { id: "c1", content: "Comment 1", cardId: "card-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
        { id: "c2", content: "Comment 2", cardId: "card-1", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ],
    };

    render(
      <DndWrapper>
        <KanbanCard card={cardWithComments} {...mockHandlers} />
      </DndWrapper>
    );

    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("should show all priority indicators correctly", () => {
    const priorities: Array<"low" | "medium" | "high"> = ["low", "medium", "high"];
    const borderClasses = ["border-l-muted", "border-l-primary", "border-l-destructive"];

    priorities.forEach((priority, index) => {
      const card = { ...mockCard, priority };
      const { container, unmount } = render(
        <DndWrapper>
          <KanbanCard card={card} {...mockHandlers} />
        </DndWrapper>
      );

      const cardElement = container.querySelector(`[class*="${borderClasses[index]}"]`);
      expect(cardElement).toBeInTheDocument();
      // Exactly one priority color per card
      borderClasses
        .filter((_, i) => i !== index)
        .forEach((other) => expect(container.querySelector(`[class*="${other}"]`)).toBeNull());
      unmount();
    });
  });

  it("should render complete card with all features", () => {
    const { iso: tomorrowIso } = dueDateInDays(1);

    const fullCard: KanbanCardType = {
      id: "card-full",
      title: "Complete Task",
      notes: "Full task with everything",
      priority: "high",
      dueDate: tomorrowIso,
      tags: [
        { id: "tag-1", name: "Feature", color: "#3b82f6", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ],
      comments: [
        { id: "c1", content: "A comment", cardId: "card-full", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
      ],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };

    render(
      <DndWrapper>
        <KanbanCard card={fullCard} {...mockHandlers} />
      </DndWrapper>
    );

    // Check all elements are present
    expect(screen.getByText("Complete Task")).toBeInTheDocument();
    expect(screen.getByText("Full task with everything")).toBeInTheDocument();
    expect(screen.getByText("Feature")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // comment count

    // A due date of tomorrow reads "Tomorrow"
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });
});

describe("KanbanCard assigned to someone else", () => {
  const base: KanbanCardType = { id: "c", title: "T", notes: "", priority: "medium", createdAt: "2024-01-01", updatedAt: "2024-01-01" };
  const handlers = { onEdit: vi.fn(), onDelete: vi.fn(), onGeneratePrompt: vi.fn() };
  const renderCard = (card: KanbanCardType, currentUserId?: string) =>
    render(<DndWrapper><KanbanCard card={card} {...handlers} currentUserId={currentUserId} /></DndWrapper>);

  it("is dimmed when assigned to another person", () => {
    const { container } = renderCard({ ...base, assigneeId: "luke" }, "brad");
    expect(container.querySelector("[data-assigned-to-other]")).not.toBeNull();
  });

  it("is not dimmed when it's yours or unassigned", () => {
    expect(renderCard({ ...base, assigneeId: "brad" }, "brad").container.querySelector("[data-assigned-to-other]")).toBeNull();
    expect(renderCard(base, "brad").container.querySelector("[data-assigned-to-other]")).toBeNull();
  });
});

describe("KanbanCard click", () => {
  it("opens the card when clicked", async () => {
    const { default: userEventLib } = await import("@testing-library/user-event");
    const onEdit = vi.fn();
    const c = { id: "k1", title: "Click me", notes: "", priority: "medium" as const, createdAt: "", updatedAt: "" };
    const { PointerSensor, useSensor, useSensors } = await import("@dnd-kit/core");
    // Same as the board: a drag only starts after 8px of movement, so a click stays a click
    function BoardDnd({ children }: { children: React.ReactNode }) {
      const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
      return <DndContext sensors={sensors}>{children}</DndContext>;
    }
    render(
      <BoardDnd>
        <KanbanCard card={c} onEdit={onEdit} onDelete={vi.fn()} onGeneratePrompt={vi.fn()} />
      </BoardDnd>
    );
    await userEventLib.setup().click(screen.getByText("Click me"));
    expect(onEdit).toHaveBeenCalledWith(c);
  });
});
