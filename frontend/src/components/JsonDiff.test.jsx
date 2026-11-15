import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import JsonDiff, { diffValues } from "./JsonDiff.jsx";

describe("diffValues", () => {
  it("marks each field as changed, added, removed or unchanged, in alphabetical order", () => {
    const result = diffValues({ status: "Operational", name: "Pump", gone: 1 }, { status: "MaintenanceRequired", name: "Pump", fresh: 2 });
    expect(result.map((r) => [r.key, r.kind])).toEqual([
      ["fresh", "added"],
      ["gone", "removed"],
      ["name", "same"],
      ["status", "changed"],
    ]);
  });

  it("keeps the old and the new value of each field", () => {
    const [entry] = diffValues({ status: "Operational" }, { status: "InTransit" });
    expect(entry.before).toBe("Operational");
    expect(entry.after).toBe("InTransit");
  });

  it("treats a missing side as empty, so a creation shows every field as added", () => {
    const result = diffValues(null, { name: "Pump", status: "Operational" });
    expect(result.every((r) => r.kind === "added")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("sees a difference in a nested value", () => {
    const [entry] = diffValues({ tags: ["a"] }, { tags: ["a", "b"] });
    expect(entry.kind).toBe("changed");
  });
});

describe("JsonDiff", () => {
  const before = { status: "Operational", name: "Pump" };
  const after = { status: "MaintenanceRequired", name: "Pump" };

  it("shows only the fields that changed, with their old and new values", () => {
    render(<JsonDiff oldValue={before} newValue={after} />);
    expect(screen.getByText("1 field changed")).toBeInTheDocument();
    expect(screen.getByText("status")).toBeInTheDocument();
    expect(screen.getByText('"Operational"')).toBeInTheDocument();
    expect(screen.getByText('"MaintenanceRequired"')).toBeInTheDocument();
    expect(screen.queryByText("name")).not.toBeInTheDocument();
  });

  it("can also show the fields that did not change", async () => {
    const user = userEvent.setup();
    render(<JsonDiff oldValue={before} newValue={after} />);

    await user.click(screen.getByLabelText("Show unchanged"));

    expect(screen.getByText("name")).toBeInTheDocument();
    expect(screen.getByText('"Pump"')).toBeInTheDocument();
  });

  it("can show the raw before and after", async () => {
    const user = userEvent.setup();
    render(<JsonDiff oldValue={before} newValue={after} />);

    await user.click(screen.getByLabelText("Raw JSON"));

    expect(screen.getByRole("heading", { name: "Before" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "After" })).toBeInTheDocument();
  });

  it("says recorded, not changed, for a new record", () => {
    render(<JsonDiff oldValue={null} newValue={{ name: "Pump", status: "Operational" }} />);
    expect(screen.getByText("2 fields recorded")).toBeInTheDocument();
  });

  it("says so when nothing changed", () => {
    render(<JsonDiff oldValue={before} newValue={before} />);
    expect(screen.getByText("Nothing changed in the stored fields.")).toBeInTheDocument();
  });
});
