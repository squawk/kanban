import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KanbanCard } from "./KanbanCard";
import type { KanbanCard as KanbanCardType } from "~/lib/types";
import { DndContext } from "@dnd-kit/core";

// Wrapper for drag-and-drop context
const DndWrapper = ({ children }: { children: React.ReactNode }) => (
  <DndContext>{children}</DndContext>
);

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

    const cardElement = container.querySelector('[class*="border-l-red"]');
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

  it("should highlight overdue dates in red", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const overdueCard: KanbanCardType = {
      ...mockCard,
      dueDate: yesterday.toISOString(),
    };

    const { container } = render(
      <DndWrapper>
        <KanbanCard card={overdueCard} {...mockHandlers} />
      </DndWrapper>
    );

    const dueDateElement = container.querySelector('[class*="text-red"]');
    expect(dueDateElement).toBeInTheDocument();
  });

  it("should highlight today's due dates in orange", () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCard: KanbanCardType = {
      ...mockCard,
      dueDate: today.toISOString(),
    };

    const { container } = render(
      <DndWrapper>
        <KanbanCard card={todayCard} {...mockHandlers} />
      </DndWrapper>
    );

    const dueDateElement = container.querySelector('[class*="text-orange"]');
    expect(dueDateElement).toBeInTheDocument();
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
    const borderClasses = ["border-l-blue", "border-l-yellow", "border-l-red"];

    priorities.forEach((priority, index) => {
      const card = { ...mockCard, priority };
      const { container } = render(
        <DndWrapper>
          <KanbanCard card={card} {...mockHandlers} />
        </DndWrapper>
      );

      const cardElement = container.querySelector(`[class*="${borderClasses[index]}"]`);
      expect(cardElement).toBeInTheDocument();
    });
  });

  it("should render complete card with all features", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const fullCard: KanbanCardType = {
      id: "card-full",
      title: "Complete Task",
      notes: "Full task with everything",
      priority: "high",
      dueDate: tomorrow.toISOString(),
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

    // Check due date is displayed (should be tomorrow's date)
    const dueDateText = tomorrow.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    expect(screen.getByText(dueDateText)).toBeInTheDocument();
  });
});
