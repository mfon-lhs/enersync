import { LoaderCircle, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api/client.js";
import Field from "./Field.jsx";
import Modal from "./Modal.jsx";
import { ErrorState, LoadingRows } from "./States.jsx";
import { useToast } from "./Toasts.jsx";
import { fromLocalInputValue } from "../lib/format.js";
import { useAsync } from "../lib/hooks.js";
import { PRIORITY } from "../theme.js";

const PRIORITIES = Object.keys(PRIORITY);

// The form for raising a new logistics request
export default function RequestModal({ onClose, onSaved }) {
  const toast = useToast();
  const { data: assets, error, loading, reload } = useAsync(api.listAssets, []);

  const [form, setForm] = useState({
    asset_id: "",
    origin: "",
    destination: "",
    priority: "Normal",
    departure_date: "",
    estimated_arrival_date: "",
    notes: "",
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  // A decommissioned asset cannot be moved (the backend refuses it too)
  const movable = useMemo(() => (assets || []).filter((a) => a.status !== "Decommissioned"), [assets]);

  const set = (name) => (event) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  // Picking an asset fills in "from" with where the asset is now
  function pickAsset(event) {
    const assetId = event.target.value;
    const asset = movable.find((a) => String(a.asset_id) === assetId);
    setForm((current) => ({ ...current, asset_id: assetId, origin: asset ? asset.current_location : current.origin }));
    setErrors((current) => ({ ...current, asset_id: undefined, origin: undefined }));
  }

  function validate() {
    const found = {};
    if (!form.asset_id) found.asset_id = "Choose the asset to move.";
    if (!form.origin.trim()) found.origin = "Enter where it moves from.";
    if (!form.destination.trim()) found.destination = "Enter where it moves to.";
    else if (form.destination.trim().toLowerCase() === form.origin.trim().toLowerCase()) {
      found.destination = "The destination must be different from the origin.";
    }
    if (form.departure_date && form.estimated_arrival_date && new Date(form.estimated_arrival_date) < new Date(form.departure_date)) {
      found.estimated_arrival_date = "The arrival cannot be before the departure.";
    }
    return found;
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setBusy(true);
    setServerError("");
    try {
      const body = {
        asset_id: Number(form.asset_id),
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        priority: form.priority,
      };
      const departure = fromLocalInputValue(form.departure_date);
      const arrival = fromLocalInputValue(form.estimated_arrival_date);
      if (departure) body.departure_date = departure;
      if (arrival) body.estimated_arrival_date = arrival;
      if (form.notes.trim()) body.notes = form.notes.trim();

      const saved = await api.createRequest(body);
      toast.success(`Request #${saved.request_id} was raised and is waiting for approval.`);
      onSaved(saved);
    } catch (problem) {
      if (problem.status !== 401) setServerError(problem.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Raise a logistics request"
      subtitle="Ask for an asset to be moved. A manager approves it before it goes ahead."
      onClose={onClose}
      width={720}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="request-form" className="btn btn-primary" disabled={busy || loading || !!error}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />}
            Raise request
          </button>
        </>
      }
    >
      {loading ? (
        <LoadingRows rows={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <form id="request-form" onSubmit={submit} noValidate>
          {serverError && (
            <div className="alert alert-error" role="alert">
              {serverError}
            </div>
          )}
          <fieldset disabled={busy} className="form-grid">
            <Field label="Asset" error={errors.asset_id} className="form-wide">
              <select value={form.asset_id} onChange={pickAsset}>
                <option value="">Choose an asset…</option>
                {movable.map((asset) => (
                  <option key={asset.asset_id} value={asset.asset_id}>
                    {asset.asset_tag} · {asset.name} ({asset.current_location})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From" error={errors.origin}>
              <input value={form.origin} onChange={set("origin")} maxLength={100} />
            </Field>
            <Field label="To" error={errors.destination}>
              <input value={form.destination} onChange={set("destination")} maxLength={100} />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={set("priority")}>
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY[value].label}
                  </option>
                ))}
              </select>
            </Field>
            <span className="form-spacer" aria-hidden="true" />
            <Field label="Departure" hint="Optional">
              <input type="datetime-local" value={form.departure_date} onChange={set("departure_date")} />
            </Field>
            <Field label="Estimated arrival" hint="Optional" error={errors.estimated_arrival_date}>
              <input type="datetime-local" value={form.estimated_arrival_date} onChange={set("estimated_arrival_date")} />
            </Field>
            <Field label="Notes" hint="Why is this move needed?" className="form-wide">
              <textarea rows={3} value={form.notes} onChange={set("notes")} />
            </Field>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
