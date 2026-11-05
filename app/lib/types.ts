export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export type UserRole = 'admin' | 'member';

export interface CurrentUser extends UserSummary {
  role: UserRole;
  emailNotifications: boolean;
}

export interface BoardMember extends UserSummary {
  boardRole: 'owner' | 'member';
}

export interface BoardInfo {
  id: string;
  name: string;
  role: 'owner' | 'member';
  /** Name to show: "Luke's board" for a shared board that kept the default name */
  displayName?: string;
  /** The combined view of every board you can open */
  combined?: boolean;
}

export interface BoardListItem {
  id: string;
  name: string;
  role: 'owner' | 'member';
  ownerName: string | null;
  displayName?: string;
}

export interface ActivityEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  boardId: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Comment {
  id: string;
  content: string;
  cardId: string;
  author?: UserSummary | null;
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
  archivedAt?: string;
  boardId?: string;
  assigneeId?: string | null;
  /** Only the creator can see it (and it can't be assigned) */
  isPrivate?: boolean;
  assignee?: UserSummary | null;
  createdBy?: UserSummary | null;
  /** Latest edit-history version (0 = no history yet) */
  version?: number;
  /** Active edit lock (someone has the card open in the edit dialog) */
  lock?: { userId: string; name: string; expiresAt: string } | null;
  /** Set when the card lives on another board and is shown here because it's assigned to you */
  linkedFrom?: { boardId: string; boardName: string; columnTitle: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface AssignedCard extends KanbanCard {
  boardId: string;
  boardName: string;
  columnTitle: string | null;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cardIds: string[];
}

export interface KanbanBoard {
  board?: BoardInfo;
  /** Supabase Realtime channel for live updates (null when not configured) */
  realtime?: { url: string; key: string; topic: string; private?: boolean } | null;
  members?: BoardMember[];
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
