import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { colors } from "../theme.js";
import { ActionBadge, AssetStatusBadge, PriorityBadge, RequestStatusBadge } from "./StatusBadge.jsx";

// Draws one badge and returns it
function badge(element) {
  const { container } = render(element);
  return container.querySelector(".badge");
}

describe("badges", () => {
  it("writes asset statuses in plain words", () => {
    expect(badge(<AssetStatusBadge status="MaintenanceRequired" />)).toHaveTextContent("Maintenance Required");
    expect(badge(<AssetStatusBadge status="InTransit" />)).toHaveTextContent("In Transit");
  });

  it("colours asset statuses from the theme", () => {
    expect(badge(<AssetStatusBadge status="Operational" />).style.getPropertyValue("--badge")).toBe(colors.operational);
  });

  it("copes with a status it has never seen", () => {
    const unknown = badge(<AssetStatusBadge status="SomethingNew" />);
    expect(unknown).toHaveTextContent("Something New");
    expect(unknown.style.getPropertyValue("--badge")).toBe(colors.muted);
  });

  it("shows request statuses", () => {
    expect(badge(<RequestStatusBadge status="Pending" />)).toHaveTextContent("Pending");
    expect(badge(<RequestStatusBadge status="Completed" />).style.getPropertyValue("--badge")).toBe(colors.accent);
  });

  it("shows a priority, with a tooltip", () => {
    const high = badge(<PriorityBadge priority="High" />);
    expect(high).toHaveTextContent("High");
    expect(high).toHaveAttribute("title", "High priority");
  });

  it("turns audit action names into words and colours them by what happened", () => {
    expect(badge(<ActionBadge action="ASSET_CREATED" />)).toHaveTextContent("Asset created");
    expect(badge(<ActionBadge action="REQUEST_REJECTED" />).style.getPropertyValue("--badge")).toBe(colors.danger);
    expect(badge(<ActionBadge action="ASSET_UPDATED" />).style.getPropertyValue("--badge")).toBe(colors.primary);
    expect(badge(<ActionBadge action="SOMETHING_ODD" />).style.getPropertyValue("--badge")).toBe(colors.muted);
  });
});
