import { Eye, EyeOff, LoaderCircle, UserPlus } from "lucide-react";
import { useState } from "react";
import { api } from "../api/client.js";
import { ROLE_LABEL, ROLE_OPTIONS } from "../auth/roles.js";
import Field from "./Field.jsx";
import Modal from "./Modal.jsx";
import { useToast } from "./Toasts.jsx";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// The form a SuperAdmin uses to add a user
export default function UserModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", password: "", role: "FieldTechnician", location: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (name) => (event) => {
    setForm((current) => ({ ...current, [name]: event.target.value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  function validate() {
    const found = {};
    if (!form.first_name.trim()) found.first_name = "Enter a first name.";
    if (!form.last_name.trim()) found.last_name = "Enter a last name.";
    if (!EMAIL_PATTERN.test(form.email.trim())) found.email = "Enter a valid email address.";
    if (form.password.length < 8) found.password = "At least 8 characters.";
    else if (new TextEncoder().encode(form.password).length > 72) found.password = "This password is too long.";
    if (!form.location.trim()) found.location = "Enter a location.";
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
      const saved = await api.createUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        location: form.location.trim(),
      });
      toast.success(`${saved.first_name} ${saved.last_name} can now log in.`);
      onSaved(saved);
    } catch (problem) {
      if (problem.status !== 401) setServerError(problem.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add a user"
      subtitle="They can log in straight away with the password you set."
      onClose={onClose}
      width={620}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <UserPlus size={16} />}
            Add user
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} noValidate autoComplete="off">
        {serverError && (
          <div className="alert alert-error" role="alert">
            {serverError}
          </div>
        )}
        <fieldset disabled={busy} className="form-grid">
          <Field label="First name" error={errors.first_name}>
            <input value={form.first_name} onChange={set("first_name")} maxLength={50} />
          </Field>
          <Field label="Last name" error={errors.last_name}>
            <input value={form.last_name} onChange={set("last_name")} maxLength={50} />
          </Field>
          <Field label="Email" error={errors.email} className="form-wide">
            <input type="email" value={form.email} onChange={set("email")} maxLength={100} autoComplete="off" />
          </Field>
          <Field label="Password" error={errors.password} hint="At least 8 characters. Share it with them privately.">
            <div className="input-with-button">
              <input type={showPassword ? "text" : "password"} value={form.password} onChange={set("password")} autoComplete="new-password" />
              <button
                type="button"
                className="icon-btn"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={set("role")}>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location" error={errors.location} className="form-wide">
            <input value={form.location} onChange={set("location")} maxLength={100} placeholder="Abuja HQ" />
          </Field>
        </fieldset>
      </form>
    </Modal>
  );
}
