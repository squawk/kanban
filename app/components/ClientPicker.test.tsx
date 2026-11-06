import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ClientPicker } from "./ClientPicker";
import type { ClientSummary } from "~/lib/types";

global.fetch = vi.fn();

const acme: ClientSummary = { id: "c1", name: "Acme", color: "#2563eb", archived: false };

function Harness({ current, onChange }: { current?: ClientSummary | null; onChange: (id: string) => void }) {
  const [value, setValue] = useState(current?.id ?? "");
  return (
    <ClientPicker
      value={value}
      current={current}
      onChange={(id) => {
        setValue(id);
        onChange(id);
      }}
    />
  );
}

describe("ClientPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists clients, and adds a new one with a name and color, then selects it", async () => {
    vi.mocked(global.fetch).mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return { ok: true, status: 201, json: async () => ({ id: "c2", name: body.name, color: body.color, archived: false }) } as Response;
      }
      return { ok: true, json: async () => [acme] } as Response;
    });
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    expect(await screen.findByRole("option", { name: "Acme" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /New/ }));
    await user.type(screen.getByLabelText("New client name"), "Globex");
    await user.click(screen.getByRole("radio", { name: "Color #16a34a" }));
    await user.click(screen.getByRole("button", { name: "Add client" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("c2"));
    const post = vi.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ name: "Globex", color: "#16a34a" });
    expect(screen.getByLabelText("Client")).toHaveValue("c2");
  });

  it("keeps the card's archived client selectable", async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, json: async () => [acme] } as Response);
    render(<Harness current={{ id: "old", name: "Initech", color: "#475569", archived: true }} onChange={vi.fn()} />);
    expect(await screen.findByRole("option", { name: "Initech (archived)" })).toBeInTheDocument();
    expect(screen.getByLabelText("Client")).toHaveValue("old");
  });
});
