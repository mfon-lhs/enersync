import { LoaderCircle } from "lucide-react";
import Modal from "./Modal.jsx";

// "Are you sure?" for actions that cannot be undone.
export default function ConfirmDialog({ title, children, confirmLabel, tone = "primary", busy, error, onConfirm, onCancel }) {
  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onCancel}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`btn btn-${tone}`} onClick={onConfirm} disabled={busy} data-autofocus>
            {busy && <LoaderCircle size={16} className="spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="confirm-text">{children}</div>
    </Modal>
  );
}
