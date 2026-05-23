/* /import — dedicated data import page.
   Walks the user through three steps: download template, edit, upload.
   On successful upload, the listings persist (via localStorage) and
   show up on the triage page on next visit. */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Icon } from "../components/Icon";
import { Topbar } from "../components/Primitives";
import { downloadTemplate, parseUploadedFile } from "../lib/csv";
import { usePersistedState } from "../lib/usePersistedState";

export default function ImportPage() {
  const router = useRouter();
  const fileRef = useRef(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filename, setFilename] = useState("");
  // Staged listings — parsed but not yet persisted. The user has to
  // explicitly Submit before they overwrite the active dataset.
  const [stagedListings, setStagedListings] = useState(null);
  const [dragging, setDragging] = useState(false);

  // Same persistence keys as the main page — uploaded listings flow there
  // automatically once written.
  const [, setUploadedListings] = usePersistedState("opptra-uploaded", null);
  const [, setUploadedFilename] = usePersistedState("opptra-uploaded-name", null);
  const [, setApprovalsBySku] = usePersistedState("opptra-approvals", {});
  const [, setAppliedBySku] = usePersistedState("opptra-applied", {});
  const [, setSkippedBySku] = usePersistedState("opptra-skipped", {});
  const [, setAiBySku] = usePersistedState("opptra-ai-cache", {});

  // Parse only — never persists. User reviews the count + errors, then
  // hits Submit (handleSubmit) to commit.
  const handleFile = useCallback(async (file) => {
    setErrors([]);
    setStagedListings(null);
    setFilename(file.name);
    setLoading(true);
    try {
      const { listings, errors } = await parseUploadedFile(file);
      setErrors(errors || []);
      if (listings.length > 0) setStagedListings(listings);
    } catch (err) {
      setErrors([err?.message || "Failed to parse file."]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Commit step — persists the staged listings, wipes stale state for the
  // previous dataset, and navigates to the triage page.
  const handleSubmit = useCallback(() => {
    if (!stagedListings || stagedListings.length === 0) return;
    setSubmitting(true);
    setUploadedListings(stagedListings);
    setUploadedFilename(filename);
    setApprovalsBySku({});
    setAppliedBySku({});
    setSkippedBySku({});
    setAiBySku({});
    router.push("/");
  }, [stagedListings, filename, router, setUploadedListings, setUploadedFilename, setApprovalsBySku, setAppliedBySku, setSkippedBySku, setAiBySku]);

  const clearStaged = () => {
    setStagedListings(null);
    setFilename("");
    setErrors([]);
  };

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

  const onResetDemo = () => {
    setUploadedListings(null);
    setUploadedFilename(null);
    setApprovalsBySku({});
    setAppliedBySku({});
    setSkippedBySku({});
    setFilename("");
    setStagedListings(null);
    setErrors([]);
  };

  return (
    <div className="app">
      <Topbar/>

      <main className="page import-page">
        <div className="import-hero">
          <h1>Import pricing data</h1>
          <p>
            Drop in your CSV or XLSX of SKU × marketplace listings. We&apos;ll synthesize
            competitor stacks and 30-day price history per row, then send everything to
            the triage page where the AI generates recommendations.
          </p>
        </div>

        <div className="import-section">
          <h2>Three steps</h2>
          <div className="import-steps">
            <div className="import-step">
              <div className="import-step__num">1</div>
              <div className="import-step__body">
                <div className="import-step__title">Download a template</div>
                <div className="import-step__desc">
                  Pre-filled with the 8 SKUs from the case study so you can upload it back unchanged to see the demo,
                  or edit it to bring your own data.
                </div>
                <div className="import-step__actions">
                  <button className="btn btn--outlined btn--sm" onClick={() => downloadTemplate("xlsx")}>
                    <Icon name="download" size={12}/> XLSX template
                  </button>
                  <button className="btn btn--outlined btn--sm" onClick={() => downloadTemplate("csv")}>
                    <Icon name="download" size={12}/> CSV template
                  </button>
                </div>
              </div>
            </div>

            <div className="import-step">
              <div className="import-step__num">2</div>
              <div className="import-step__body">
                <div className="import-step__title">Edit in Excel / Sheets</div>
                <div className="import-step__desc">
                  Required columns: <code>sku · brand · marketplace · our_price · competitor_price · buy_box · margin_floor · last_changed</code>.
                  Optional: <code>name · category · listed_at</code> (ISO date or yyyy-mm-dd).
                  Buy-box accepts Won/Lost (or Yes/No). Marketplace accepts Amazon India, Noon UAE, Flipkart.
                </div>
              </div>
            </div>

            <div className="import-step">
              <div className="import-step__num">3</div>
              <div className="import-step__body">
                <div className="import-step__title">Upload</div>
                <div className="import-step__desc">
                  Drop your file below. We&apos;ll parse it and replace the demo dataset.
                </div>

                <div
                  className={"upload-drop " + (dragging ? "upload-drop--active" : "")}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={onPick}
                  style={{marginTop: 12}}
                >
                  <Icon name="download" size={28} color="var(--sx-primary)"/>
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

                {stagedListings && (
                  <div className="upload-staged">
                    <div className="upload-staged__head">
                      <Icon name="checkCircle" size={16}/>
                      <span>
                        <strong>{stagedListings.length}</strong> listings parsed from {filename}.
                        Click <strong>Submit</strong> to replace the active dataset and go to triage.
                      </span>
                    </div>
                    <div className="upload-staged__actions">
                      <button className="btn btn--ghost" onClick={clearStaged} disabled={submitting}>
                        Pick a different file
                      </button>
                      <button className="btn btn--primary btn--lg" onClick={handleSubmit} disabled={submitting}>
                        <Icon name="check" size={14}/>
                        {submitting ? "Submitting…" : `Submit ${stagedListings.length} listings`}
                      </button>
                    </div>
                  </div>
                )}

                {errors.length > 0 && (
                  <div className="upload-errors">
                    <div className="upload-errors__title">
                      <Icon name="alert" size={12}/> {errors.length} row{errors.length > 1 ? "s" : ""} couldn&apos;t be imported
                    </div>
                    <ul>
                      {errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                      {errors.length > 8 && <li>… and {errors.length - 8} more.</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="import-section">
          <h2>Reset</h2>
          <div className="import-step__desc">
            Revert to the built-in 8-SKU case-study dataset. This clears any uploaded data and pending approvals.
          </div>
          <div className="import-step__actions" style={{marginTop: 8}}>
            <button className="btn btn--outlined btn--sm" onClick={onResetDemo}>
              <Icon name="refresh" size={12}/> Reset to demo data
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => router.push("/")}>
              <Icon name="arrowRight" size={12}/> Back to triage
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
