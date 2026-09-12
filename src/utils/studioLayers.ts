/**
 * Capture Studio Layer Model
 * ---------------------------------------------------------------------------
 * A CapCut-style layer stack for the Capture Studio:
 *
 *   - zero or more IMAGE layers (each with its own transform + mask toggle)
 *   - exactly one COUNTRY layer (the selected region's territory fill)
 *
 * The array is ordered BOTTOM → TOP (index 0 is the back-most layer).
 * The UI displays it reversed (front-most first, like CapCut).
 *
 * Every image layer's `src` is a data URL, so the whole stack is persistable
 * (saved to IndexedDB alongside the image library — survives reload/rejoin).
 */
import type { ImageFilterEffect, ImageFitMode, LayerShadowSpec } from "./geoCapture";

/** Stable id of the single country layer in the stack */
export const COUNTRY_LAYER_ID = "layer_country";

export interface StudioLayer {
  id: string;
  kind: "image" | "country";
  name: string;
  /** Hidden layers are skipped in rendering (masking still uses the shape) */
  visible: boolean;

  // --- image layers only ---
  /** Data URL of the image (persistable) */
  src?: string;
  /** Reference to a persisted library asset, when it comes from one */
  assetId?: string;
  fitMode?: ImageFitMode;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  opacity?: number;
  filterEffect?: ImageFilterEffect;
  /** Composite (blend) mode vs everything beneath this layer ("source-over" = normal) */
  blendMode?: GlobalCompositeOperation;
  /** Mirror-repeat the image as a texture instead of stretching it (fit mode ignored) */
  tile?: boolean;
  /** Drop shadow cast by this layer (null/absent = off) */
  shadow?: LayerShadowSpec | null;
  /** Mask (clip) this layer to the selected country's territory */
  clipToLand?: boolean;
}

/** Snapshot of the full studio state that is persisted across reloads */
export interface LayerStackSnapshot {
  layers: StudioLayer[]; // bottom → top
  selectedLayerId: string | null;
  fillColor: string; // country layer fill
  fillOpacity: number; // country layer fill opacity
}

const FIT_MODES: ImageFitMode[] = ["cover", "contain", "stretch", "manual"];
const FILTERS: ImageFilterEffect[] = [
  "none",
  "grayscale",
  "sepia",
  "vintage",
  "high-contrast",
  "invert",
];

/**
 * Canvas composite (blend) modes available per layer.
 * The CSS/SVG equivalents use the same names, except "source-over" = "normal".
 */
export const BLEND_MODES: GlobalCompositeOperation[] = [
  "source-over",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
];

export function makeLayerId(): string {
  try {
    return `layer_${crypto.randomUUID()}`;
  } catch {
    return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function createCountryLayer(): StudioLayer {
  return { id: COUNTRY_LAYER_ID, kind: "country", name: "Country Layer", visible: true };
}

export function createImageLayer(src: string, name: string, assetId?: string): StudioLayer {
  return {
    id: makeLayerId(),
    kind: "image",
    name: name || "Image",
    src,
    assetId,
    visible: true,
    fitMode: "cover",
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    opacity: 1,
    filterEffect: "none",
    blendMode: "source-over",
    tile: false,
    clipToLand: true, // masked to territory — the classic look
  };
}

/**
 * Normalizes a stack so it contains EXACTLY ONE country layer.
 * The country keeps its position in the stack when possible.
 */
export function normalizeStack(layers: StudioLayer[]): StudioLayer[] {
  const hasCountry = layers.some((l) => l.kind === "country");
  if (hasCountry) {
    // Keep a single country layer at its original position
    const firstCountryIdx = layers.findIndex((l) => l.kind === "country");
    const country = layers[firstCountryIdx];
    const rest = layers.filter((l) => l.kind !== "country");
    const next = [...rest];
    next.splice(Math.min(firstCountryIdx, rest.length), 0, country);
    return next;
  }
  // No country layer yet — it goes at the BOTTOM (classic masked look: images on top)
  return [createCountryLayer(), ...layers];
}

/** Sanitizes a stored layer shadow (missing fields → sensible defaults) */
function sanitizeShadow(raw: unknown): LayerShadowSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;
  const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  return {
    color: typeof s.color === "string" && s.color.startsWith("#") ? s.color : "#000000",
    opacity: finite(s.opacity) ? Math.max(0, Math.min(1, s.opacity)) : 0.5,
    blur: finite(s.blur) ? Math.max(0, Math.min(100, s.blur)) : 24,
    offsetX: finite(s.offsetX) ? Math.max(-50, Math.min(50, s.offsetX)) : 0,
    offsetY: finite(s.offsetY) ? Math.max(-50, Math.min(50, s.offsetY)) : 12,
  };
}

/**
 * Validates + sanitizes a persisted stack coming from storage.
 * Returns null when the payload is unusable.
 */
export function sanitizeStoredStack(raw: unknown): StudioLayer[] | null {
  if (!Array.isArray(raw)) return null;
  const layers: StudioLayer[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const l = item as Partial<StudioLayer>;

    if (l.kind === "image" && typeof l.src === "string" && l.src.startsWith("data:")) {
      layers.push({
        id: typeof l.id === "string" && l.id ? l.id : makeLayerId(),
        kind: "image",
        name: typeof l.name === "string" && l.name.trim() ? l.name : "Image",
        src: l.src,
        assetId: typeof l.assetId === "string" ? l.assetId : undefined,
        visible: l.visible !== false,
        fitMode: FIT_MODES.includes(l.fitMode as ImageFitMode) ? (l.fitMode as ImageFitMode) : "cover",
        scale: typeof l.scale === "number" && Number.isFinite(l.scale) ? l.scale : 1,
        offsetX: typeof l.offsetX === "number" && Number.isFinite(l.offsetX) ? l.offsetX : 0,
        offsetY: typeof l.offsetY === "number" && Number.isFinite(l.offsetY) ? l.offsetY : 0,
        rotation: typeof l.rotation === "number" && Number.isFinite(l.rotation) ? l.rotation : 0,
        opacity:
          typeof l.opacity === "number" && Number.isFinite(l.opacity)
            ? Math.max(0, Math.min(1, l.opacity))
            : 1,
        filterEffect: FILTERS.includes(l.filterEffect as ImageFilterEffect)
          ? (l.filterEffect as ImageFilterEffect)
          : "none",
        blendMode: BLEND_MODES.includes(l.blendMode as GlobalCompositeOperation)
          ? (l.blendMode as GlobalCompositeOperation)
          : "source-over",
        tile: l.tile === true,
        shadow: sanitizeShadow(l.shadow),
        clipToLand: l.clipToLand !== false,
      });
    } else if (l.kind === "country") {
      layers.push({
        id: COUNTRY_LAYER_ID,
        kind: "country",
        name: "Country Layer",
        visible: l.visible !== false,
        blendMode: BLEND_MODES.includes(l.blendMode as GlobalCompositeOperation)
          ? (l.blendMode as GlobalCompositeOperation)
          : "source-over",
        shadow: sanitizeShadow(l.shadow),
      });
    }
  }

  if (layers.length === 0) return null;
  return normalizeStack(layers);
}
