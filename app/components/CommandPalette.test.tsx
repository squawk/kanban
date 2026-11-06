import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommandPalette, type PaletteAction } from "./CommandPalette";
import type { BoardListItem, KanbanBoard } from "~/lib/types";

global.fetch = vi.fn();

const card = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  notes: "",
  priority: "medium",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  ...extra,
});

const everyone: KanbanBoard = {
  columns: [
    { id: "all:to do", title: "To Do", cardIds: ["c1", "c2"] },
    { id: "all:done", title: "Done", cardIds: ["c3"] },
  ],
  cards: {
    c1: card("c1", "Fix login redirect on Safari", { boardId: "b2", linkedFrom: { boardId: "b2", boardName: "Bob's board", columnTitle: "To Do" } }),
    c2: card("c2", "Draft launch notes", { boardId: "b1", notes: "mention the Safari fix", linkedFrom: { boardId: "b1", boardName: "My Board", columnTitle: "To Do" } }),
    c3: card("c3", "Ship v1", { boardId: "b1", linkedFrom: { boardId: "b1", boardName: "My Board", columnTitle: "Done" } }),
  } as KanbanBoard["cards"],
};

const boards: BoardListItem[] = [
  { id: "b1", name: "My Board", role: "owner", ownerName: null },
  { id: "b2", name: "My Board", role: "member", ownerName: "Bob", displayName: "Bob's board" },
];

function setup(actions: PaletteAction[] = []) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    boards,
    currentBoardId: "b1",
    actions,
    onOpenCard: vi.fn(),
    onSelectBoard: vi.fn(),
  };
  render(<CommandPalette {...props} />);
  return props;
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => everyone } as Response);
  });

  it("finds cards on any board by title or notes, title matches first, and opens the chosen one", async () => {
    const user = userEvent.setup();
    const props = setup();
    expect(global.fetch).toHaveBeenCalledWith("/api/board?boardId=all", undefined);

    await user.type(screen.getByTestId("command-palette-input"), "safari");
    await waitFor(() => expect(screen.getAllByTestId("palette-card")).toHaveLength(2));
    const rows = screen.getAllByTestId("palette-card");
    expect(rows[0]).toHaveTextContent("Fix login redirect on Safari");
    expect(rows[0]).toHaveTextContent("Bob's board");
    expect(rows[1]).toHaveTextContent("Draft launch notes"); // matched in its notes

    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(props.onOpenCard).toHaveBeenCalledWith("b1", "c2"));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("runs actions and jumps to boards", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const props = setup([{ id: "theme", title: "Switch to Modern theme", icon: null, keywords: ["dark"], run }]);

    await user.type(screen.getByTestId("command-palette-input"), "dark");
    await user.click(await screen.findByText("Modern", { exact: false }));
    await waitFor(() => expect(run).toHaveBeenCalled());

    await user.clear(screen.getByTestId("command-palette-input"));
    await user.type(screen.getByTestId("command-palette-input"), "bob");
    const board = (await screen.findAllByTestId("palette-board"))[0];
    expect(board).toHaveTextContent("Bob's board");
    await user.click(board);
    await waitFor(() => expect(props.onSelectBoard).toHaveBeenCalledWith("b2"));
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByTestId("command-palette-input"), "zebra");
    expect(await screen.findByText(/Nothing matches/)).toHaveTextContent("zebra");
  });
});
