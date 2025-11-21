export interface Comment {
  id: string;
  content: string;
  cardId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  notes: string;
  generatedPrompt?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  comments?: Comment[];
  tags?: Tag[];
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

export interface Template {
  id: string;
  name: string;
  title: string;
  notes: string;
  tags: string[]; // tag IDs
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
}
