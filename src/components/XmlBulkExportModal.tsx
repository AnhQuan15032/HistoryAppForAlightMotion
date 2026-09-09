import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAllErasXmlZip,
  estimateBulkExport,
  BulkCancelledError,
  type XmlBulkEstimate,
  type XmlBulkProgress,
  type XmlBulkResult,
} from "../utils/xmlBulkExport";
import { XML_FORMAT_INFO, type XmlExportFormat } from "../utils/xmlExport";
import { downloadBlob, formatBytes } from "../utils/fileDownload";
import type { MapProjection } from "../utils/geoCapture";

interface XmlBulkExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFormat: XmlExportFormat;
  projection: MapProjection;
  width: number;
  height: number;
  onOpenCacheManager?: () => void;
}

type Phase = "scanning" | "idle" | "running" | "zipping" | "done" | "error";

const DETAIL_OPTIONS = [
  { label: "Draft — max 120 points/ring (smallest ZIP)", value: 120 },
  { label: "Balanced — max 250 points/ring (recommended)", value: 250 },
  { label: "Fine — max 500 points/ring", value: 500 },
  { label: "Ultra — max 900 points/ring", value: 900 },
  { label: "Full detail — every vertex (very heavy!)", value: 0 },
];

export default function XmlBulkExportModal({
  isOpen,
  onClose,
  initialFormat,
  projection,
  width,
  height,
  onOpenCacheManager,
}: XmlBulkExportModalProps) {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [estimate, setEstimate] = useState<XmlBulkEstimate | null>(null);
  const [progress, setProgress] = useState<XmlBulkProgress | null>(null);
  const [result, setResult] = useState<XmlBulkResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [format, setFormat] = useState<XmlExportFormat>(initialFormat);
  const [maxPoints, setMaxPoints] = useState<number>(250);
  const [compression, setCompression] = useState<"fast" | "max">("max");
  const [includeManifest, setIncludeManifest] = useState<boolean>(true);
  const [mapColors, setMapColors] = useState<boolean>(true);
  const [countryFilter, setCountryFilter] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const scanTokenRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setFormat(initialFormat);
    }
  }, [isOpen, initialFormat]);

  // Cache-first scan: reads IndexedDB only, never the network
  const runScan = useCallback(async () => {
    const token = ++scanTokenRef.current;
    setPhase("scanning");
    setResult(null);
    setErrorMsg(null);
    try {
      const est = await estimateBulkExport(null, (p) => {
        if (scanTokenRef.current === token) setProgress(p);
      });
      if (scanTokenRef.current !== token) return;
      setEstimate(est);
      setPhase("idle");
    } catch (err) {
      if (scanTokenRef.current !== token) return;
      setErrorMsg((err as Error).message || "Failed to read the local cache");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (isOpen) runScan();
  }, [isOpen, runScan]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      scanTokenRef.current++;
    };
  }, []);

  const handleGenerate = async () => {
    if (!estimate || estimate.eras.length === 0 || phase === "running" || phase === "zipping") return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("running");
    setErrorMsg(null);
    setResult(null);

    try {
      const res = await buildAllErasXmlZip({
        format,
        maxPointsPerRing: maxPoints,
        width,
        height,
        projection,
        mapColors,
        fillColor: "#D4AF37",
        fillOpacity: 1,
        borderColor: "#FFFFFF",
        borderWidth: 0,
        includeManifest,
        countryFilter: countryFilter.trim() ? countryFilter : null,
        compression,
        signal: controller.signal,
        onProgress: (p) => {
          setProgress(p);
          setPhase(p.phase === "zip" ? "zipping" : "running");
        },
      });

      setResult(res);
      setPhase("done");
      downloadBlob(res.blob, res.filename);
    } catch (err) {
      const errorObj = err as Error;
      if (errorObj instanceof BulkCancelledError || errorObj.name === "AbortError") {
        setPhase("idle");
        setProgress(null);
        return;
      }
      setErrorMsg(errorObj.message || "Failed to generate the XML bundle");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  if (!isOpen) return null;

  const busy = phase === "running" || phase === "zipping";
  const suggestDraft =
    !!estimate && (maxPoints === 0 || maxPoints > 250) && estimate.estimatedFiles > 4000;
  const noCache = estimate !== null && estimate.eras.length === 0;
  const percent = progress?.percent ?? 0;

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn font-sans">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl bg-gray-900 border border-white/15 shadow-2xl overflow-hidden text-gray-100 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-lg">
              🌍
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight truncate">
                Download All XML — Every Country, Every Era
              </h2>
              <p className="text-[11px] text-gray-400 truncate">
                Cache-first · reads only eras already stored offline · one folder per country
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 flex flex-col gap-5">
          {/* Cache coverage */}
          <div className="rounded-2xl bg-gray-950/70 border border-white/10 p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                💾 Local era cache
              </span>
              <span className="font-mono text-[11px] text-gray-300">
                {estimate ? `${estimate.cachedEraCount} / ${estimate.totalEraCount} eras` : "—"}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-300"
                style={{
                  width: `${
                    estimate ? Math.round((estimate.cachedEraCount / estimate.totalEraCount) * 100) : 0
                  }%`,
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
              <span>
                {noCache
                  ? "Nothing cached yet — the exporter never downloads on its own."
                  : `${estimate?.cachedEraCount} era${estimate && estimate.cachedEraCount !== 1 ? "s" : ""} ready to export${
                      estimate && estimate.uncachedEraCount > 0
                        ? ` · ${estimate.uncachedEraCount} not cached yet`
                        : " · all eras cached 🎉"
                    }`}
              </span>
              {onOpenCacheManager && (
                <button
                  onClick={onOpenCacheManager}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-[10px] transition-colors cursor-pointer"
                >
                  ⚡ Cache more eras
                </button>
              )}
            </div>
          </div>

          {/* Scope summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                label: "Eras",
                value: phase === "scanning" ? "···" : String(estimate?.cachedEraCount ?? 0),
                icon: "🗓️",
              },
              {
                label: "Countries",
                value: phase === "scanning" ? "···" : String(estimate?.countries.length ?? 0),
                icon: "🏳️",
              },
              {
                label: "XML files",
                value:
                  phase === "scanning"
                    ? "···"
                    : result
                      ? String(result.files)
                      : `~${estimate?.estimatedFiles ?? 0}`,
                icon: "📄",
              },
              {
                label: "Surface",
                value: `${width}×${height}`,
                icon: "📐",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl bg-white/[0.03] border border-white/10 px-3 py-2.5 flex items-center gap-2.5"
              >
                <span className="text-lg shrink-0">{card.icon}</span>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase font-extrabold tracking-wider text-gray-500">
                    {card.label}
                  </p>
                  <p className="text-sm font-black text-amber-300 truncate font-mono">{card.value}</p>
                </div>
              </div>
            ))}
          </div>

          {estimate && estimate.estimatedFiles > 2500 && phase !== "scanning" && (
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 flex flex-col gap-2 text-[10px] text-gray-400 leading-relaxed">
              <p>
                📏 <strong className="text-gray-200">Large bundle:</strong>{" "}
                {estimate.estimatedFiles.toLocaleString()} XML files (~
                {Math.round((estimate.estimatedFiles * (maxPoints === 0 ? 19 : maxPoints > 300 ? 9 : 5.3) * 1024) / 1e6)}{" "}
                MB of XML before compression). On a phone this can take a minute or two and a chunk of RAM.
                Generation yields between eras so the UI stays responsive, and you can cancel any time.
              </p>
              {suggestDraft && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-amber-300">
                    ⚠️ At {maxPoints === 0 ? "full detail" : `${maxPoints} points/ring`} this may hit the
                    memory guard and stop early.
                  </span>
                  <button
                    onClick={() => setMaxPoints(120)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-[10px] transition-colors cursor-pointer"
                  >
                    Use Draft (120 pts)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Format picker */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
              🧬 XML format
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(XML_FORMAT_INFO) as XmlExportFormat[]).map((id) => {
                const info = XML_FORMAT_INFO[id];
                const active = format === id;
                return (
                  <button
                    key={id}
                    onClick={() => setFormat(id)}
                    disabled={busy}
                    className={`text-left rounded-2xl border p-3 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      active
                        ? "bg-amber-500/15 border-amber-400/60 ring-1 ring-amber-400/30"
                        : "bg-white/[0.03] border-white/10 hover:bg-white/[0.06]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-base">{info.icon}</span>
                      <span className={`text-xs font-bold ${active ? "text-amber-200" : "text-gray-200"}`}>
                        {info.label}
                      </span>
                      <span className="ml-auto font-mono text-[9px] text-gray-500">.{info.ext}</span>
                    </div>
                    <p className="text-[10px] leading-snug text-gray-400">{info.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Shape detail
              </span>
              <select
                value={maxPoints}
                onChange={(e) => setMaxPoints(parseInt(e.target.value, 10))}
                disabled={busy}
                className="rounded-lg bg-gray-800 border border-white/15 py-1.5 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
              >
                {DETAIL_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                ZIP compression
              </span>
              <select
                value={compression}
                onChange={(e) => setCompression(e.target.value as "fast" | "max")}
                disabled={busy}
                className="rounded-lg bg-gray-800 border border-white/15 py-1.5 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer disabled:opacity-50"
              >
                <option value="max">Maximum (DEFLATE level 9 — slower)</option>
                <option value="fast">Fast (DEFLATE level 6)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                Country filter (optional)
              </span>
              <input
                type="text"
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                disabled={busy}
                placeholder="e.g. France, England, Rome"
                className="rounded-lg bg-gray-800 border border-white/15 py-1.5 px-2.5 text-[11px] text-gray-200 placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
              />
            </label>

            <div className="flex flex-col justify-end gap-1.5 pb-0.5">
              <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mapColors}
                  onChange={(e) => setMapColors(e.target.checked)}
                  disabled={busy}
                  className="rounded accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Use map sovereignty colors</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeManifest}
                  onChange={(e) => setIncludeManifest(e.target.checked)}
                  disabled={busy}
                  className="rounded accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Include manifest.xml index</span>
              </label>
            </div>
          </div>

          {/* Progress */}
          {(busy || phase === "done") && (
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 flex flex-col gap-2 animate-fadeIn">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-gray-200">
                  {phase === "done" ? "✅ Bundle ready" : busy ? "⚙️ Generating…" : ""}
                </span>
                <span className="font-mono text-amber-300">
                  {phase === "done" ? `${result?.files ?? 0} files` : `${percent}%`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-200 ${
                    phase === "done"
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-300"
                      : "bg-gradient-to-r from-amber-500 to-amber-300"
                  }`}
                  style={{ width: `${phase === "done" ? 100 : percent}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400 truncate">
                {progress?.message ||
                  (result
                    ? `${result.countries} countries × ${result.eras} eras · ${formatBytes(result.rawBytes)} raw → ${formatBytes(result.zipBytes)} ZIP`
                    : "Reading local cache...")}
              </p>
              {result && result.truncated && (
                <p className="text-[10px] text-amber-300">
                  ⚠️ Stopped early to protect memory — lower the shape detail or add a country filter for the full set.
                </p>
              )}
              {result && result.skippedEras.length > 0 && (
                <p className="text-[10px] text-gray-500">
                  Skipped unreadable eras: {result.skippedEras.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {phase === "error" && errorMsg && (
            <div className="rounded-2xl bg-red-950/60 border border-red-500/40 p-3 text-xs font-semibold text-red-200 animate-slideIn">
              ❌ {errorMsg}
            </div>
          )}

          {noCache && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-[11px] text-amber-200 leading-relaxed">
              <strong>No cached eras found.</strong> This exporter is cache-first by design: it never
              fetches from GitHub while building the ZIP. Open the Cache Manager, press{" "}
              <em>Cache All Eras</em> (or import a <code>.hlmap</code> backup), then come back here.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 sm:px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <span className="text-[10px] text-gray-500 hidden sm:block">
            {format === "alight"
              ? "Unofficial AM-style preset layout · verify import on your app version"
              : format === "svg"
                ? "SVG files are XML documents — openable in any vector app"
                : "Degrees + baked pixels for every ring"}
          </span>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {phase === "done" && result && (
              <button
                onClick={() => downloadBlob(result.blob, result.filename)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-bold transition-all cursor-pointer"
              >
                <span>💾</span>
                <span>Save ZIP again</span>
              </button>
            )}

            {busy ? (
              <button
                onClick={handleCancel}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-bold transition-all cursor-pointer"
              >
                ✕ Cancel
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={phase === "scanning" || noCache}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-gray-950 text-xs font-extrabold shadow-lg shadow-emerald-500/25 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>📦</span>
                <span>Generate &amp; Download ZIP</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
