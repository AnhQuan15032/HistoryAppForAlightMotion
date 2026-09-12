/**
 * Capture Studio Image Library persistence
 * ---------------------------------------------------------------------------
 * Stores user-imported image assets (as data URLs) in IndexedDB so the whole
 * library survives page reloads and app restarts ("rejoin"). A single record
 * holds the full asset list — every update is one atomic put.
 *
 * - `loadImageAssets()`   : read the persisted library (resolves [] when empty)
 * - `saveImageAssets()`   : replace the persisted library (rejects on quota)
 * - `createAssetFromFile()`: turns an imported File into a persistent asset
 * - `loadLayerStack()`    : read the persisted Capture Studio layer stack
 * - `saveLayerStack()`    : replace the persisted layer stack (rejects on quota)
 */

import type { LayerStackSnapshot } from "./studioLayers";
import { sanitizeStoredStack } from "./studioLayers";

export interface ImageAsset {
  /** Stable unique id (used for default-marking / removal) */
  id: string;
  /** Display name (original file name without extension) */
  name: string;
  /** The image itself, as a data URL (what is persisted) */
  dataUrl: string;
  width: number;
  height: number;
  addedAt: number;
  /** Marked as default → auto-loaded when the Capture Studio opens */
  isDefault: boolean;
}

const DB_NAME = "CaptureStudioLibrary";
const STORE_NAME = "image_assets";
const RECORD_KEY = "library";
const STACK_KEY = "layer_stack";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          dbPromise = null;
          resolve(null);
        };
      } catch {
        dbPromise = null;
        resolve(null);
      }
    });
  }

  return dbPromise;
}

/**
 * Reads the persisted image library. Resolves with [] when IndexedDB is
 * unavailable or empty (never throws).
 */
export async function loadImageAssets(): Promise<ImageAsset[]> {
  try {
    const db = await openDb();
    if (!db) return [];

    const record = await new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(RECORD_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (!record || typeof record !== "object") return [];
    const assets = (record as { assets?: unknown }).assets;
    if (!Array.isArray(assets)) return [];

    return assets.filter(
      (a): a is ImageAsset =>
        !!a &&
        typeof a === "object" &&
        typeof (a as ImageAsset).id === "string" &&
        typeof (a as ImageAsset).dataUrl === "string" &&
        String((a as ImageAsset).dataUrl).startsWith("data:")
    );
  } catch {
    return [];
  }
}

/**
 * Replaces the persisted image library. Rejects (e.g. quota exceeded) so the
 * caller can surface a warning; resolves silently when IndexedDB is missing
 * (in-memory-only session in that case).
 */
export async function saveImageAssets(assets: ImageAsset[]): Promise<void> {
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ version: 1, assets }, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save image library"));
      tx.onabort = () => reject(tx.error ?? new Error("Failed to save image library"));
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to save image library"));
    }
  });
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `img_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/* ------------------------------------------------------------------ */
/* Layer stack persistence (Capture Studio multi-image layer editor)   */
/* ------------------------------------------------------------------ */

/**
 * Reads the persisted layer stack. Resolves with null when IndexedDB is
 * unavailable or the record is missing/corrupt (never throws).
 */
export async function loadLayerStack(): Promise<LayerStackSnapshot | null> {
  try {
    const db = await openDb();
    if (!db) return null;

    const record = await new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(STACK_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (!record || typeof record !== "object") return null;
    const r = record as { layers?: unknown; selectedLayerId?: unknown; fillColor?: unknown; fillOpacity?: unknown };

    const layers = sanitizeStoredStack(r.layers);
    if (!layers) return null;

    const selectedLayerId =
      typeof r.selectedLayerId === "string" && layers.some((l) => l.id === r.selectedLayerId)
        ? r.selectedLayerId
        : layers.some((l) => l.kind === "image")
          ? layers[layers.length - 1].id
          : "layer_country";

    const fillColor = typeof r.fillColor === "string" && r.fillColor.startsWith("#") ? r.fillColor : "#D4AF37";
    const fillOpacity =
      typeof r.fillOpacity === "number" && Number.isFinite(r.fillOpacity)
        ? Math.max(0, Math.min(1, r.fillOpacity))
        : 0.95;

    return { layers, selectedLayerId, fillColor, fillOpacity };
  } catch {
    return null;
  }
}

/**
 * Replaces the persisted layer stack. Rejects (e.g. quota exceeded) so the
 * caller can surface a warning; resolves silently when IndexedDB is missing.
 */
export async function saveLayerStack(snapshot: LayerStackSnapshot): Promise<void> {
  const db = await openDb();
  if (!db) return;

  await new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(
        {
          version: 1,
          layers: snapshot.layers,
          selectedLayerId: snapshot.selectedLayerId,
          fillColor: snapshot.fillColor,
          fillOpacity: snapshot.fillOpacity,
        },
        STACK_KEY
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save layer stack"));
      tx.onabort = () => reject(tx.error ?? new Error("Failed to save layer stack"));
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to save layer stack"));
    }
  });
}

/**
 * Converts an imported image File into a persistent ImageAsset.
 * Returns null when the file cannot be read.
 */
export async function createAssetFromFile(file: File): Promise<ImageAsset | null> {
  let dataUrl: string;
  try {
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
  } catch {
    return null;
  }
  if (!dataUrl.startsWith("data:")) return null;

  const size = await new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });

  return {
    id: makeId(),
    name: file.name.replace(/\.[^.]+$/, "").trim() || "Image",
    dataUrl,
    width: size.width,
    height: size.height,
    addedAt: Date.now(),
    isDefault: false,
  };
}
