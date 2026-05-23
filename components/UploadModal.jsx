/* Upload modal — CSV / XLSX file picker with template download.
   Shows parse errors inline; lets the user roll back to demo data. */

import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { downloadTemplate, parseUploadedFile } from "../lib/csv";

export function UploadModal({ open, onCancel, onLoaded, onResetDemo }) {
  const fileRef = useRef(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filename, setFilename] = useState("");
  const [dragging, setDragging] = useState(false);

  if (!open) return null;

  async function handleFile(file) {
    setErrors([]);
    setFilename(file.name);
    setLoading(true);
    try {
      const { listings, errors } = await parseUploadedFile(file);
      setErrors(errors || []);
      if (listings.length > 0) {
        onLoaded(listings, file.name);
      }
    } catch (err) {
      setErrors([err?.message || "Failed to parse file."]);
    } finally {
      setLoading(false);
    }
  }

  const onPick = () => fileRef.current?.click();
  const onChange = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <div className="modal-scrim" onClick={onCancel}>
      <div className="modal upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">Import SKU data</div>
        <div className="modal__desc">
          Drop in your pricing sheet — CSV or XLSX. We&apos;ll generate competitor stacks and 30-day price history for each row.
        </div>

        <div
          className={"upload-drop " + (dragging ? "upload-drop--active" : "")}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={onPick}
        >
          <Icon name="download" size={26} color="var(--sx-primary)"/>
          <div className="upload-drop__title">
            {filename ? `Selected: ${filename}` : "Drop a file or click to browse"}
          </div>
          <div className="upload-drop__hint">.csv or .xlsx · max ~1 MB</div>
          <input
            type="file"
            ref={fileRef}
            accept=".csv,.xlsx,.xls"
            onChange={onChange}
            style={{display: "none"}}
          />
        </div>

        {loading && <div className="upload-loading">Parsing…</div>}

        {errors.length > 0 && (
          <div className="upload-errors">
            <div className="upload-errors__title">
              <Icon name="alert" size={12}/> {errors.length} row{errors.length > 1 ? "s" : ""} couldn&apos;t be imported
            </div>
            <ul>
              {errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
              {errors.length > 6 && <li>… and {errors.length - 6} more.</li>}
            </ul>
          </div>
        )}

        <div className="upload-template">
          <div className="upload-template__title">First time? Start with a template.</div>
          <div className="upload-template__desc">
            Pre-filled with the 8 SKUs from the case study so you can upload and triage immediately.
          </div>
          <div className="upload-template__actions">
            <button className="btn btn--outlined btn--sm" onClick={() => downloadTemplate("xlsx")}>
              <Icon name="download" size={12}/> Download XLSX template
            </button>
            <button className="btn btn--outlined btn--sm" onClick={() => downloadTemplate("csv")}>
              <Icon name="download" size={12}/> Download CSV template
            </button>
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onResetDemo}>Reset to demo data</button>
          <span className="spacer"></span>
          <button className="btn btn--ghost" onClick={onCancel}>Close</button>
        </div>
      </div>
    </div>
  );
}
