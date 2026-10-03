import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import Papa from "papaparse";
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { supabase } from "../services/supabaseClient";
import {
  MAX_ROWS,
  TEMPLATE_COLUMNS,
  TEMPLATE_CSV,
  csvCell,
  downloadCsv,
  normaliseKey,
  validateRows,
  type ParsedRow,
} from "../utils/shopImportCsv";

type ImportResult = {
  email: string;
  ok: boolean;
  shopId?: string;
  tempPassword?: string;
  generatedPassword?: boolean;
  error?: string;
};

type Step = "upload" | "preview" | "results";

interface AdminShopImportModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the page can refresh its shop list. */
  onImported: () => void;
}

const AdminShopImportModal: React.FC<AdminShopImportModalProps> = ({
  open,
  onClose,
  onImported,
}) => {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [rowLookup, setRowLookup] = useState<Record<string, ParsedRow>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.errors.length > 0), [rows]);
  const canImport = validRows.length > 0 && (invalidRows.length === 0 || skipInvalid);

  const succeeded = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setRows([]);
    setMissingColumns([]);
    setParseError(null);
    setSkipInvalid(false);
    setImporting(false);
    setImportError(null);
    setResults([]);
    setRowLookup({});
  };

  const handleClose = () => {
    if (importing) return; // don't abort a running import halfway
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    setParseError(null);
    setMissingColumns([]);
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => normaliseKey(header),
      complete: (parsed) => {
        const parseIssues = parsed.errors || [];
        const data = (parsed.data || []).filter((r) =>
          Object.values(r).some((v) => String(v ?? "").trim() !== ""),
        );

        if (data.length === 0) {
          setRows([]);
          setParseError(
            parseIssues[0]?.message
              ? `Could not read this CSV: ${parseIssues[0].message}`
              : "This CSV has no data rows.",
          );
          setStep("upload");
          return;
        }

        const { rows: validated, missingColumns: missing } = validateRows(data);

        if (validated.length > MAX_ROWS) {
          setRows([]);
          setParseError(
            `This file has ${validated.length} rows, but the limit is ${MAX_ROWS} per import. Split it into smaller files and import them one at a time.`,
          );
          setStep("upload");
          return;
        }

        setRows(validated);
        setMissingColumns(missing);
        setRowLookup(
          validated.reduce<Record<string, ParsedRow>>((acc, row) => {
            if (row.email) acc[row.email] = row;
            return acc;
          }, {}),
        );
        setStep("preview");
      },
      error: (err) => {
        setRows([]);
        setParseError(`Could not read this file: ${err?.message || "unknown error"}`);
      },
    });
  };

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setImportError(null);

    const payload = validRows.map((row) => ({
      email: row.email,
      name: row.name,
      shop_name: row.shop_name,
      shop_description: row.shop_description,
      shop_address: row.shop_address,
      shop_city: row.shop_city,
      shop_phone: row.shop_phone,
      // Omitted entirely when blank so the server generates a temp password.
      ...(row.password ? { password: row.password } : {}),
      latitude: row.latitude,
      longitude: row.longitude,
    }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");

      const response = await fetch("/api/import-shop-owners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rows: payload }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        throw new Error(body?.error || `Import failed (HTTP ${response.status}).`);
      }

      setResults(body.results || []);
      setStep("results");
      onImported();
    } catch (err: any) {
      setImportError(err?.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  const downloadResults = () => {
    const header = [
      "email",
      "name",
      "shop_name",
      "status",
      "shop_id",
      "temp_password",
      "error",
    ];
    const lines = results.map((result) => {
      const source = rowLookup[result.email];
      return [
        csvCell(result.email),
        csvCell(source?.name),
        csvCell(source?.shop_name),
        csvCell(result.ok ? "success" : "failed"),
        csvCell(result.shopId),
        // Only generated passwords are returned by the server.
        csvCell(result.ok ? result.tempPassword || "" : ""),
        csvCell(result.ok ? "" : result.error),
      ].join(",");
    });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`shop-owner-import-results-${stamp}.csv`, [header.join(","), ...lines].join("\n"));
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="dashboard-card w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-moto-gray shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-moto-accent/15 text-moto-accent flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 font-display uppercase tracking-wide">
                Import Shop Owners (CSV)
              </h3>
              <p className="text-[13px] text-slate-400 mt-0.5">
                Bulk-create owner accounts and their shops. New shops start as{" "}
                <span className="text-amber-400 font-semibold">Pending</span> and still need approval.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={importing}
            className="p-1.5 rounded-xl hover:bg-moto-gray/40 text-slate-300 hover:text-slate-200 transition disabled:opacity-40"
            aria-label="Close import dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {step === "upload" && (
            <div className="space-y-5">
              {/* Template */}
              <div className="p-4 bg-moto-darker border border-moto-gray rounded-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-slate-100">Step 1 — Get the template</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Columns: {TEMPLATE_COLUMNS.join(", ")}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadCsv("shop-owners-template.csv", TEMPLATE_CSV)}
                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-moto-accent/15 text-moto-accent text-[13px] font-bold rounded-xl hover:bg-moto-accent/25 transition"
                  >
                    <Download className="w-4 h-4" /> Download template
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                  <span className="text-slate-300 font-semibold">password</span> is optional — leave it
                  blank and a secure temporary password is generated and shown in the results
                  summary (and the results CSV) so you can pass it to the owner.
                  <br />
                  <span className="text-slate-300 font-semibold">latitude</span> /{" "}
                  <span className="text-slate-300 font-semibold">longitude</span> are optional — without
                  them the shop is created at 0,0 and the owner can drop a pin later in Shop Settings.
                </p>
              </div>

              {/* Picker */}
              <div className="p-4 bg-moto-darker border border-moto-gray rounded-xl">
                <p className="text-[13px] font-bold text-slate-100 mb-3">Step 2 — Choose your CSV</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // Reset so re-picking the same file fires onChange again.
                    e.target.value = "";
                    if (file) handleFile(file);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-moto-gray hover:border-moto-accent hover:bg-moto-accent/5 transition"
                >
                  <Upload className="w-6 h-6 text-moto-accent" />
                  <span className="text-sm font-bold text-slate-100">
                    {fileName || "Click to upload a .csv file"}
                  </span>
                  <span className="text-xs text-slate-400">
                    Up to {MAX_ROWS} rows per import. Header row required.
                  </span>
                </button>
              </div>

              {parseError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-[13px] flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-bold text-slate-100">
                    Step 3 — Review {rows.length} row{rows.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="text-emerald-400 font-bold">{validRows.length} ready</span>
                    {invalidRows.length > 0 && (
                      <>
                        {" · "}
                        <span className="text-red-400 font-bold">
                          {invalidRows.length} with errors
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="px-3.5 py-2 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
                >
                  Choose a different file
                </button>
              </div>

              {missingColumns.length > 0 && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-[13px] flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    Missing required column{missingColumns.length === 1 ? "" : "s"}:{" "}
                    <span className="font-mono font-bold">{missingColumns.join(", ")}</span>. Download
                    the template and copy your values into those columns.
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-moto-gray overflow-hidden">
                <div className="overflow-x-auto max-h-[45vh]">
                  <table className="w-full text-xs dashboard-table dashboard-table-dark">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="text-left">Row</th>
                        <th className="text-left">Email</th>
                        <th className="text-left">Owner</th>
                        <th className="text-left">Shop</th>
                        <th className="text-left">City</th>
                        <th className="text-left">Password</th>
                        <th className="text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.rowNumber}
                          className={row.errors.length > 0 ? "bg-red-500/5" : undefined}
                        >
                          <td className="text-slate-500 tabular-nums">{row.rowNumber}</td>
                          <td className="text-slate-200">{row.email || "—"}</td>
                          <td className="text-slate-200">{row.name || "—"}</td>
                          <td className="text-slate-200">{row.shop_name || "—"}</td>
                          <td className="text-slate-300">{row.shop_city || "—"}</td>
                          <td className="text-slate-400">
                            {row.password ? "Provided" : "Auto-generated"}
                          </td>
                          <td>
                            {row.errors.length === 0 ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                              </span>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1.5 text-red-400 font-bold">
                                  <XCircle className="w-3.5 h-3.5" /> Error
                                </span>
                                <ul className="mt-1 space-y-0.5">
                                  {row.errors.map((err) => (
                                    <li key={err} className="text-red-300/90">
                                      • {err}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {invalidRows.length > 0 && (
                <label className="flex items-start gap-2.5 text-[13px] text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={skipInvalid}
                    onChange={(e) => setSkipInvalid(e.target.checked)}
                    className="mt-0.5 accent-moto-accent"
                  />
                  <span>
                    Import the {validRows.length} valid row
                    {validRows.length === 1 ? "" : "s"} and skip the {invalidRows.length} with
                    errors. Leave unchecked to go back and fix the file.
                  </span>
                </label>
              )}

              {importError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-[13px] flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{importError}</span>
                </div>
              )}
            </div>
          )}

          {step === "results" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-moto-darker border border-moto-gray rounded-xl">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Imported</p>
                  <p className="text-2xl font-bold text-slate-100 tabular-nums">
                    {succeeded.length}
                  </p>
                </div>
                <div className="p-4 bg-moto-darker border border-moto-gray rounded-xl">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Failed</p>
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      failed.length > 0 ? "text-red-400" : "text-slate-100"
                    }`}
                  >
                    {failed.length}
                  </p>
                </div>
                <div className="p-4 bg-moto-darker border border-moto-gray rounded-xl">
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Generated passwords</p>
                  <p className="text-2xl font-bold text-moto-accent tabular-nums">
                    {succeeded.filter((r) => r.generatedPassword).length}
                  </p>
                </div>
              </div>

              {succeeded.some((r) => r.generatedPassword) && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 text-[13px] flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Temporary passwords were generated for{" "}
                    {succeeded.filter((r) => r.generatedPassword).length} owner
                    {succeeded.filter((r) => r.generatedPassword).length === 1 ? "" : "s"}.
                    Download the results CSV now and send each owner their password — it is not shown
                    anywhere else.
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-moto-gray overflow-hidden">
                <div className="overflow-x-auto max-h-[40vh]">
                  <table className="w-full text-xs dashboard-table dashboard-table-dark">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="text-left">Email</th>
                        <th className="text-left">Shop</th>
                        <th className="text-left">Result</th>
                        <th className="text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result) => (
                        <tr key={result.email}>
                          <td className="text-slate-200">{result.email}</td>
                          <td className="text-slate-200">
                            {rowLookup[result.email]?.shop_name || "—"}
                          </td>
                          <td>
                            {result.ok ? (
                              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Success
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-red-400 font-bold">
                                <XCircle className="w-3.5 h-3.5" /> Failed
                              </span>
                            )}
                          </td>
                          <td className="text-slate-300">
                            {result.ok ? (
                              <>
                                {result.tempPassword ? (
                                  <span className="font-mono text-moto-accent">
                                    {result.tempPassword}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">
                                    Password from CSV · awaiting approval
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-red-300">{result.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-moto-gray flex flex-wrap items-center justify-between gap-3 shrink-0">
          {step === "upload" && (
            <>
              <p className="text-xs text-slate-400">
                The shop list refreshes automatically after a successful import.
              </p>
              <button
                onClick={handleClose}
                className="px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
              >
                Cancel
              </button>
            </>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={handleClose}
                disabled={importing}
                className="px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !canImport}
                className="px-4 py-2.5 bg-moto-accent hover:opacity-90 text-slate-950 text-[13px] font-bold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing {validRows.length} owner{validRows.length === 1 ? "" : "s"}…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    {invalidRows.length > 0 && skipInvalid
                      ? `Import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"}`
                      : `Import ${validRows.length} owner${validRows.length === 1 ? "" : "s"}`}
                  </>
                )}
              </button>
            </>
          )}

          {step === "results" && (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2.5 bg-moto-gray/40 hover:bg-moto-gray/60 text-slate-200 text-[13px] font-bold rounded-xl transition"
              >
                Close
              </button>
              <button
                onClick={downloadResults}
                className="px-4 py-2.5 bg-moto-accent hover:opacity-90 text-slate-950 text-[13px] font-bold rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
              >
                <Download className="w-4 h-4" /> Download results CSV
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default AdminShopImportModal;