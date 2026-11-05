import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import LoginPage from "./login";
import { ThemeProvider } from "~/lib/theme";

// Mock useNavigate
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

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

describe("Login Page Theme Backgrounds", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  describe("Modern Theme", () => {
    it("should apply modern theme to document when theme is modern", () => {
      renderWithProviders(<LoginPage />, "modern");

      expect(document.documentElement.getAttribute("data-theme")).toBe("modern");
    });

    it("should let the modern theme's page background show through the login container", () => {
      renderWithProviders(<LoginPage />, "modern");

      // The theme background (paper texture / modern gradient) is painted on <body> in
      // app.css; a solid bg-* on the full-screen container would cover it up.
      const container = screen.getByText("Kanban Board").closest(".min-h-screen");
      expect(container).toBeInTheDocument();
      expect(container!.className).not.toMatch(/(^|\s)bg-/);
    });

    it("should show 'Vintage' option in theme toggle when modern theme is active", () => {
      renderWithProviders(<LoginPage />, "modern");

      const toggleButton = screen.getByTitle("Switch to vintage theme");
      expect(toggleButton).toBeInTheDocument();
      expect(screen.getByText("Vintage")).toBeInTheDocument();
    });
  });

  describe("Vintage Theme", () => {
    it("should apply vintage theme to document when theme is vintage", () => {
      renderWithProviders(<LoginPage />, "vintage");

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");
    });

    it("should let the vintage theme's page background show through the login container", () => {
      renderWithProviders(<LoginPage />, "vintage");

      // The theme background (paper texture / modern gradient) is painted on <body> in
      // app.css; a solid bg-* on the full-screen container would cover it up.
      const container = screen.getByText("Kanban Board").closest(".min-h-screen");
      expect(container).toBeInTheDocument();
      expect(container!.className).not.toMatch(/(^|\s)bg-/);
    });

    it("should show 'Modern' option in theme toggle when vintage theme is active", () => {
      renderWithProviders(<LoginPage />, "vintage");

      const toggleButton = screen.getByTitle("Switch to modern theme");
      expect(toggleButton).toBeInTheDocument();
      expect(screen.getByText("Modern")).toBeInTheDocument();
    });
  });

  describe("Theme Toggle", () => {
    it("should toggle from modern to vintage theme", () => {
      renderWithProviders(<LoginPage />, "modern");

      expect(document.documentElement.getAttribute("data-theme")).toBe("modern");

      const toggleButton = screen.getByTitle("Switch to vintage theme");
      fireEvent.click(toggleButton);

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");
      expect(localStorage.getItem("kanban-theme")).toBe("vintage");
    });

    it("should toggle from vintage to modern theme", () => {
      renderWithProviders(<LoginPage />, "vintage");

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");

      const toggleButton = screen.getByTitle("Switch to modern theme");
      fireEvent.click(toggleButton);

      expect(document.documentElement.getAttribute("data-theme")).toBe("modern");
      expect(localStorage.getItem("kanban-theme")).toBe("modern");
    });
  });

  describe("Theme Persistence", () => {
    it("should persist modern theme to localStorage", () => {
      renderWithProviders(<LoginPage />, "modern");

      expect(localStorage.getItem("kanban-theme")).toBe("modern");
    });

    it("should persist vintage theme to localStorage", () => {
      renderWithProviders(<LoginPage />, "vintage");

      expect(localStorage.getItem("kanban-theme")).toBe("vintage");
    });

    it("should default to vintage theme when no theme is saved", () => {
      renderWithProviders(<LoginPage />);

      expect(document.documentElement.getAttribute("data-theme")).toBe("vintage");
    });
  });
});
