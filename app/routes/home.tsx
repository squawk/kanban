import type { Route } from "./+types/home";
import { KanbanBoard } from "~/components/KanbanBoard";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { useTheme } from "~/lib/theme";
import { Palette } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Vibe Coding Kanban" },
    { name: "description", content: "A beautiful project management kanban board" },
  ];
}

interface User {
  id: string;
  email: string;
  name: string;
}

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { theme, toggleTheme } = useTheme();

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

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="bg-card border-b-2 border-border px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">Kanban Board</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground text-sm">
              Welcome, <span className="font-medium text-foreground">{user.name}</span>
            </span>
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
      <KanbanBoard />
    </div>
  );
}
