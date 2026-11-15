import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api/client.js";
import RequestModal from "./RequestModal.jsx";
import { ToastProvider } from "./Toasts.jsx";

// Three assets: two that can be moved and one that has been retired.
const GENERATOR = { asset_id: 1, asset_tag: "ENS-PH-GEN-001", name: "Generator", current_location: "Port Harcourt Hub", status: "Operational" };
const HILUX = { asset_id: 2, asset_tag: "ENS-ABJ-FLEET-12", name: "Hilux", current_location: "Abuja HQ", status: "Operational" };
const RETIRED = { asset_id: 3, asset_tag: "ENS-OLD-001", name: "Old pump", current_location: "Warri Yard", status: "Decommissioned" };

// The form's labels also contain hints and error messages, so they are found by how they start.
const field = (start) => screen.getByLabelText(new RegExp(`^${start}`));
const asset = () => field("Asset");
const from = () => field("From");
const to = () => field("To");
const submitButton = () => screen.getByRole("button", { name: "Raise request" });

// Draws the form and waits until the assets have loaded
async function openForm(props = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <RequestModal onClose={onClose} onSaved={onSaved} {...props} />
    </ToastProvider>,
  );
  await screen.findByLabelText(/^Asset/);
  return { user: userEvent.setup(), onClose, onSaved };
}

beforeEach(() => {
  vi.spyOn(api, "listAssets").mockResolvedValue([GENERATOR, HILUX, RETIRED]);
  vi.spyOn(api, "createRequest").mockResolvedValue({ request_id: 42 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RequestModal: choosing the asset", () => {
  it("offers the assets that can move, and not decommissioned ones", async () => {
    await openForm();
    const labels = Array.from(asset().options).map((option) => option.textContent);
    expect(labels).toEqual([
      "Choose an asset…",
      "ENS-PH-GEN-001 · Generator (Port Harcourt Hub)",
      "ENS-ABJ-FLEET-12 · Hilux (Abuja HQ)",
    ]);
  });

  it("fills in From with where the chosen asset is now", async () => {
    const { user } = await openForm();
    await user.selectOptions(asset(), "2");
    expect(from()).toHaveValue("Abuja HQ");
  });

  it("starts with the asset and From filled in when opened from an asset row", async () => {
    await openForm({ presetAsset: GENERATOR });
    expect(asset()).toHaveValue("1");
    expect(from()).toHaveValue("Port Harcourt Hub");
    await waitFor(() => expect(to()).toHaveFocus()); // the cursor waits in "To"
  });

  it("puts the cursor in the Asset list when nothing is chosen yet", async () => {
    await openForm();
    await waitFor(() => expect(asset()).toHaveFocus());
  });
});

describe("RequestModal: checking the form", () => {
  it("explains what is missing and sends nothing", async () => {
    const { user } = await openForm();
    await user.click(submitButton());

    expect(screen.getByText("Choose the asset to move.")).toBeInTheDocument();
    expect(screen.getByText("Enter where it moves from.")).toBeInTheDocument();
    expect(screen.getByText("Enter where it moves to.")).toBeInTheDocument();
    expect(api.createRequest).not.toHaveBeenCalled();
  });

  it("refuses a destination that is the same as the origin, ignoring capital letters", async () => {
    const { user } = await openForm({ presetAsset: GENERATOR });
    await user.type(to(), "port harcourt hub");
    await user.click(submitButton());

    expect(screen.getByText("The destination must be different from the origin.")).toBeInTheDocument();
    expect(api.createRequest).not.toHaveBeenCalled();
  });

  it("refuses an arrival that is before the departure", async () => {
    const { user } = await openForm({ presetAsset: GENERATOR });
    await user.type(to(), "Obagi Field Location");
    fireEvent.change(field("Departure"), { target: { value: "2026-11-20T10:00" } });
    fireEvent.change(field("Estimated arrival"), { target: { value: "2026-11-19T10:00" } });
    await user.click(submitButton());

    expect(screen.getByText("The arrival cannot be before the departure.")).toBeInTheDocument();
    expect(api.createRequest).not.toHaveBeenCalled();
  });

  it("clears a field's error as soon as the person types in it", async () => {
    const { user } = await openForm();
    await user.click(submitButton());
    expect(screen.getByText("Enter where it moves to.")).toBeInTheDocument();

    await user.type(to(), "O");

    expect(screen.queryByText("Enter where it moves to.")).not.toBeInTheDocument();
  });
});

describe("RequestModal: sending the request", () => {
  it("sends the request, tells the person, and reports the saved request", async () => {
    const { user, onSaved } = await openForm();
    await user.selectOptions(asset(), "1");
    await user.type(to(), "  Obagi Field Location  "); // spaces around it are removed
    await user.selectOptions(field("Priority"), "High");
    await user.type(field("Notes"), "Bring the permit");
    await user.click(submitButton());

    await waitFor(() => expect(api.createRequest).toHaveBeenCalledTimes(1));
    expect(api.createRequest).toHaveBeenCalledWith({
      asset_id: 1,
      origin: "Port Harcourt Hub",
      destination: "Obagi Field Location",
      priority: "High",
      notes: "Bring the permit",
    });
    expect(await screen.findByText("Request #42 was raised and is waiting for approval.")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith({ request_id: 42 });
  });

  it("includes the dates when they are filled in", async () => {
    const { user } = await openForm({ presetAsset: HILUX });
    await user.type(to(), "Lagos Depot");
    fireEvent.change(field("Departure"), { target: { value: "2026-11-20T10:00" } });
    fireEvent.change(field("Estimated arrival"), { target: { value: "2026-11-21T10:00" } });
    await user.click(submitButton());

    await waitFor(() => expect(api.createRequest).toHaveBeenCalledTimes(1));
    const body = api.createRequest.mock.calls[0][0];
    expect(body.departure_date).toMatch(/^2026-11-20T/);
    expect(body.estimated_arrival_date).toMatch(/^2026-11-21T/);
  });

  it("shows the server's message and lets the person try again", async () => {
    api.createRequest.mockRejectedValue(Object.assign(new Error("A decommissioned asset cannot be moved"), { status: 409 }));
    const { user, onSaved } = await openForm({ presetAsset: GENERATOR });
    await user.type(to(), "Obagi Field Location");
    await user.click(submitButton());

    expect(await screen.findByText("A decommissioned asset cannot be moved")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("shows no message for a 401, because the app logs the person out instead", async () => {
    api.createRequest.mockRejectedValue(Object.assign(new Error("Your session has expired."), { status: 401 }));
    const { user } = await openForm({ presetAsset: GENERATOR });
    await user.type(to(), "Obagi Field Location");
    await user.click(submitButton());

    await waitFor(() => expect(api.createRequest).toHaveBeenCalled());
    expect(screen.queryByText("Your session has expired.")).not.toBeInTheDocument();
  });

  it("closes without sending when Cancel is pressed", async () => {
    const { user, onClose } = await openForm();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(api.createRequest).not.toHaveBeenCalled();
  });
});

describe("RequestModal: when the assets cannot be loaded", () => {
  it("shows the problem, blocks sending, and recovers with Try again", async () => {
    api.listAssets.mockRejectedValueOnce(new Error("Cannot reach the Enersync server"));
    render(
      <ToastProvider>
        <RequestModal onClose={() => {}} onSaved={() => {}} />
      </ToastProvider>,
    );

    expect(await screen.findByText("Cannot reach the Enersync server")).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByLabelText(/^Asset/)).toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });
});
