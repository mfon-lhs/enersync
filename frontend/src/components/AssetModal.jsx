import { LoaderCircle, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../api/client.js";
import Field from "./Field.jsx";
import Modal from "./Modal.jsx";
import { useToast } from "./Toasts.jsx";
import { fromLocalInputValue, toLocalInputValue } from "../lib/format.js";
import { ASSET_STATUS } from "../theme.js";

const STATUS_OPTIONS = Object.keys(ASSET_STATUS);

const BLANK = {
  asset_tag: "ENS-",
  name: "",
  category: "",
  status: "Operational",
  current_location: "",
  last_inspected_at: "",
  utilization_pct: "0",
  inspection_interval_days: "90",
  capacity_value: "",
  capacity_unit: "",
  latitude: "",
  longitude: "",
  is_critical: false,
};

const text = (value) => (value === null || value === undefined ? "" : String(value));

function assetToForm(asset) {
  return {
    asset_tag: asset.asset_tag,
    name: asset.name,
    category: asset.category,
    status: asset.status,
    current_location: asset.current_location,
    last_inspected_at: toLocalInputValue(asset.last_inspected_at),
    utilization_pct: text(asset.utilization_pct),
    inspection_interval_days: text(asset.inspection_interval_days),
    capacity_value: text(asset.capacity_value),
    capacity_unit: text(asset.capacity_unit),
    latitude: text(asset.latitude),
    longitude: text(asset.longitude),
    is_critical: asset.is_critical,
  };
}

const numberOrNull = (value) => (value.trim() === "" ? null : Number(value));

// The values exactly as the API wants them
function formToValues(form) {
  return {
    name: form.name.trim(),
    category: form.category.trim(),
    status: form.status,
    current_location: form.current_location.trim(),
    last_inspected_at: fromLocalInputValue(form.last_inspected_at),
    utilization_pct: Number(form.utilization_pct),
    inspection_interval_days: Number(form.inspection_interval_days),
    capacity_value: numberOrNull(form.capacity_value),
    capacity_unit: form.capacity_unit.trim() === "" ? null : form.capacity_unit.trim(),
    latitude: numberOrNull(form.latitude),
    longitude: numberOrNull(form.longitude),
    is_critical: form.is_critical,
  };
}

// Checks the form the same way the backend does, so the person sees a clear message next to the field.
function validate(form, creating) {
  const errors = {};
  if (creating) {
    const tag = form.asset_tag.trim();
    if (!tag.startsWith("ENS-")) errors.asset_tag = 'The tag must start with "ENS-".';
    else if (tag.length > 20 || tag.length < 5) errors.asset_tag = "Use 5 to 20 characters, like ENS-PH-PUMP-042.";
  }
  if (!form.name.trim()) errors.name = "Enter a name.";
  if (form.name.length > 100) errors.name = "At most 100 characters.";
  if (!form.category.trim()) errors.category = "Enter a category.";
  if (form.category.length > 50) errors.category = "At most 50 characters.";
  if (!form.current_location.trim()) errors.current_location = "Enter a location.";
  if (form.current_location.length > 100) errors.current_location = "At most 100 characters.";

  const util = Number(form.utilization_pct);
  if (form.utilization_pct.trim() === "" || Number.isNaN(util) || util < 0 || util > 100) {
    errors.utilization_pct = "A number from 0 to 100.";
  }
  const interval = Number(form.inspection_interval_days);
  if (!Number.isInteger(interval) || interval < 1 || interval > 3650) {
    errors.inspection_interval_days = "A whole number of days, 1 to 3650.";
  }

  const hasValue = form.capacity_value.trim() !== "";
  const hasUnit = form.capacity_unit.trim() !== "";
  if (hasValue && (Number.isNaN(Number(form.capacity_value)) || Number(form.capacity_value) < 0)) {
    errors.capacity_value = "A number, 0 or more.";
  } else if (hasValue !== hasUnit) {
    errors[hasValue ? "capacity_unit" : "capacity_value"] = "Capacity needs both a value and a unit.";
  }
  if (form.capacity_unit.length > 20) errors.capacity_unit = "At most 20 characters.";

  const hasLat = form.latitude.trim() !== "";
  const hasLon = form.longitude.trim() !== "";
  const lat = Number(form.latitude);
  const lon = Number(form.longitude);
  if (hasLat && (Number.isNaN(lat) || lat < -90 || lat > 90)) errors.latitude = "A number from -90 to 90.";
  if (hasLon && (Number.isNaN(lon) || lon < -180 || lon > 180)) errors.longitude = "A number from -180 to 180.";
  if (hasLat !== hasLon) errors[hasLat ? "longitude" : "latitude"] = "Position needs both latitude and longitude.";
  return errors;
}

// mode: "create", "edit" or "view" (view is read-only, for roles that may not change assets)
export default function AssetModal({ mode, asset, categories, locations, onClose, onSaved }) {
  const toast = useToast();
  const creating = mode === "create";
  const readOnly = mode === "view";
  const initial = useMemo(() => (asset ? assetToForm(asset) : BLANK), [asset]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (name) => (event) => {
    const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  async function submit(event) {
    event.preventDefault();
    if (busy || readOnly) return;
    const found = validate(form, creating);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const values = formToValues(form);
    setBusy(true);
    setServerError("");
    try {
      let saved;
      if (creating) {
        saved = await api.createAsset({ asset_tag: form.asset_tag.trim(), ...values });
        toast.success(`${saved.asset_tag} was added to the fleet.`);
      } else {
        // Send only what changed, so the audit log shows exactly what the person edited
        const before = formToValues(initial);
        const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== before[key]));
        if (Object.keys(changes).length === 0) {
          onClose();
          return;
        }
        saved = await api.updateAsset(asset.asset_id, changes);
        toast.success(`${saved.asset_tag} was updated.`);
      }
      onSaved(saved);
    } catch (problem) {
      if (problem.status !== 401) setServerError(problem.message);
      setBusy(false);
    }
  }

  const title = creating ? "Add an asset" : readOnly ? asset.name : `Edit ${asset.asset_tag}`;
  const subtitle = creating
    ? "Register new equipment in the fleet."
    : readOnly
      ? `${asset.asset_tag} · your role can view assets but not change them`
      : asset.name;

  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button type="submit" form="asset-form" className="btn btn-primary" disabled={busy}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}
              {creating ? "Add asset" : "Save changes"}
            </button>
          )}
        </>
      }
    >
      <form id="asset-form" onSubmit={submit} noValidate>
        {serverError && (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        )}
        <fieldset disabled={readOnly || busy} className="form-grid">
          <Field label="Asset tag" error={errors.asset_tag} hint="Starts with ENS-, for example ENS-PH-PUMP-042">
            <input value={form.asset_tag} onChange={set("asset_tag")} readOnly={!creating} maxLength={20} className="mono" />
          </Field>
          <Field label="Name" error={errors.name}>
            <input value={form.name} onChange={set("name")} maxLength={100} />
          </Field>
          <Field label="Category" error={errors.category}>
            <input value={form.category} onChange={set("category")} list="category-options" maxLength={50} />
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={set("status")}>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {ASSET_STATUS[status].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Current location" error={errors.current_location}>
            <input value={form.current_location} onChange={set("current_location")} list="location-options" maxLength={100} />
          </Field>
          <Field label="Last inspected" hint="Leave empty if never inspected">
            <input type="datetime-local" value={form.last_inspected_at} onChange={set("last_inspected_at")} />
          </Field>
          <Field label="Utilisation (%)" error={errors.utilization_pct}>
            <input type="number" min="0" max="100" step="any" value={form.utilization_pct} onChange={set("utilization_pct")} />
          </Field>
          <Field label="Inspection every (days)" error={errors.inspection_interval_days}>
            <input type="number" min="1" max="3650" step="1" value={form.inspection_interval_days} onChange={set("inspection_interval_days")} />
          </Field>
          <Field label="Capacity" error={errors.capacity_value}>
            <input type="number" min="0" step="any" value={form.capacity_value} onChange={set("capacity_value")} placeholder="500" />
          </Field>
          <Field label="Capacity unit" error={errors.capacity_unit}>
            <input value={form.capacity_unit} onChange={set("capacity_unit")} placeholder="kVA" maxLength={20} />
          </Field>
          <Field label="Latitude" error={errors.latitude}>
            <input type="number" step="any" value={form.latitude} onChange={set("latitude")} placeholder="4.8156" />
          </Field>
          <Field label="Longitude" error={errors.longitude}>
            <input type="number" step="any" value={form.longitude} onChange={set("longitude")} placeholder="7.0498" />
          </Field>
          <label className="check form-wide">
            <input type="checkbox" checked={form.is_critical} onChange={set("is_critical")} />
            <span>
              <b>Critical asset</b>
              <small className="muted"> Operations cannot run without it, so it is flagged on the dashboard when at risk.</small>
            </span>
          </label>
        </fieldset>
        <datalist id="category-options">
          {categories.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
        <datalist id="location-options">
          {locations.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </form>
    </Modal>
  );
}
