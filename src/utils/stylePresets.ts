/**
 * Style Presets (Preset Creator)
 * ---------------------------------------------------------------------------
 * User-saved "looks" for the Capture Studio: the full styling state of a
 * composition (territory fill + blend, border, background, atmosphere tint,
 * symbols, per-image filter + blend, projection and output size).
 *
 * Presets are small JSON blobs, so they live in localStorage (unlike the
 * image library, which is big enough to need IndexedDB). Entries are
 * sanitized on load so a corrupt payload can never crash the studio.
 */
import type { ImageFilterEffect, MapProjection } from "./geoCapture";
import { BLEND_MODES } from "./studioLayers";
import type { SymbolOptions } from "./symbolOverlays";

export interface StylePreset {
  id: string;
  name: string;
  createdAt: number;

  // Fill mode ("image" = layer stack, "color" = solid territory only)
  fillType: "color" | "image";

  // Country (territory) layer
  fillColor: string;
  fillOpacity: number;
  countryBlendMode: GlobalCompositeOperation;

  // Border & outline
  borderColor: string;
  borderWidth: number;

  // Background
  backgroundColor: string; // "transparent" | hex | "custom"
  customBgColor: string;

  // Atmosphere tint (masked image layers)
  tintEnabled: boolean;
  tintColor: string;
  tintOpacity: number;
  tintBlendMode: GlobalCompositeOperation;

  // Applied to EVERY image layer when the preset is applied
  filterEffect: ImageFilterEffect;
  imageBlendMode: GlobalCompositeOperation;

  // Symbol / charge overlays
  symbols: SymbolOptions[];

  // Output
  projection: MapProjection;
  resolutionIndex: number;
  showTitle: boolean;
}

const STORAGE_KEY = "am.capture.stylePresets";

const FILTER_EFFECTS: ImageFilterEffect[] = [
  "none",
  "grayscale",
  "sepia",
  "vintage",
  "high-contrast",
  "invert",
];
const PROJECTIONS: MapProjection[] = ["mercator", "equirectangular", "naturalEarth"];

export function makePresetId(): string {
  try {
    return `preset_${crypto.randomUUID()}`;
  } catch {
    return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * Fills in safe defaults for any field missing from a stored preset.
 * Presets with a blank name come back with name === "" — loadStylePresets
 * assigns them a position-based name so dropped junk entries don't shift
 * the numbering.
 */
function normalizePreset(raw: unknown): StylePreset | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const blend = (v: unknown, fallback: GlobalCompositeOperation): GlobalCompositeOperation =>
    isStr(v) && BLEND_MODES.includes(v as GlobalCompositeOperation)
      ? (v as GlobalCompositeOperation)
      : fallback;

  const symbols: SymbolOptions[] = Array.isArray(r.symbols)
    ? r.symbols.filter(
        (s): s is SymbolOptions =>
          !!s && typeof s === "object" && typeof (s as SymbolOptions).type === "string"
      )
    : [];

  return {
    id: isStr(r.id) && r.id.trim() ? r.id : makePresetId(),
    name: isStr(r.name) && r.name.trim() ? r.name.trim().slice(0, 48) : "",
    createdAt: isFiniteNum(r.createdAt) ? r.createdAt : Date.now(),
    fillType: r.fillType === "color" || r.fillType === "image" ? r.fillType : "image",
    fillColor: isStr(r.fillColor) && r.fillColor.startsWith("#") ? r.fillColor : "#D4AF37",
    fillOpacity: isFiniteNum(r.fillOpacity) ? clamp01(r.fillOpacity) : 0.95,
    countryBlendMode: blend(r.countryBlendMode, "source-over"),
    borderColor: isStr(r.borderColor) && r.borderColor.trim() ? r.borderColor : "#FFFFFF",
    borderWidth: isFiniteNum(r.borderWidth) ? Math.max(0, Math.min(8, r.borderWidth)) : 0,
    backgroundColor: isStr(r.backgroundColor) && r.backgroundColor.trim() ? r.backgroundColor : "transparent",
    customBgColor: isStr(r.customBgColor) && r.customBgColor.trim() ? r.customBgColor : "#1E293B",
    tintEnabled: r.tintEnabled === true,
    tintColor: isStr(r.tintColor) && r.tintColor.startsWith("#") ? r.tintColor : "#D4AF37",
    tintOpacity: isFiniteNum(r.tintOpacity) ? clamp01(r.tintOpacity) : 0.3,
    tintBlendMode: isStr(r.tintBlendMode) && r.tintBlendMode.trim() ? (r.tintBlendMode as GlobalCompositeOperation) : "soft-light",
    filterEffect: FILTER_EFFECTS.includes(r.filterEffect as ImageFilterEffect)
      ? (r.filterEffect as ImageFilterEffect)
      : "none",
    imageBlendMode: blend(r.imageBlendMode, "source-over"),
    symbols,
    projection: PROJECTIONS.includes(r.projection as MapProjection)
      ? (r.projection as MapProjection)
      : "mercator",
    resolutionIndex:
      typeof r.resolutionIndex === "number" &&
      Number.isInteger(r.resolutionIndex) &&
      r.resolutionIndex >= 0 &&
      r.resolutionIndex <= 3
        ? r.resolutionIndex
        : 1,
    showTitle: r.showTitle === true,
  };
}

/** Loads + sanitizes the stored preset list (never throws) */
export function loadStylePresets(): StylePreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizePreset(item))
      .filter((p): p is StylePreset => p !== null)
      .map((p, i) => (p.name ? p : { ...p, name: `Preset ${i + 1}` }));
  } catch {
    return [];
  }
}

/** Persists the preset list (never throws — storage full etc. is non-fatal) */
export function persistStylePresets(presets: StylePreset[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}
