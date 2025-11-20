import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "./KanbanBoard";

// Mock fetch for API calls
global.fetch = vi.fn();

describe("KanbanBoard Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("should render with default columns", () => {
    render(<KanbanBoard />);

    expect(screen.getByText("TODO")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("should display the app title", () => {
    render(<KanbanBoard />);

    expect(screen.getByText("Vibe Coding Kanban")).toBeInTheDocument();
    expect(screen.getByText("Organize your projects with style")).toBeInTheDocument();
  });

  it("should have Add Column button", () => {
    render(<KanbanBoard />);

    expect(screen.getByText("Add Column")).toBeInTheDocument();
  });

  it("should open CardDialog when Add Card is clicked", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    const addCardButtons = screen.getAllByText("Add Card");
    await user.click(addCardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Create New Card")).toBeInTheDocument();
    });
  });

  it("should create a new card", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

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
  });

  it("should open ColumnDialog when Add Column is clicked", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    const addColumnButton = screen.getByText("Add Column");
    await user.click(addColumnButton);

    await waitFor(() => {
      expect(screen.getByText("Create New Column")).toBeInTheDocument();
    });
  });

  it("should create a new column", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

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
  });

  it("should persist board to localStorage", async () => {
    const user = userEvent.setup();
    render(<KanbanBoard />);

    // Add a card
    const addCardButtons = screen.getAllByText("Add Card");
    await user.click(addCardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Create New Card")).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText("Enter card title...");
    await user.type(titleInput, "Persistent Task");

    const createButton = screen.getByText("Create");
    await user.click(createButton);

    // Wait for card to appear
    await waitFor(() => {
      expect(screen.getByText("Persistent Task")).toBeInTheDocument();
    });

    // Check localStorage
    const stored = localStorage.getItem("kanban-board");
    expect(stored).toBeTruthy();

    const board = JSON.parse(stored!);
    expect(Object.values(board.cards).some((card: any) => card.title === "Persistent Task")).toBe(true);
  });

  it("should load board from localStorage", () => {
    // Pre-populate localStorage
    const board = {
      columns: [
        { id: "todo", title: "TODO", cardIds: ["card-1"] },
        { id: "in-progress", title: "In Progress", cardIds: [] },
        { id: "completed", title: "Completed", cardIds: [] },
      ],
      cards: {
        "card-1": {
          id: "card-1",
          title: "Loaded Card",
          notes: "From storage",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    };

    localStorage.setItem("kanban-board", JSON.stringify(board));

    render(<KanbanBoard />);

    expect(screen.getByText("Loaded Card")).toBeInTheDocument();
    expect(screen.getByText("From storage")).toBeInTheDocument();
  });

  it("should handle AI prompt generation", async () => {
    const user = userEvent.setup();

    // Mock successful API response
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        prompt: "Generated prompt for testing",
      }),
    });

    // Pre-populate with a card
    const board = {
      columns: [
        { id: "todo", title: "TODO", cardIds: ["card-1"] },
        { id: "in-progress", title: "In Progress", cardIds: [] },
        { id: "completed", title: "Completed", cardIds: [] },
      ],
      cards: {
        "card-1": {
          id: "card-1",
          title: "Feature Request",
          notes: "Add dark mode",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    };

    localStorage.setItem("kanban-board", JSON.stringify(board));

    render(<KanbanBoard />);

    // Wait for card to be rendered
    await waitFor(
      () => {
        expect(screen.getByText("Feature Request")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Find and click AI button directly
    const aiButton = screen.getByLabelText("Generate AI prompt");
    await user.click(aiButton);

    // Wait for prompt to appear (skip loading check for speed)
    await waitFor(
      () => {
        expect(screen.getByText("Generated prompt for testing")).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("should handle AI prompt generation error", async () => {
    const user = userEvent.setup();

    // Mock API error
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "API key not configured",
      }),
    });

    // Pre-populate with a card
    const board = {
      columns: [
        { id: "todo", title: "TODO", cardIds: ["card-1"] },
        { id: "in-progress", title: "In Progress", cardIds: [] },
        { id: "completed", title: "Completed", cardIds: [] },
      ],
      cards: {
        "card-1": {
          id: "card-1",
          title: "Test Card",
          notes: "Test",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
        },
      },
    };

    localStorage.setItem("kanban-board", JSON.stringify(board));

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByText("Test Card")).toBeInTheDocument();
    });

    const card = screen.getByText("Test Card").closest(".group");
    const aiButton = card!.querySelector('[aria-label="Generate AI prompt"]');

    await user.click(aiButton!);

    await waitFor(() => {
      expect(screen.getByText("API key not configured")).toBeInTheDocument();
    });
  });
});
