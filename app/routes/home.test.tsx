import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Home from "./home";
import { ThemeProvider } from "~/lib/theme";

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock KanbanBoard component to avoid complex rendering
vi.mock("~/components/KanbanBoard", () => ({
  KanbanBoard: () => <div data-testid="kanban-board">Kanban Board Component</div>,
}));

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  name: "Test User",
};

function renderWithProviders(ui: React.ReactElement, initialTheme?: "modern" | "vintage") {
  if (initialTheme) {
    localStorage.setItem("kanban-theme", initialTheme);
  } else {
    localStorage.removeItem("kanban-theme");
  }

  return render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>
  );
}

describe("Home/Dashboard Page Theme Backgrounds", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    mockNavigate.mockClear();

    // Mock successful auth check
    vi.mocked(global.fetch).mockResolvedValue({
      json: async () => ({ user: mockUser }),
    } as Response);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.clearAllMocks();
  });

  describe("Modern Theme", () => {
    it("should apply modern theme to document when theme is modern", async () => {
      renderWithProviders(<Home />, "modern");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      expect(document.documentElement.getAttribute("data-theme")).toBe("modern");
    });

    it("should have min-h-screen class on dashboard container with modern theme", async () => {
      renderWithProviders(<Home />, "modern");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      const container = screen.getByText("Kanban Board").closest(".min-h-screen");
      expect(container).toBeInTheDocument();
    });

    it("should show 'Vintage' option in theme toggle when modern theme is active", async () => {
      renderWithProviders(<Home />, "modern");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      const toggleButton = screen.getByTitle("Switch to vintage theme");
      expect(toggleButton).toBeInTheDocument();
      expect(screen.getByText("Vintage")).toBeInTheDocument();
    });

    it("should display navbar with bg-card class in modern theme", async () => {
      renderWithProviders(<Home />, "modern");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      const navbar = screen.getByRole("navigation");
      expect(navbar).toHaveClass("bg-card");
    });
  });

  describe("Vintage Theme", () => {
    it("should apply vintage theme to document when theme is vintage", async () => {
      renderWithProviders(<Home />, "vintage");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");
    });

    it("should have min-h-screen class on dashboard container with vintage theme", async () => {
      renderWithProviders(<Home />, "vintage");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      const container = screen.getByText("Kanban Board").closest(".min-h-screen");
      expect(container).toBeInTheDocument();
    });

    it("should show 'Modern' option in theme toggle when vintage theme is active", async () => {
      renderWithProviders(<Home />, "vintage");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      const toggleButton = screen.getByTitle("Switch to modern theme");
      expect(toggleButton).toBeInTheDocument();
      expect(screen.getByText("Modern")).toBeInTheDocument();
    });

    it("should display navbar with bg-card class in vintage theme", async () => {
      renderWithProviders(<Home />, "vintage");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      const navbar = screen.getByRole("navigation");
      expect(navbar).toHaveClass("bg-card");
    });
  });

  describe("Theme Toggle", () => {
    it("should toggle from modern to vintage theme", async () => {
      renderWithProviders(<Home />, "modern");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      expect(document.documentElement.getAttribute("data-theme")).toBe("modern");

      const toggleButton = screen.getByTitle("Switch to vintage theme");
      fireEvent.click(toggleButton);

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");
      expect(localStorage.getItem("kanban-theme")).toBe("vintage");
    });

    it("should toggle from vintage to modern theme", async () => {
      renderWithProviders(<Home />, "vintage");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");

      const toggleButton = screen.getByTitle("Switch to modern theme");
      fireEvent.click(toggleButton);

      expect(document.documentElement.getAttribute("data-theme")).toBe("modern");
      expect(localStorage.getItem("kanban-theme")).toBe("modern");
    });
  });

  describe("Theme Persistence", () => {
    it("should persist modern theme to localStorage", async () => {
      renderWithProviders(<Home />, "modern");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      expect(localStorage.getItem("kanban-theme")).toBe("modern");
    });

    it("should persist vintage theme to localStorage", async () => {
      renderWithProviders(<Home />, "vintage");

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      expect(localStorage.getItem("kanban-theme")).toBe("vintage");
    });

    it("should default to vintage theme when no theme is saved", async () => {
      renderWithProviders(<Home />);

      await waitFor(() => {
        expect(screen.getByText("Kanban Board")).toBeInTheDocument();
      });

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");
    });
  });

  describe("User Welcome with Theme", () => {
    it("should display user name in navbar with modern theme", async () => {
      renderWithProviders(<Home />, "modern");

      await waitFor(() => {
        expect(screen.getByText(mockUser.name)).toBeInTheDocument();
      });
    });

    it("should display user name in navbar with vintage theme", async () => {
      renderWithProviders(<Home />, "vintage");

      await waitFor(() => {
        expect(screen.getByText(mockUser.name)).toBeInTheDocument();
      });
    });
  });
});
