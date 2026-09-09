/**
 * Bulk Vector XML Export — every country, every cached era, one ZIP.
 * ---------------------------------------------------------------------------
 * CACHE-FIRST BY DESIGN: this module never touches the network. It reads the
 * IndexedDB / LRU basemap cache (see geoCacheDb) and exports an XML document
 * per country per cached era, grouped into one folder per country.
 *
 * Generated XML documents use the exact same projection + fit math as the
 * Capture Studio canvas, and rings can be stride-decimated so a full 54-era
 * bundle stays a sane size.
 */

import JSZip from "jszip";
import { BASE_URL, YEARS } from "../data/years";
import { getAllCachedKeys, getCachedGeoJson } from "./geoCacheDb";
import { getDatasetCountryGeometries, type MapProjection } from "./geoCapture";
import { getFeatureName } from "./countryFilter";
import { getColorForName } from "./colors";
import {
  buildXmlDocument,
  escapeXml,
  GENERATOR_NAME,
  GENERATOR_VERSION,
  sanitizeFilePart,
  XML_FORMAT_INFO,
  type XmlExportFormat,
} from "./xmlExport";

export interface CachedEra {
  key: string;
  filename: string;
  year: number;
  label: string;
  isCustom: boolean;
  cached: true;
}

export interface XmlBulkProgress {
  phase: "scan" | "build" | "zip";
  eraIndex: number;
  eraTotal: number;
  eraLabel: string;
  files: number;
  estimatedFiles: number;
  rawBytes: number;
  percent: number;
  message: string;
}

export interface XmlBulkOptions {
  format: XmlExportFormat;
  maxPointsPerRing: number;
  width: number;
  height: number;
  projection: MapProjection;
  mapColors: boolean;
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
  includeManifest: boolean;
  countryFilter?: string | null;
  compression?: "fast" | "max";
  maxTotalBytes?: number;
  onProgress?: (p: XmlBulkProgress) => void;
  signal?: AbortSignal;
}

export interface XmlBulkEstimate {
  eras: CachedEra[];
  cachedEraCount: number;
  totalEraCount: number;
  uncachedEraCount: number;
  countries: string[];
  estimatedFiles: number;
  eraCountryCounts: Array<{ era: CachedEra; countries: number }>;
}

export interface XmlBulkResult {
  blob: Blob;
  filename: string;
  files: number;
  countries: number;
  eras: number;
  rawBytes: number;
  zipBytes: number;
  skippedEras: string[];
  truncated: boolean;
}

export class BulkCancelledError extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "BulkCancelledError";
  }
}

/**
 * All eras that are ALREADY in the offline cache (memory or IndexedDB).
 * No fetch() here — this is the "cache first" contract.
 */
export async function listCachedEras(): Promise<CachedEra[]> {
  const keys = await getAllCachedKeys();
  const eras: CachedEra[] = [];
  const seen = new Set<string>();

  keys.forEach((key) => {
    const filename = key.startsWith("http") ? key.replace(BASE_URL, "") : key;
    if (!filename || seen.has(filename)) return;
    seen.add(filename);

    const known = YEARS.find((y) => y.filename === filename);
    if (known) {
      eras.push({
        key,
        filename,
        year: known.year,
        label: known.label,
        isCustom: false,
        cached: true,
      });
      return;
    }

    // Custom/imported datasets count as extra eras too
    const label = filename.replace(/\.(geo)?json$/i, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    eras.push({
      key,
      filename,
      year: Number.MAX_SAFE_INTEGER,
      label: `import_${label}`,
      isCustom: true,
      cached: true,
    });
  });

  eras.sort((a, b) => a.year - b.year || a.label.localeCompare(b.label));
  return eras;
}

/** Same name resolution the build phase uses, so the estimate always matches the output */
function countryNamesOf(geoJsonData: unknown): string[] {
  const data = geoJsonData as { features?: Array<{ properties?: Record<string, unknown> | null }> };
  if (!data || !Array.isArray(data.features)) return [];
  const names = new Set<string>();
  data.features.forEach((f) => {
    const name = getFeatureName(f?.properties);
    if (name) names.add(name);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Cheap pre-scan used to show scope + an accurate file estimate BEFORE generating.
 * Reads each cached era once, keeps only country names in memory.
 */
export async function estimateBulkExport(
  countryFilter?: string | null,
  onProgress?: (p: XmlBulkProgress) => void
): Promise<XmlBulkEstimate> {
  const eras = await listCachedEras();
  const filterSet = buildFilterSet(countryFilter);

  const allCountries = new Set<string>();
  const eraCountryCounts: Array<{ era: CachedEra; countries: number }> = [];
  let estimatedFiles = 0;

  for (let i = 0; i < eras.length; i++) {
    onProgress?.({
      phase: "scan",
      eraIndex: i,
      eraTotal: eras.length,
      eraLabel: eras[i].label,
      files: 0,
      estimatedFiles: 0,
      rawBytes: 0,
      percent: eras.length === 0 ? 100 : Math.round((i / eras.length) * 100),
      message: `Scanning cached era ${eras[i].label}...`,
    });

    const data = await getCachedGeoJson(eras[i].key);
    const names = countryNamesOf(data).filter(
      (n) => !filterSet || matchesFilter(n, filterSet)
    );

    eraCountryCounts.push({ era: eras[i], countries: names.length });
    estimatedFiles += names.length;
    names.forEach((n) => allCountries.add(n));

    // Yield so the UI can repaint between IndexedDB reads
    await new Promise((r) => setTimeout(r, 0));
  }

  const countries = Array.from(allCountries).sort((a, b) => a.localeCompare(b));

  return {
    eras,
    cachedEraCount: eras.length,
    totalEraCount: YEARS.length,
    uncachedEraCount: Math.max(0, YEARS.length - eras.filter((e) => !e.isCustom).length),
    countries,
    estimatedFiles,
    eraCountryCounts,
  };
}

function buildFilterSet(countryFilter?: string | null): string[] | null {
  if (!countryFilter) return null;
  const parts = countryFilter
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return parts.length > 0 ? parts : null;
}

function matchesFilter(name: string, filterSet: string[]): boolean {
  const target = name.trim().toLowerCase();
  return filterSet.some((f) => target === f || target.includes(f));
}

/**
 * Generates `<Country>/<Era>.xml` for every country in every cached era and packs
 * them into a single ZIP with an optional manifest.xml + README.txt.
 */
export async function buildAllErasXmlZip(opts: XmlBulkOptions): Promise<XmlBulkResult> {
  const eras = await listCachedEras();
  if (eras.length === 0) {
    throw new Error(
      "No cached eras found. Open the Cache Manager and run 'Cache All Eras' first, then try again."
    );
  }

  const ext = XML_FORMAT_INFO[opts.format].ext;
  const filterSet = buildFilterSet(opts.countryFilter);
  // Keeps the bundle inside a phone browser working set; generation stops cleanly past this.
  const maxBytes = opts.maxTotalBytes ?? 150 * 1024 * 1024;
  const zip = new JSZip();

  let files = 0;
  let rawBytes = 0;
  let truncated = false;
  const countrySet = new Set<string>();
  const filesPerCountry = new Map<string, string[]>();
  const eraFileCounts = new Map<string, number>();
  const skippedEras: string[] = [];

  for (let i = 0; i < eras.length; i++) {
    if (opts.signal?.aborted) throw new BulkCancelledError();

    const era = eras[i];
    opts.onProgress?.({
      phase: "build",
      eraIndex: i + 1,
      eraTotal: eras.length,
      eraLabel: era.label,
      files,
      estimatedFiles: 0,
      rawBytes,
      percent: Math.round((i / eras.length) * 90),
      message: `Writing XML for ${era.label}...`,
    });

    const data = await getCachedGeoJson(era.key);
    const fc = data as { type?: string; features?: unknown } | null;
    if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
      skippedEras.push(era.label);
      continue;
    }

    const shapes = getDatasetCountryGeometries(data);
    const eraFileLabel = sanitizeFilePart(era.label);

    for (const [name, entry] of shapes) {
      if (truncated) break;
      if (opts.signal?.aborted) throw new BulkCancelledError();
      if (!entry.polygons || entry.polygons.length === 0) continue;
      if (filterSet && !matchesFilter(name, filterSet)) continue;

      const built = buildXmlDocument({
        format: opts.format,
        countryName: name,
        sovereign: entry.sovereign,
        yearLabel: era.label,
        year: era.isCustom ? null : era.year,
        polygons: entry.polygons,
        projection: opts.projection,
        width: opts.width,
        height: opts.height,
        paddingRatio: 0.12,
        showTitle: false,
        fillColor: opts.mapColors ? getColorForName(name) : opts.fillColor,
        fillOpacity: opts.fillOpacity,
        borderColor: opts.borderColor,
        borderWidth: opts.borderWidth,
        backgroundColor: "transparent",
        maxPointsPerRing: opts.maxPointsPerRing,
      });

      if (!built) continue;

      const countryDir = sanitizeFilePart(name);
      const path = `${countryDir}/${eraFileLabel}.${ext}`;
      zip.file(path, built.xml);

      files++;
      rawBytes += built.bytes;
      countrySet.add(name);
      eraFileCounts.set(era.label, (eraFileCounts.get(era.label) || 0) + 1);
      const list = filesPerCountry.get(name);
      if (list) list.push(path);
      else filesPerCountry.set(name, [path]);

      if (rawBytes > maxBytes) truncated = true;

      if (files % 40 === 0) {
        opts.onProgress?.({
          phase: "build",
          eraIndex: i + 1,
          eraTotal: eras.length,
          eraLabel: era.label,
          files,
          estimatedFiles: 0,
          rawBytes,
          percent: Math.round(((i + 1) / eras.length) * 90),
          message: `${files} XML files written (${era.label})`,
        });
        // Let the browser breathe so progress UI stays alive on mobile
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    opts.onProgress?.({
      phase: "build",
      eraIndex: i + 1,
      eraTotal: eras.length,
      eraLabel: era.label,
      files,
      estimatedFiles: 0,
      rawBytes,
      percent: Math.round(((i + 1) / eras.length) * 90),
      message: `Done: ${era.label} · ${files} files so far`,
    });
  }

  if (files === 0) {
    throw new Error(
      filterSet
        ? "No countries matched that filter inside the cached eras."
        : "No country geometry found in the cached eras."
    );
  }

  if (opts.includeManifest) {
    zip.file("manifest.xml", buildManifestXml(opts, filesPerCountry, eraFileCounts, eras, files, rawBytes));
  }
  zip.file("README.txt", buildReadme(opts, files, countrySet.size, eras.length, ext));

  let zipBytes = 0;
  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: opts.compression === "max" ? 9 : 6 },
      streamFiles: true,
    },
    (meta) => {
      opts.onProgress?.({
        phase: "zip",
        eraIndex: eras.length,
        eraTotal: eras.length,
        eraLabel: "Compressing archive",
        files,
        estimatedFiles: files,
        rawBytes,
        percent: 90 + Math.round((meta.percent / 100) * 10),
        message: `Compressing ${files} XML files... ${Math.round(meta.percent)}%`,
      });
    }
  );

  zipBytes = blob.size;

  const stamp = new Date().toISOString().slice(0, 10);
  return {
    blob,
    filename: `HistoryApp_XML_${opts.format}_${countrySet.size}countries_${eras.length}eras_${stamp}.zip`,
    files,
    countries: countrySet.size,
    eras: eras.length,
    rawBytes,
    zipBytes,
    skippedEras,
    truncated,
  };
}

function buildManifestXml(
  opts: XmlBulkOptions,
  filesPerCountry: Map<string, string[]>,
  eraFileCounts: Map<string, number>,
  eras: CachedEra[],
  files: number,
  rawBytes: number
): string {
  const MAX_MANIFEST_ENTRIES = 20000;
  const countries = Array.from(filesPerCountry.keys()).sort((a, b) => a.localeCompare(b));

  const countryBlocks: string[] = [];
  let emitted = 0;
  for (const name of countries) {
    const list = filesPerCountry.get(name) || [];
    if (emitted + list.length > MAX_MANIFEST_ENTRIES) {
      countryBlocks.push(
        `    <country name="${escapeXml(name)}" files="${list.length}" truncated="true"/>`
      );
      emitted += 1;
      continue;
    }
    countryBlocks.push(
      `    <country name="${escapeXml(name)}" files="${list.length}">\n` +
        list.map((p) => `      <file>${escapeXml(p)}</file>`).join("\n") +
        `\n    </country>`
    );
    emitted += list.length;
  }

  const eraBlocks = eras.map((era) => {
    const count = eraFileCounts.get(era.label) || 0;
    return `    <era label="${escapeXml(era.label)}" year="${
      era.isCustom ? "custom" : era.year
    }" source="${escapeXml(era.filename)}" files="${count}"/>`;
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!--`,
    `  ${GENERATOR_NAME} v${GENERATOR_VERSION} - bulk vector XML manifest`,
    `  Cache-first export: only eras already stored offline were used, no network requests.`,
    `-->`,
    `<historyXmlBundle version="1" generator="${escapeXml(GENERATOR_NAME)}" generatorVersion="${escapeXml(
      GENERATOR_VERSION
    )}" exportedAt="${new Date().toISOString()}">`,
    `  <settings format="${opts.format}" formatLabel="${escapeXml(
      XML_FORMAT_INFO[opts.format].label
    )}" projection="${opts.projection}" canvasWidth="${opts.width}" canvasHeight="${
      opts.height
    }" maxPointsPerRing="${opts.maxPointsPerRing || "full"}" mapColors="${
      opts.mapColors ? "true" : "false"
    }" fillColor="${escapeXml(opts.fillColor)}" fillOpacity="${pct3(
      opts.fillOpacity
    )}" borderColor="${escapeXml(opts.borderColor)}" borderWidth="${pct3(opts.borderWidth)}"/>`,
    `  <totals countries="${countries.length}" eras="${eras.length}" xmlFiles="${files}" rawBytes="${rawBytes}"/>`,
    `  <layout>One folder per country: Country/Era.${XML_FORMAT_INFO[opts.format].ext}</layout>`,
    `  <eras count="${eras.length}">`,
    eraBlocks.join("\n"),
    `  </eras>`,
    `  <countries count="${countries.length}">`,
    countryBlocks.join("\n"),
    `  </countries>`,
    `</historyXmlBundle>`,
    ``,
  ].join("\n");
}

function pct3(n: number): string {
  return Number(n.toFixed(3)).toString();
}

function buildReadme(
  opts: XmlBulkOptions,
  files: number,
  countries: number,
  eras: number,
  ext: string
): string {
  const info = XML_FORMAT_INFO[opts.format];
  return [
    `${GENERATOR_NAME} — bulk vector XML export`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `Contents: ${files} ${info.label} files · ${countries} countries/regions · ${eras} cached eras`,
    `Layout:     one folder per country -> Country/${`\u003Cera\u003E`}.${ext} (e.g. France/1492_AD.${ext})`,
    `Manifest:   manifest.xml (machine readable index of every file, era and country)`,
    ``,
    `Scope (cache-first):`,
    `  Only eras already stored in this browser's offline cache were exported - no network`,
    `  requests were made. Cache more eras from the Cache Manager and re-run to widen the bundle.`,
    ``,
    `Vector settings:`,
    `  Format .............. ${info.label} (${info.desc})`,
    `  Projection .......... ${opts.projection} (baked into pixel coordinates)`,
    `  Surface ............. ${opts.width}x${opts.height}`,
    `  Vertices per ring ... ${opts.maxPointsPerRing > 0 ? `max ${opts.maxPointsPerRing} (stride decimated)` : "full detail"}`,
    `  Land color .......... ${opts.mapColors ? "per-country map sovereignty color" : opts.fillColor}`,
    ``,
    `Tip: re-open Capture Studio, pick the same projection + output size and download a single`,
    `country to get an identical file for just that region.`,
    ``,
  ].join("\n");
}
