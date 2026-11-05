import type { Route } from "./+types/home";
import { COMBINED_BOARD_ID } from "~/lib/linked-cards";
import { KanbanBoard } from "~/components/KanbanBoard";
import { MyTasksDialog } from "~/components/MyTasksDialog";
import { AccountDialog } from "~/components/AccountDialog";
import { UserAvatar } from "~/components/UserAvatar";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { useTheme } from "~/lib/theme";
import { ListChecks, Palette, Shield } from "lucide-react";
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

      <AccountDialog open={isAccountOpen} onOpenChange={setIsAccountOpen} user={user} onUserChange={setUser} />
    </div>
  );
}
