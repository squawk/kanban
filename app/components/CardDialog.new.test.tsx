import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDialog } from "./CardDialog";
import type { KanbanCard, Tag } from "~/lib/types";

// Mock fetch
global.fetch = vi.fn();

const mockTags: Tag[] = [
  { id: "tag-1", name: "Bug", color: "#ef4444", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
  { id: "tag-2", name: "Feature", color: "#3b82f6", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
  { id: "tag-3", name: "Urgent", color: "#f59e0b", createdAt: "2024-01-01", updatedAt: "2024-01-01" },
];

describe("CardDialog with Tags, Priority, and Due Date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock tags fetch
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockTags,
    });
  });

  it("should load and display available tags", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Bug")).toBeInTheDocument();
      expect(screen.getByText("Feature")).toBeInTheDocument();
      expect(screen.getByText("Urgent")).toBeInTheDocument();
    });
  });

  it("should allow selecting and deselecting tags", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Bug")).toBeInTheDocument();
    });

    const bugTag = screen.getByText("Bug");

    // Click to select
    await user.click(bugTag);
    expect(bugTag.closest("button")).toHaveClass("ring-2");

    // Click again to deselect
    await user.click(bugTag);
    expect(bugTag.closest("button")).not.toHaveClass("ring-2");
  });

  it("should show priority dropdown with default value", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    const prioritySelect = screen.getByLabelText(/Priority/i);
    expect(prioritySelect).toHaveValue("medium");
  });

  it("should show due date picker", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    const dueDateInput = screen.getByLabelText(/Due Date/i);
    expect(dueDateInput).toBeInTheDocument();
    expect(dueDateInput).toHaveAttribute("type", "date");
  });

  it("should populate fields when editing existing card", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    const existingCard: KanbanCard = {
      id: "card-1",
      title: "Test Card",
      notes: "Test notes",
      priority: "high",
      dueDate: "2024-12-25T00:00:00.000Z",
      tags: [mockTags[0], mockTags[2]], // Bug and Urgent
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
        initialCard={existingCard}
        cardId={existingCard.id}
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Test Card")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test notes")).toBeInTheDocument();
    });

    const prioritySelect = screen.getByLabelText(/Priority/i);
    expect(prioritySelect).toHaveValue("high");

    const dueDateInput = screen.getByLabelText(/Due Date/i);
    expect(dueDateInput).toHaveValue("2024-12-25");
  });

  it("should call onSave with all new fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Bug")).toBeInTheDocument();
    });

    // Fill in title
    const titleInput = screen.getByPlaceholderText("Enter card title...");
    await user.type(titleInput, "New Task");

    // Select priority
    const prioritySelect = screen.getByLabelText(/Priority/i);
    await user.selectOptions(prioritySelect, "high");

    // Set due date
    const dueDateInput = screen.getByLabelText(/Due Date/i);
    await user.type(dueDateInput, "2024-12-31");

    // Select tags
    const bugTag = screen.getByText("Bug");
    await user.click(bugTag);

    const featureTag = screen.getByText("Feature");
    await user.click(featureTag);

    // Submit
    const createButton = screen.getByText("Create");
    await user.click(createButton);

    expect(onSave).toHaveBeenCalledWith({
      title: "New Task",
      notes: "",
      priority: "high",
      dueDate: "2024-12-31",
      tagIds: ["tag-1", "tag-2"],
    });
  });

  it("should show comments section only for existing cards", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    // New card - no comments section
    const { rerender } = render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    expect(screen.queryByText(/Comments/i)).not.toBeInTheDocument();

    // Existing card - should show comments
    const existingCard: KanbanCard = {
      id: "card-1",
      title: "Test",
      notes: "",
      priority: "medium",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    };

    // Mock comments fetch
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockTags,
    }).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    rerender(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
        initialCard={existingCard}
        cardId="card-1"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Comments \(0\)/i)).toBeInTheDocument();
    });
  });

  it("should handle tag loading errors", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (global.fetch as any).mockRejectedValue(new Error("Network error"));

    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={onSave}
      />
    );

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    consoleErrorSpy.mockRestore();
  });
});
