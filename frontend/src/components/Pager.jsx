import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pager({ page, pageCount, onChange, summary }) {
  return (
    <div className="pager">
      <span className="muted">{summary}</span>
      <div className="pager-buttons">
        <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 0} onClick={() => onChange(page - 1)}>
          <ChevronLeft size={16} /> Previous
        </button>
        <span className="pager-page">
          {page + 1}{pageCount ? ` / ${pageCount}` : ""}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pageCount ? page + 1 >= pageCount : false}
          onClick={() => onChange(page + 1)}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
