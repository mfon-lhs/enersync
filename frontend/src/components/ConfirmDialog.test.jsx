import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog.jsx";

function ask(props = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog title="Reject request #7?" confirmLabel="Reject" tone="danger" onConfirm={onConfirm} onCancel={onCancel} {...props}>
      This cannot be undone.
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("shows the question and the explanation", () => {
    ask();
    expect(screen.getByRole("dialog", { name: "Reject request #7?" })).toBeInTheDocument();
    expect(screen.getByText("This cannot be undone.")).toBeInTheDocument();
  });

  it("puts the cursor on the confirm button", () => {
    ask();
    expect(screen.getByRole("button", { name: "Reject" })).toHaveFocus();
  });

  it("confirms with the confirm button", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = ask();
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels with Cancel and with Escape", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = ask();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows an error message", () => {
    ask({ error: "Someone else already changed this request." });
    expect(screen.getByRole("alert")).toHaveTextContent("Someone else already changed this request.");
  });

  it("locks both buttons, and ignores Escape, while it is working", async () => {
    const user = userEvent.setup();
    const { onCancel } = ask({ busy: true });
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });
});
