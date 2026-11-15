import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Modal from "./Modal.jsx";

// Note: pressing Tab inside the dialog is not tested here. The pretend browser used by these tests
// cannot measure the page layout, which that feature needs, so it is checked by hand in Chrome.

function open(props = {}) {
  const onClose = vi.fn();
  const view = render(
    <Modal title="Edit asset" onClose={onClose} {...props}>
      <input aria-label="Asset name" />
      <button type="button">Save</button>
    </Modal>,
  );
  return { onClose, ...view };
}

describe("Modal", () => {
  it("is a dialog named after its title", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Edit asset" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("shows the subtitle, the content and the footer", () => {
    open({ subtitle: "Change the details", footer: <button type="button">Footer action</button> });
    expect(screen.getByText("Change the details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Footer action" })).toBeInTheDocument();
  });

  it("puts the cursor in the first field when it opens", () => {
    open();
    expect(screen.getByLabelText("Asset name")).toHaveFocus();
  });

  it("focuses the dialog itself when it has no field", () => {
    render(
      <Modal title="Nothing to type" onClose={() => {}}>
        <p>Just text</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("closes when Escape is pressed", async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with the Close button", async () => {
    const user = userEvent.setup();
    const { onClose } = open();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the dark area around it is pressed, but not when the dialog itself is", () => {
    const { onClose } = open();
    const dialog = screen.getByRole("dialog");

    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog.parentElement); // the backdrop
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stops the page behind from scrolling, and lets it scroll again afterwards", () => {
    const { unmount } = open();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("returns the cursor to where it was when it closes", () => {
    render(<button type="button">Open dialog</button>);
    const opener = screen.getByRole("button", { name: "Open dialog" });
    opener.focus();

    const { unmount } = open();
    expect(screen.getByLabelText("Asset name")).toHaveFocus();

    unmount();
    expect(opener).toHaveFocus();
  });
});
