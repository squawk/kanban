import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PromptDialog } from "./PromptDialog";

describe("PromptDialog", () => {
  it("should show loading state", () => {
    render(
      <PromptDialog
        open={true}
        onOpenChange={vi.fn()}
        prompt=""
        isLoading={true}
      />
    );

    expect(screen.getByText("Generating prompt...")).toBeInTheDocument();
  });

  it("should show error message", () => {
    render(
      <PromptDialog
        open={true}
        onOpenChange={vi.fn()}
        prompt=""
        error="Failed to generate"
      />
    );

    expect(screen.getByText("Failed to generate")).toBeInTheDocument();
  });

  it("should display generated prompt", () => {
    const testPrompt = "This is a generated prompt for Claude Code";

    render(
      <PromptDialog
        open={true}
        onOpenChange={vi.fn()}
        prompt={testPrompt}
      />
    );

    expect(screen.getByText(testPrompt)).toBeInTheDocument();
    expect(screen.getByText("Copy to Clipboard")).toBeInTheDocument();
  });

  it("should copy prompt to clipboard", async () => {
    const user = userEvent.setup();
    const testPrompt = "Test prompt";

    render(
      <PromptDialog
        open={true}
        onOpenChange={vi.fn()}
        prompt={testPrompt}
      />
    );

    const copyButtons = screen.getAllByRole("button", { name: /copy to clipboard/i });
    await user.click(copyButtons[0]);

    // Wait for button text to change
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });

  it("should call onOpenChange when close is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <PromptDialog
        open={true}
        onOpenChange={onOpenChange}
        prompt="Test prompt"
      />
    );

    // Get all close buttons and click the footer one
    const closeButtons = screen.getAllByRole("button", { name: /close/i });
    await user.click(closeButtons[0]);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
