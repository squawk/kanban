import { describe, it, expect, beforeEach, vi } from "vitest";
import { getInitialBoard, saveBoard, generateId } from "./storage";
import type { KanbanBoard } from "./types";

describe("storage utilities", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getInitialBoard", () => {
    it("should return default board when localStorage is empty", () => {
      const board = getInitialBoard();

      expect(board.columns).toHaveLength(3);
      expect(board.columns[0].id).toBe("todo");
      expect(board.columns[1].id).toBe("in-progress");
      expect(board.columns[2].id).toBe("completed");
      expect(board.cards).toEqual({});
    });

    it("should return stored board from localStorage", () => {
      const storedBoard: KanbanBoard = {
        columns: [
          { id: "custom", title: "Custom", cardIds: ["card-1"] },
        ],
        cards: {
          "card-1": {
            id: "card-1",
            title: "Test Card",
            notes: "Test notes",
            createdAt: "2024-01-01",
            updatedAt: "2024-01-01",
          },
        },
      };

      localStorage.setItem("kanban-board", JSON.stringify(storedBoard));
      const board = getInitialBoard();

      expect(board).toEqual(storedBoard);
    });

    it("should return default board when localStorage data is invalid", () => {
      localStorage.setItem("kanban-board", "invalid json");
      const board = getInitialBoard();

      expect(board.columns).toHaveLength(3);
      expect(board.cards).toEqual({});
    });
  });

  describe("saveBoard", () => {
    it("should save board to localStorage", () => {
      const board: KanbanBoard = {
        columns: [{ id: "test", title: "Test", cardIds: [] }],
        cards: {},
      };

      saveBoard(board);

      const stored = localStorage.getItem("kanban-board");
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(board);
    });

    it("should handle localStorage errors gracefully", () => {
      const board: KanbanBoard = {
        columns: [],
        cards: {},
      };

      // Mock localStorage.setItem to throw an error
      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      setItemSpy.mockImplementation(() => {
        throw new Error("Storage full");
      });

      // Should not throw
      expect(() => saveBoard(board)).not.toThrow();

      setItemSpy.mockRestore();
    });
  });

  describe("generateId", () => {
    it("should generate unique IDs", () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id1).not.toBe(id2);
    });

    it("should generate IDs with timestamp and random parts", () => {
      const id = generateId();
      const parts = id.split("-");

      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^\d+$/); // Timestamp
      expect(parts[1]).toMatch(/^[a-z0-9]+$/); // Random string
    });
  });
});
