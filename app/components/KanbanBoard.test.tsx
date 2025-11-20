import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "./KanbanBoard";

// Mock fetch for API calls
global.fetch = vi.fn();

const mockBoard = {
  columns: [
    { id: "todo", title: "TODO", cardIds: [], position: 0 },
    { id: "in-progress", title: "In Progress", cardIds: [], position: 1 },
    { id: "completed", title: "Completed", cardIds: [], position: 2 },
  ],
  cards: {},
};

describe("KanbanBoard Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the initial board fetch
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockBoard,
    });
  });

  it("should render with default columns after loading", async () => {
    render(<KanbanBoard />);

    // Should show loading state first
    expect(screen.getByText("Loading your kanban board...")).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText("TODO")).toBeInTheDocument();
    });

    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("should display the app title", async () => {
    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("Vibe Coding Kanban")).toBeInTheDocument();
    });

    expect(screen.getByText("Organize your projects with style")).toBeInTheDocument();
  });

  it("should have Add Column button", async () => {
    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("Add Column")).toBeInTheDocument();
    });
  });

  it("should open CardDialog when Add Card is clicked", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("TODO")).toBeInTheDocument();
    });

    const addCardButtons = screen.getAllByText("Add Card");
    await user.click(addCardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Create New Card")).toBeInTheDocument();
    });
  });

  it("should create a new card via API", async () => {
    const user = userEvent.setup();

    // Mock successful card creation
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBoard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "card-1",
          title: "Test Task",
          notes: "This is a test task",
          boardId: "board-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: [
            { id: "todo", title: "TODO", cardIds: ["card-1"], position: 0 },
            { id: "in-progress", title: "In Progress", cardIds: [], position: 1 },
            { id: "completed", title: "Completed", cardIds: [], position: 2 },
          ],
          cards: {
            "card-1": {
              id: "card-1",
              title: "Test Task",
              notes: "This is a test task",
              boardId: "board-1",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        }),
      });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("TODO")).toBeInTheDocument();
    });

    // Click Add Card in TODO column
    const addCardButtons = screen.getAllByText("Add Card");
    await user.click(addCardButtons[0]);

    // Fill in card details
    await waitFor(() => {
      expect(screen.getByText("Create New Card")).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText("Enter card title...");
    const notesInput = screen.getByPlaceholderText("Add notes or description...");

    await user.type(titleInput, "Test Task");
    await user.type(notesInput, "This is a test task");

    // Click Create
    const createButton = screen.getByText("Create");
    await user.click(createButton);

    // Card should appear in TODO column
    await waitFor(() => {
      expect(screen.getByText("Test Task")).toBeInTheDocument();
      expect(screen.getByText("This is a test task")).toBeInTheDocument();
    });

    // Verify API was called
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/cards",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Task",
          notes: "This is a test task",
          columnId: "todo",
        }),
      })
    );
  });

  it("should open ColumnDialog when Add Column is clicked", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("Add Column")).toBeInTheDocument();
    });

    const addColumnButton = screen.getByText("Add Column");
    await user.click(addColumnButton);

    await waitFor(() => {
      expect(screen.getByText("Create New Column")).toBeInTheDocument();
    });
  });

  it("should create a new column via API", async () => {
    const user = userEvent.setup();

    // Mock successful column creation
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockBoard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "testing",
          title: "Testing",
          position: 3,
          boardId: "board-1",
          cardIds: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          columns: [
            ...mockBoard.columns,
            { id: "testing", title: "Testing", cardIds: [], position: 3 },
          ],
          cards: {},
        }),
      });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("Add Column")).toBeInTheDocument();
    });

    // Click Add Column
    const addColumnButton = screen.getByText("Add Column");
    await user.click(addColumnButton);

    // Fill in column title
    await waitFor(() => {
      expect(screen.getByText("Create New Column")).toBeInTheDocument();
    });

    const columnInput = screen.getByPlaceholderText("Enter column title...");
    await user.type(columnInput, "Testing");

    // Click Create
    const createButton = screen.getByText("Create");
    await user.click(createButton);

    // Column should appear
    await waitFor(() => {
      expect(screen.getByText("Testing")).toBeInTheDocument();
    });

    // Verify API was called
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/columns",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Testing" }),
      })
    );
  });

  it("should fetch board from database on mount", async () => {
    render(<KanbanBoard />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/board");
    });

    await waitFor(() => {
      expect(screen.getByText("TODO")).toBeInTheDocument();
    });
  });

  it("should handle board fetch error gracefully", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to fetch board");
    });

    consoleErrorSpy.mockRestore();
  });

  it("should handle AI prompt generation", async () => {
    const user = userEvent.setup();

    // Mock board with a card
    const boardWithCard = {
      columns: [
        { id: "todo", title: "TODO", cardIds: ["card-1"], position: 0 },
        { id: "in-progress", title: "In Progress", cardIds: [], position: 1 },
        { id: "completed", title: "Completed", cardIds: [], position: 2 },
      ],
      cards: {
        "card-1": {
          id: "card-1",
          title: "Feature Request",
          notes: "Add dark mode",
          boardId: "board-1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    };

    // Mock initial fetch
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => boardWithCard,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          prompt: "Generated prompt for testing",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...boardWithCard.cards["card-1"],
          generatedPrompt: "Generated prompt for testing",
        }),
      });

    render(<KanbanBoard />);

    // Wait for card to be rendered
    await waitFor(() => {
      expect(screen.getByText("Feature Request")).toBeInTheDocument();
    });

    // Find and click AI button
    const aiButton = screen.getByLabelText("Generate AI prompt");
    await user.click(aiButton);

    // Wait for prompt to appear
    await waitFor(() => {
      expect(screen.getByText("Generated prompt for testing")).toBeInTheDocument();
    });

    // Verify API was called
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/generate-prompt",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Feature Request",
          notes: "Add dark mode",
        }),
      })
    );
  });

  it("should handle AI prompt generation error", async () => {
    const user = userEvent.setup();

    // Mock board with a card
    const boardWithCard = {
      columns: [
        { id: "todo", title: "TODO", cardIds: ["card-1"], position: 0 },
        { id: "in-progress", title: "In Progress", cardIds: [], position: 1 },
        { id: "completed", title: "Completed", cardIds: [], position: 2 },
      ],
      cards: {
        "card-1": {
          id: "card-1",
          title: "Test Card",
          notes: "Test",
          boardId: "board-1",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    };

    // Mock API error
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => boardWithCard,
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "API key not configured",
        }),
      });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("Test Card")).toBeInTheDocument();
    });

    const aiButton = screen.getByLabelText("Generate AI prompt");
    await user.click(aiButton);

    await waitFor(() => {
      expect(screen.getByText("API key not configured")).toBeInTheDocument();
    });
  });
});
