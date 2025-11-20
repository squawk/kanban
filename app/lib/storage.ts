import { KanbanBoard, KanbanColumn } from "./types";

const STORAGE_KEY = "kanban-board";

const defaultColumns: KanbanColumn[] = [
  { id: "todo", title: "TODO", cardIds: [] },
  { id: "in-progress", title: "In Progress", cardIds: [] },
  { id: "completed", title: "Completed", cardIds: [] },
];

export const getInitialBoard = (): KanbanBoard => {
  if (typeof window === "undefined") {
    return { columns: defaultColumns, cards: {} };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("Error loading kanban board from storage:", error);
  }

  return { columns: defaultColumns, cards: {} };
};

export const saveBoard = (board: KanbanBoard): void => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch (error) {
    console.error("Error saving kanban board to storage:", error);
  }
};

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
