import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDialog } from "./CardDialog";

describe("CardDialog", () => {
  it("should render create mode when no initial values", () => {
    render(
      <CardDialog
        open={true}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("Create New Card")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("should render edit mode with initial values", () => {
    render(
      <CardDialog
        open={true}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
        initialTitle="Test Title"
        initialNotes="Test Notes"
      />
    );

    expect(screen.getByText("Edit Card")).toBeInTheDocument();
    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Title")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test Notes")).toBeInTheDocument();
  });

  it("should call onSave with correct values", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    );

    const titleInput = screen.getByPlaceholderText("Enter card title...");
    const notesInput = screen.getByPlaceholderText("Add notes or description...");
    const createButton = screen.getByText("Create");

    await user.type(titleInput, "New Task");
    await user.type(notesInput, "Task description");
    await user.click(createButton);

    expect(onSave).toHaveBeenCalledWith("New Task", "Task description");
  });

  it("should not call onSave when title is empty", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    );

    const createButton = screen.getByText("Create");
    expect(createButton).toBeDisabled();

    await user.click(createButton);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("should call onOpenChange when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <CardDialog
        open={true}
        onOpenChange={onOpenChange}
        onSave={vi.fn()}
      />
    );

    const cancelButton = screen.getByText("Cancel");
    await user.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
