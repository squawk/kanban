import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./dialog";

describe("Dialog", () => {
  it("should not render content when closed", () => {
    render(
      <Dialog open={false}>
        <DialogContent>Dialog content</DialogContent>
      </Dialog>
    );

    expect(screen.queryByText("Dialog content")).not.toBeInTheDocument();
  });

  it("should render content when open", () => {
    render(
      <Dialog open={true}>
        <DialogContent>Dialog content</DialogContent>
      </Dialog>
    );

    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });

  it("should render complete dialog structure", () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogHeader>
          <div>Main content</div>
          <DialogFooter>Footer content</DialogFooter>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText("Dialog Title")).toBeInTheDocument();
    expect(screen.getByText("Dialog description")).toBeInTheDocument();
    expect(screen.getByText("Main content")).toBeInTheDocument();
    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });

  it("should call onOpenChange when close button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <Dialog open={true} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>Test Dialog</DialogTitle>
          Dialog content
        </DialogContent>
      </Dialog>
    );

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onOpenChange).toHaveBeenCalled();
  });
});
