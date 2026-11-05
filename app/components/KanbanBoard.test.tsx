import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "./KanbanBoard";
import type { KanbanBoard as KanbanBoardType } from "~/lib/types";

// Mock fetch for API calls
global.fetch = vi.fn();

const mockBoard: KanbanBoardType = {
  columns: [
    { id: "todo", title: "TODO", cardIds: [] },
    { id: "in-progress", title: "In Progress", cardIds: [] },
    { id: "completed", title: "Completed", cardIds: [] },
  ],
  cards: {},
};

type MockResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
type Handler = (init?: RequestInit) => MockResponse | Promise<MockResponse>;

const json = (body: unknown, status = 200): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/**
 * Route fetch calls by "METHOD /path" instead of call order: on mount the board
 * loads /api/board and /api/archived-cards, and CardDialog loads /api/tags, so
 * `mockResolvedValueOnce` chains end up answering the wrong request.
 * Unrouted requests get a 404 so a missing mock fails loudly instead of silently.
 */
function mockApi(routes: Record<string, Handler> = {}) {
  const defaults: Record<string, Handler> = {
    "GET /api/board": () => json(mockBoard),
    "GET /api/archived-cards": () => json([]),
    "GET /api/tags": () => json([]),
  };
  const table = { ...defaults, ...routes };
  vi.mocked(global.fetch).mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const path = url.split("?")[0];
    const key = `${(init?.method ?? "GET").toUpperCase()} ${path}`;
    const handler = table[key];
    return (handler ? await handler(init) : json({ error: `Unmocked ${key}` }, 404)) as unknown as Response;
  });
}

/** Parsed JSON body of the first fetch call matching method + path */
function requestBody(method: string, path: string) {
  const call = vi
    .mocked(global.fetch)
    .mock.calls.find(([url, init]) => url === path && (init?.method ?? "GET") === method);
  expect(call, `${method} ${path} was not called`).toBeDefined();
  return JSON.parse(String(call![1]!.body));
}

const boardWithCard = (title: string, notes: string): KanbanBoardType => ({
  columns: [
    { id: "todo", title: "TODO", cardIds: ["card-1"] },
    { id: "in-progress", title: "In Progress", cardIds: [] },
    { id: "completed", title: "Completed", cardIds: [] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title,
      notes,
      priority: "medium",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
    },
  },
});

describe("KanbanBoard Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi();
  });

  it("should render with default columns after loading", async () => {
    render(<KanbanBoard />);

    // Should show loading state first
    expect(screen.getByText("Loading your kanban board...")).toBeInTheDocument();

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "TODO" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "In Progress" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Completed" })).toBeInTheDocument();
  });

  it("should display the app title", async () => {
    // The app title ("Kanban Board") now lives in the page header (routes/home.tsx);
    // the board itself shows the board's name and its pulse.
    mockApi({
      "GET /api/board": () =>
        json({ ...mockBoard, board: { id: "board-1", name: "Launch Plan", role: "owner" } }),
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByTestId("board-name")).toHaveTextContent("Launch Plan");
    });

    expect(screen.getByTestId("board-pulse")).toBeInTheDocument();
  });

  it("spotlights overdue cards and fades the rest", async () => {
    const card = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      title: id,
      notes: "",
      priority: "medium",
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
      ...extra,
    });
    mockApi({
      "GET /api/board": () =>
        json({
          columns: [
            { id: "todo", title: "To Do", cardIds: ["Late card", "Fresh card"] },
            { id: "done", title: "Completed", cardIds: ["Old done card"] },
          ],
          cards: {
            "Late card": card("Late card", { dueDate: "2020-01-01" }),
            "Fresh card": card("Fresh card"),
            // Past due but finished: never counts as overdue
            "Old done card": card("Old done card", { dueDate: "2020-01-01" }),
          },
        }),
    });
    const user = userEvent.setup();
    render(<KanbanBoard />);

    const lens = await screen.findByTestId("spotlight-overdue");
    expect(lens).toHaveTextContent("1");
    expect(screen.getByTestId("pulse-done")).toHaveTextContent("1 of 3");

    await user.click(lens);
    expect(lens).toHaveAttribute("aria-pressed", "true");
    const stateOf = (title: string) =>
      screen.getByText(title).closest("[data-spotlight]")?.getAttribute("data-spotlight");
    expect(stateOf("Late card")).toBe("match");
    expect(stateOf("Fresh card")).toBe("dim");
    expect(stateOf("Old done card")).toBe("dim");

    await user.keyboard("{Escape}");
    expect(lens).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Late card").closest("[data-spotlight]")).toBeNull();
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
      expect(screen.getByRole("heading", { name: "TODO" })).toBeInTheDocument();
    });

    const addCardButtons = screen.getAllByText("Add Card");
    await user.click(addCardButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Create New Card")).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/tags");
  });

  it("should create a new card via API", async () => {
    const user = userEvent.setup();
    let board: KanbanBoardType = mockBoard;

    mockApi({
      "GET /api/board": () => json(board),
      "POST /api/cards": () => {
        board = boardWithCard("Test Task", "This is a test task");
        return json(board.cards["card-1"], 201);
      },
    });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "TODO" })).toBeInTheDocument();
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
    expect(screen.queryByText("Create New Card")).not.toBeInTheDocument();

    // Verify API was called
    expect(requestBody("POST", "/api/cards")).toEqual(
      expect.objectContaining({
        title: "Test Task",
        notes: "This is a test task",
        columnId: "todo",
        priority: "medium",
        tagIds: [],
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
    let board: KanbanBoardType = mockBoard;

    mockApi({
      "GET /api/board": () => json(board),
      "POST /api/columns": () => {
        const column = { id: "testing", title: "Testing", cardIds: [] };
        board = { ...board, columns: [...board.columns, column] };
        return json(column, 201);
      },
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
      expect(screen.getByRole("heading", { name: "Testing" })).toBeInTheDocument();
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

    // apiFetch forwards an (undefined) options argument, so match on the URL only
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/board", undefined);
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/archived-cards", undefined);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "TODO" })).toBeInTheDocument();
    });
  });

  it("should handle board fetch error gracefully", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockApi({ "GET /api/board": () => json({ error: "boom" }, 500) });

    render(<KanbanBoard />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to fetch board");
    });

    consoleErrorSpy.mockRestore();
  });

  it("should handle AI prompt generation", async () => {
    const user = userEvent.setup();

    mockApi({
      "GET /api/board": () => json(boardWithCard("Feature Request", "Add dark mode")),
      "POST /api/generate-prompt": () => json({ prompt: "Generated prompt for testing" }),
      "PUT /api/cards/card-1": () => json({ id: "card-1" }),
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

    // Only the prompt is saved back, so a concurrent edit to title/notes isn't overwritten
    await waitFor(() => {
      expect(requestBody("PUT", "/api/cards/card-1")).toEqual({
        generatedPrompt: "Generated prompt for testing",
      });
    });
  });

  it("should handle AI prompt generation error", async () => {
    const user = userEvent.setup();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockApi({
      "GET /api/board": () => json(boardWithCard("Test Card", "Test")),
      "POST /api/generate-prompt": () => json({ error: "API key not configured" }, 500),
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

    // Nothing is saved when generation fails
    expect(global.fetch).not.toHaveBeenCalledWith("/api/cards/card-1", expect.anything());
    consoleErrorSpy.mockRestore();
  });
});
