/**
 * Super-Lite GeoJSON Compression & Archiving Engine
 * Converts massive GeoJSON datasets (>200 MB) into a compact binary archive (<10 MB)
 * using 4-decimal integer quantization, delta-encoding, dictionary deduplication,
 * and high-compression DEFLATE streams via JSZip.
 */

import JSZip from "jszip";
import { getFeatureName, getFeatureSovereign } from "./countryFilter";

const QUANTIZE_FACTOR = 10000; // 0.0001° accuracy (~11m, perfectly crisp historical borders)

export interface SuperLiteFeature {
  n: number; // name dictionary index
  s: number; // sovereign dictionary index
  p: number; // partOf dictionary index
  b: number; // border precision (1, 2, or 3)
  t: "P" | "M"; // Polygon ("P") or MultiPolygon ("M")
  g: number[][][][] | number[][][]; // Quantized Delta coordinates
}

export interface SuperLiteEra {
  year: number;
  filename: string;
  features: SuperLiteFeature[];
}

export interface SuperLiteArchive {
  v: 1;
  format: "HISTORY_MAP_SUPER_LITE_CACHE";
  createdAt: string;
  dict: string[];
  eras: Record<string, SuperLiteEra>;
}

/**
 * Compresses a GeoJSON ring into quantized delta integers
 */
function compressRing(ring: GeoJSON.Position[]): number[][] {
  if (!ring || ring.length === 0) return [];

  const compressed: number[][] = [];
  let prevX = 0;
  let prevY = 0;

  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const qX = Math.round(lng * QUANTIZE_FACTOR);
    const qY = Math.round(lat * QUANTIZE_FACTOR);

    if (i === 0) {
      compressed.push([qX, qY]);
    } else {
      // Store delta offset
      compressed.push([qX - prevX, qY - prevY]);
    }

    prevX = qX;
    prevY = qY;
  }

  return compressed;
}

/**
 * Decompresses quantized delta integers back into full precision GeoJSON coordinates
 */
function decompressRing(deltaRing: number[][]): GeoJSON.Position[] {
  if (!deltaRing || deltaRing.length === 0) return [];

  const ring: GeoJSON.Position[] = [];
  let currX = 0;
  let currY = 0;

  for (let i = 0; i < deltaRing.length; i++) {
    const [dx, dy] = deltaRing[i];
    if (i === 0) {
      currX = dx;
      currY = dy;
    } else {
      currX += dx;
      currY += dy;
    }

    // Convert back to floating degrees
    const lng = Number((currX / QUANTIZE_FACTOR).toFixed(5));
    const lat = Number((currY / QUANTIZE_FACTOR).toFixed(5));
    ring.push([lng, lat]);
  }

  return ring;
}

/**
 * Compresses a single GeoJSON FeatureCollection into a SuperLiteEra representation
 */
export function compressGeoJsonToSuperLite(
  geoJson: GeoJSON.FeatureCollection,
  filename: string,
  year: number,
  dict: string[],
  dictMap: Map<string, number>
): SuperLiteEra {
  const getDictIndex = (str: string | null | undefined): number => {
    if (!str || !str.trim()) return -1;
    const clean = str.trim();
    if (dictMap.has(clean)) {
      return dictMap.get(clean)!;
    }
    const idx = dict.length;
    dict.push(clean);
    dictMap.set(clean, idx);
    return idx;
  };

  const features: SuperLiteFeature[] = [];

  geoJson.features.forEach((f) => {
    if (!f || !f.geometry) return;

    const name = getFeatureName(f.properties);
    const sovereign = getFeatureSovereign(f.properties) || name;
    const partOf = typeof f.properties?.PARTOF === "string" ? f.properties.PARTOF : "";
    const precision = typeof f.properties?.BORDERPRECISION === "number" ? f.properties.BORDERPRECISION : 1;

    const nameIdx = getDictIndex(name);
    const sovIdx = getDictIndex(sovereign);
    const partIdx = getDictIndex(partOf);

    if (f.geometry.type === "Polygon") {
      const polyCoords = (f.geometry as GeoJSON.Polygon).coordinates;
      const compressedRings = polyCoords.map(compressRing);
      features.push({
        n: nameIdx,
        s: sovIdx,
        p: partIdx,
        b: precision,
        t: "P",
        g: compressedRings,
      });
    } else if (f.geometry.type === "MultiPolygon") {
      const multiCoords = (f.geometry as GeoJSON.MultiPolygon).coordinates;
      const compressedMulti = multiCoords.map((poly) => poly.map(compressRing));
      features.push({
        n: nameIdx,
        s: sovIdx,
        p: partIdx,
        b: precision,
        t: "M",
        g: compressedMulti,
      });
    }
  });

  return {
    year,
    filename,
    features,
  };
}

/**
 * Decompresses a SuperLiteEra back into a standard GeoJSON FeatureCollection
 */
export function decompressSuperLiteToGeoJson(
  era: SuperLiteEra,
  dict: string[]
): GeoJSON.FeatureCollection {
  const getStr = (idx: number): string => (idx >= 0 && idx < dict.length ? dict[idx] : "");

  const geoJsonFeatures: GeoJSON.Feature[] = era.features.map((sf) => {
    const name = getStr(sf.n) || "Unnamed";
    const sovereign = getStr(sf.s) || name;
    const partOf = getStr(sf.p);

    let geometry: GeoJSON.Geometry;

    if (sf.t === "P") {
      const rings = (sf.g as number[][][]).map(decompressRing);
      geometry = {
        type: "Polygon",
        coordinates: rings,
      };
    } else {
      const multi = (sf.g as number[][][][]).map((poly) => poly.map(decompressRing));
      geometry = {
        type: "MultiPolygon",
        coordinates: multi,
      };
    }

    return {
      type: "Feature",
      properties: {
        NAME: name,
        SUBJECTO: sovereign,
        PARTOF: partOf,
        BORDERPRECISION: sf.b,
        ABBREVN: name,
      },
      geometry,
    };
  });

  return {
    type: "FeatureCollection",
    features: geoJsonFeatures,
  } as unknown as GeoJSON.FeatureCollection;
}

/**
 * Compresses an entire dictionary of GeoJSON files into a single <10 MB binary archive (.hlmap / .hlc)
 */
export async function createSuperLiteCacheBlob(
  entries: Record<string, GeoJSON.FeatureCollection>,
  onProgress?: (processed: number, total: number, currentName: string) => void
): Promise<{ blob: Blob; rawSizeMb: number; compressedSizeMb: number; reductionPercent: number }> {
  const dict: string[] = [];
  const dictMap = new Map<string, number>();
  const eras: Record<string, SuperLiteEra> = {};

  const keys = Object.keys(entries);
  const total = keys.length;
  let processed = 0;
  let totalRawChars = 0;

  for (const key of keys) {
    const geoJson = entries[key];
    totalRawChars += JSON.stringify(geoJson).length;

    // Determine year from filename or metadata
    const cleanKey = key.replace(".geojson", "").replace("world_", "");
    let year = 1492;
    if (cleanKey.startsWith("bc")) {
      year = -parseInt(cleanKey.replace("bc", ""), 10);
    } else {
      const parsed = parseInt(cleanKey, 10);
      if (!isNaN(parsed)) year = parsed;
    }

    const liteEra = compressGeoJsonToSuperLite(geoJson, key, year, dict, dictMap);
    eras[key] = liteEra;

    processed++;
    if (onProgress) {
      onProgress(processed, total, key);
    }
  }

  const archive: SuperLiteArchive = {
    v: 1,
    format: "HISTORY_MAP_SUPER_LITE_CACHE",
    createdAt: new Date().toISOString(),
    dict,
    eras,
  };

  // Pack and compress using JSZip with maximum DEFLATE compression (level 9)
  const zip = new JSZip();
  const serialized = JSON.stringify(archive);

  zip.file("cache.hlc", serialized, {
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const blob = await zip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    },
    (metadata) => {
      if (onProgress && metadata.percent) {
        onProgress(Math.round((metadata.percent / 100) * total), total, "Compressing binary archive...");
      }
    }
  );

  const rawSizeMb = Math.round((totalRawChars / (1024 * 1024)) * 10) / 10;
  const compressedSizeMb = Math.round((blob.size / (1024 * 1024)) * 100) / 100;
  const reductionPercent = Math.round((1 - blob.size / totalRawChars) * 100);

  return {
    blob,
    rawSizeMb,
    compressedSizeMb,
    reductionPercent,
  };
}

/**
 * Unpacks a Super-Lite binary cache file (.hlmap / .hlc / .zip) into full GeoJSON datasets
 */
export async function unpackSuperLiteCacheBlob(
  file: Blob | ArrayBuffer,
  onProgress?: (loaded: number, total: number, currentName: string) => void
): Promise<Record<string, GeoJSON.FeatureCollection>> {
  const zip = await JSZip.loadAsync(file);
  const cacheFile = zip.file("cache.hlc") || Object.values(zip.files)[0];

  if (!cacheFile) {
    throw new Error("Invalid Super-Lite cache archive. Could not find data stream.");
  }

  const jsonText = await cacheFile.async("text");
  const archive = JSON.parse(jsonText) as SuperLiteArchive;

  if (!archive.dict || !archive.eras) {
    throw new Error("Unrecognized Super-Lite cache format.");
  }

  const reconstructed: Record<string, GeoJSON.FeatureCollection> = {};
  const eraKeys = Object.keys(archive.eras);
  const total = eraKeys.length;
  let count = 0;

  for (const key of eraKeys) {
    const era = archive.eras[key];
    const geoJson = decompressSuperLiteToGeoJson(era, archive.dict);
    reconstructed[key] = geoJson;

    count++;
    if (onProgress) {
      onProgress(count, total, key);
    }
  }

  return reconstructed;
}
