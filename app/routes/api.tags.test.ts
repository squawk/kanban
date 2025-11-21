import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "~/lib/prisma";

// Mock Prisma
vi.mock("~/lib/prisma", () => ({
  prisma: {
    tag: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("Tags API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/tags", () => {
    it("should return all tags sorted by name", async () => {
      const mockTags = [
        { id: "1", name: "Bug", color: "#ef4444", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" },
        { id: "2", name: "Feature", color: "#3b82f6", createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" },
      ];

      (prisma.tag.findMany as any).mockResolvedValue(mockTags);

      const { loader } = await import("~/routes/api.tags");
      const response = await loader();
      const data = await response.json();

      expect(prisma.tag.findMany).toHaveBeenCalledWith({
        orderBy: { name: "asc" },
      });
      expect(data).toEqual(mockTags);
    });

    it("should handle errors gracefully", async () => {
      (prisma.tag.findMany as any).mockRejectedValue(new Error("Database error"));

      const { loader } = await import("~/routes/api.tags");
      const response = await loader();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch tags");
    });
  });

  describe("POST /api/tags", () => {
    it("should create a new tag", async () => {
      const newTag = {
        id: "3",
        name: "Urgent",
        color: "#f59e0b",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      (prisma.tag.findUnique as any).mockResolvedValue(null);
      (prisma.tag.create as any).mockResolvedValue(newTag);

      const { action } = await import("~/routes/api.tags");
      const request = new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Urgent", color: "#f59e0b" }),
      });

      const response = await action({ request, params: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data).toEqual(newTag);
    });

    it("should reject duplicate tag names", async () => {
      (prisma.tag.findUnique as any).mockResolvedValue({
        id: "1",
        name: "Bug",
        color: "#ef4444",
      });

      const { action } = await import("~/routes/api.tags");
      const request = new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bug", color: "#ef4444" }),
      });

      const response = await action({ request, params: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("already exists");
    });

    it("should require name and color", async () => {
      const { action } = await import("~/routes/api.tags");
      const request = new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bug" }), // missing color
      });

      const response = await action({ request, params: {} } as any);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("required");
    });
  });
});
