import type { Route } from "./+types/home";
import { COMBINED_BOARD_ID } from "~/lib/linked-cards";
import { KanbanBoard } from "~/components/KanbanBoard";
import { CommandPalette, type PaletteAction } from "~/components/CommandPalette";
import { sendBoardCommand } from "~/lib/board-commands";
import { MyTasksDialog } from "~/components/MyTasksDialog";
import { AccountDialog } from "~/components/AccountDialog";
import { UserAvatar } from "~/components/UserAvatar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { useTheme } from "~/lib/theme";
import {
  AlertTriangle,
  ArrowUp,
  CalendarClock,
  EyeOff,
  ListChecks,
  LogOut,
  Palette,
  Plus,
  Search,
  Shield,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { BoardListItem, CurrentUser } from "~/lib/types";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Kanban Board" },
    { name: "description", content: "A beautiful project management kanban board" },
  ];
}

export default function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [isMyTasksOpen, setIsMyTasksOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const boardId = searchParams.get("boardId");
  const openCardId = searchParams.get("card");

  useEffect(() => {
    // Check if user is authenticated
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setUser(data.user);
        } else {
          navigate("/login");
        }
        setLoading(false);
      })
      .catch(() => {
        navigate("/login");
        setLoading(false);
      });
  }, [navigate]);

  const loadBoards = useCallback(() => {
    fetch("/api/boards")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setBoards(Array.isArray(data) ? data : []))
      .catch(() => setBoards([]));
  }, []);

  useEffect(() => {
    if (user) loadBoards();
  }, [user, loadBoards]);

  const selectBoard = (id: string | null, cardId?: string) => {
    const next = new URLSearchParams();
    const own = boards.find((b) => b.role === "owner");
    if (id && id !== own?.id) next.set("boardId", id);
    if (cardId) next.set("card", cardId);
    setSearchParams(next);
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/login");
  };

  // ⌘K / Ctrl+K anywhere, or "/" when not typing, opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsPaletteOpen((open) => !open);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !document.querySelector("[role=dialog]")) {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const onCombined = boardId === COMBINED_BOARD_ID;
  const paletteActions = useMemo<PaletteAction[]>(() => {
    const icon = (I: typeof Plus) => <I className="h-4 w-4" />;
    return [
      ...(!onCombined
        ? [{ id: "new-card", title: "New card", icon: icon(Plus), keywords: ["create", "add", "task"], run: () => sendBoardCommand({ type: "new-card" }) }]
        : []),
      { id: "quick-add", title: "Quick add with AI", icon: icon(Sparkles), keywords: ["create", "sentence", "ai"], run: () => sendBoardCommand({ type: "quick-add" }) },
      { id: "my-tasks", title: "My Tasks", icon: icon(ListChecks), keywords: ["assigned", "mine"], run: () => setIsMyTasksOpen(true) },
      { id: "spot-overdue", title: "Spotlight overdue cards", icon: icon(AlertTriangle), keywords: ["late", "highlight", "filter"], run: () => sendBoardCommand({ type: "spotlight", kind: "overdue" }) },
      { id: "spot-due", title: "Spotlight cards due this week", icon: icon(CalendarClock), keywords: ["soon", "highlight", "filter"], run: () => sendBoardCommand({ type: "spotlight", kind: "dueSoon" }) },
      { id: "spot-high", title: "Spotlight high priority", icon: icon(ArrowUp), keywords: ["urgent", "highlight", "filter"], run: () => sendBoardCommand({ type: "spotlight", kind: "high" }) },
      { id: "spot-mine", title: "Spotlight my cards", icon: icon(UserRound), keywords: ["mine", "assigned", "highlight", "filter"], run: () => sendBoardCommand({ type: "spotlight", kind: "mine" }) },
      { id: "spot-private", title: "Spotlight private cards", icon: icon(EyeOff), keywords: ["hidden", "highlight", "filter"], run: () => sendBoardCommand({ type: "spotlight", kind: "private" }) },
      { id: "spot-clear", title: "Clear spotlight", icon: icon(X), keywords: ["reset", "highlight"], run: () => sendBoardCommand({ type: "spotlight", kind: null }) },
      ...(!onCombined
        ? [{ id: "everyone", title: "Open the Everyone view", icon: icon(Users), keywords: ["all boards", "combined"], run: () => selectBoard(COMBINED_BOARD_ID) }]
        : []),
      { id: "theme", title: `Switch to ${theme === "modern" ? "Vintage" : "Modern"} theme`, icon: icon(Palette), keywords: ["dark", "light", "appearance", "color"], run: toggleTheme },
      ...(user?.role === "admin"
        ? [{ id: "admin", title: "Admin", icon: icon(Shield), keywords: ["users", "invite", "audit", "settings"], run: () => navigate("/admin") }]
        : []),
      { id: "account", title: "Account settings", icon: icon(UserRound), keywords: ["email", "notifications", "profile"], run: () => setIsAccountOpen(true) },
      { id: "logout", title: "Log out", icon: icon(LogOut), keywords: ["sign out"], run: handleLogout },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCombined, theme, user?.role, boards]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const currentBoardId = boardId ?? boards.find((b) => b.role === "owner")?.id ?? "";

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <nav className="bg-card border-b-2 border-border px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-xl font-bold text-foreground">Kanban Board</h1>
            {boards.length > 1 && (
              <select
                aria-label="Switch board"
                value={currentBoardId}
                onChange={(e) => selectBoard(e.target.value)}
                className="max-w-[12rem] h-9 px-2 border-2 border-border rounded-md bg-card text-foreground text-sm"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.displayName ?? (b.role === "owner" ? b.name : `${b.name} (${b.ownerName ?? "shared"})`)}
                  </option>
                ))}
                <option value={COMBINED_BOARD_ID}>Everyone (all boards)</option>
              </select>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              className="group flex h-9 items-center gap-2 rounded-md border-2 border-border bg-background/60 px-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground sm:w-56 lg:w-72"
              title={`Search cards, boards and actions (${isMac ? "⌘" : "Ctrl+"}K)`}
              aria-label="Search cards, boards and actions"
              data-testid="open-command-palette"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden flex-1 text-left sm:inline">Search or jump to…</span>
              <kbd className="hidden rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium sm:inline">
                {isMac ? "⌘K" : "Ctrl K"}
              </kbd>
            </button>
            <Button onClick={() => setIsMyTasksOpen(true)} variant="outline" size="sm" className="gap-2" title="Cards assigned to me">
              <ListChecks className="h-4 w-4" />
              <span className="hidden sm:inline">My Tasks</span>
            </Button>
            {user.role === "admin" && (
              <Button asChild variant="outline" size="sm" className="gap-2" title="Admin">
                <Link to="/admin">
                  <Shield className="h-4 w-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              </Button>
            )}
            <Button
              onClick={toggleTheme}
              variant="outline"
              size="sm"
              className="gap-2"
              title={`Switch to ${theme === "modern" ? "vintage" : "modern"} theme`}
            >
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">{theme === "modern" ? "Vintage" : "Modern"}</span>
            </Button>
            <button
              type="button"
              onClick={() => setIsAccountOpen(true)}
              className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted"
              title="Account settings"
              aria-label="Account settings"
            >
              <UserAvatar user={user} />
              <span className="hidden md:inline text-muted-foreground text-sm">
                Welcome, <span className="font-medium text-foreground">{user.name}</span>
              </span>
            </button>
            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
            >
              Logout
            </Button>
          </div>
        </div>
      </nav>

      {/* Board */}
      <KanbanBoard
        key={boardId ?? "own"}
        boardId={boardId}
        currentUser={user}
        openCardId={openCardId}
        onOpenCardHandled={() => {
          if (searchParams.has("card")) {
            const next = new URLSearchParams(searchParams);
            next.delete("card");
            setSearchParams(next, { replace: true });
          }
        }}
        onLeftBoard={() => {
          loadBoards();
          selectBoard(null);
        }}
        onBoardLoaded={(info) => {
          // Keep switcher labels current (e.g. after a rename or being added to a board)
          if (info.id !== COMBINED_BOARD_ID && !boards.some((b) => b.id === info.id)) loadBoards();
        }}
      />

      <MyTasksDialog
        open={isMyTasksOpen}
        onOpenChange={setIsMyTasksOpen}
        onOpenCard={(targetBoardId, cardId) => selectBoard(targetBoardId, cardId)}
      />

      <CommandPalette
        open={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        boards={boards}
        currentBoardId={currentBoardId}
        actions={paletteActions}
        onOpenCard={(targetBoardId, cardId) => selectBoard(targetBoardId, cardId)}
        onSelectBoard={(id) => selectBoard(id)}
      />

      <AccountDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} user={user} onUserChange={setUser} />
    </div>
  );
}
