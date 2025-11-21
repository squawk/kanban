export interface Comment {
  id: string;
  content: string;
  cardId: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  notes: string;
  generatedPrompt?: string;
  comments?: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cardIds: string[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  cards: Record<string, KanbanCard>;
}
