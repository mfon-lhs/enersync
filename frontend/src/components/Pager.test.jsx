import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Pager from "./Pager.jsx";

const previous = () => screen.getByRole("button", { name: "Previous" });
const next = () => screen.getByRole("button", { name: "Next" });

describe("Pager", () => {
  it("shows the summary and the page number", () => {
    render(<Pager page={0} pageCount={3} onChange={() => {}} summary="Showing 1–12 of 30" />);
    expect(screen.getByText("Showing 1–12 of 30")).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("cannot go back from the first page", () => {
    render(<Pager page={0} pageCount={3} onChange={() => {}} summary="" />);
    expect(previous()).toBeDisabled();
    expect(next()).toBeEnabled();
  });

  it("cannot go forward from the last page", () => {
    render(<Pager page={2} pageCount={3} onChange={() => {}} summary="" />);
    expect(previous()).toBeEnabled();
    expect(next()).toBeDisabled();
  });

  it("reports the page to go to", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pager page={1} pageCount={3} onChange={onChange} summary="" />);

    await user.click(next());
    await user.click(previous());

    expect(onChange).toHaveBeenNthCalledWith(1, 2);
    expect(onChange).toHaveBeenNthCalledWith(2, 0);
  });

  it("shows just the page number, and always allows Next, when the page count is not known", () => {
    render(<Pager page={2} pageCount={0} onChange={() => {}} summary="" />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(next()).toBeEnabled();
  });
});
