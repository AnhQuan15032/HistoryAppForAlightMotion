/*
 * Standalone verification for the Preset Creator (style preset storage).
 * Run:
 *   npx esbuild test-style-presets.ts --bundle --format=esm --platform=node --outfile=/tmp/t.mjs && node /tmp/t.mjs
 * (not part of the app build or tsconfig)
 */

// In-memory window.localStorage for node (the module body never touches
// window at import time — only when the functions are called)
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  },
};

import {
  loadStylePresets,
  persistStylePresets,
  makePresetId,
  type StylePreset,
} from "./src/utils/stylePresets";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:  ", msg);
  }
}

const full: StylePreset = {
  id: "preset_1",
  name: "Antique Gold",
  createdAt: 1726000000000,
  fillType: "image",
  fillColor: "#D4AF37",
  fillOpacity: 0.95,
  countryBlendMode: "soft-light",
  borderColor: "#FFFFFF",
  borderWidth: 2,
  backgroundColor: "transparent",
  customBgColor: "#1E293B",
  tintEnabled: true,
  tintColor: "#D4AF37",
  tintOpacity: 0.3,
  tintBlendMode: "soft-light",
  filterEffect: "sepia",
  imageBlendMode: "multiply",
  symbols: [{ type: "star", color: "#FFFFFF", opacity: 1, size: 40, rotation: 0, thickness: 8, placement: "center", offsetX: 0, offsetY: 0, count: 1, spacing: 20, applyMode: "shape", targetColor: "#FF0000", colorTolerance: 30, sampleFromImage: true }],
  projection: "naturalEarth",
  resolutionIndex: 2,
  showTitle: true,
};

// 1. Empty storage → empty list
assert(loadStylePresets().length === 0, "empty storage loads as []");

// 2. Round-trip preserves every field
persistStylePresets([full]);
const rt = loadStylePresets();
assert(rt.length === 1, "round-trip: one preset loaded");
assert(rt[0].name === "Antique Gold" && rt[0].fillType === "image", "round-trip: name + fillType");
assert(rt[0].countryBlendMode === "soft-light" && rt[0].imageBlendMode === "multiply", "round-trip: both blend modes");
assert(rt[0].fillOpacity === 0.95 && rt[0].borderWidth === 2 && rt[0].resolutionIndex === 2, "round-trip: numeric fields");
assert(rt[0].symbols.length === 1 && rt[0].symbols[0].type === "star", "round-trip: symbols array");
assert(rt[0].projection === "naturalEarth" && rt[0].showTitle === true && rt[0].tintEnabled === true, "round-trip: booleans + projection");

// 3. Corrupt payload → [] (never throws)
store.set("am.capture.stylePresets", "{not json!!");
assert(loadStylePresets().length === 0, "corrupt JSON loads as []");
store.set("am.capture.stylePresets", "{\"a\":1}");
assert(loadStylePresets().length === 0, "non-array JSON loads as []");

// 4. Entry sanitization: junk filtered, gaps filled with safe defaults
store.set(
  "am.capture.stylePresets",
  JSON.stringify([
    null,
    "junk",
    {},
    {
      name: "  ",
      fillOpacity: 5,
      borderWidth: -3,
      countryBlendMode: "banana",
      imageBlendMode: "screen",
      projection: "warp",
      resolutionIndex: 99,
      filterEffect: "vibrance",
      fillColor: "red",
      symbols: [{ type: "star" }, 42, null],
      tintEnabled: "yes",
    },
  ])
);
const san = loadStylePresets();
assert(san.length === 2, "sanitize: non-object entries dropped (2 of 4 survive)");
assert(san[0].name === "Preset 1", "sanitize: empty object gets a generated name");
assert(san[1].name === "Preset 2", "sanitize: blank name replaced with index-based name");
assert(san[1].fillOpacity === 1, "sanitize: fillOpacity clamped to 1");
assert(san[1].borderWidth === 0, "sanitize: negative borderWidth clamped to 0");
assert(san[1].countryBlendMode === "source-over" && san[1].imageBlendMode === "screen", "sanitize: unknown blend → normal, valid blend kept");
assert(san[1].projection === "mercator" && san[1].resolutionIndex === 1, "sanitize: bad projection/index fall back to defaults");
assert(san[1].filterEffect === "none", "sanitize: unknown filter → none");
assert(san[1].fillColor === "#D4AF37", "sanitize: non-hex fill color replaced");
assert(san[1].symbols.length === 1 && san[1].symbols[0].type === "star", "sanitize: symbol entries without a string type dropped");
assert(san[1].tintEnabled === false, "sanitize: non-boolean tintEnabled → false");

// 5. Ids are unique
const ids = new Set(Array.from({ length: 200 }, () => makePresetId()));
assert(ids.size === 200, "makePresetId: 200 unique ids");

// 6. persist survives storage failures (returns false instead of throwing)
const w = (globalThis as unknown as { window: { localStorage: Record<string, unknown> } }).window;
const origSet = w.localStorage.setItem;
(w.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem = () => {
  throw new Error("quota");
};
assert(persistStylePresets([full]) === false, "persist: returns false when storage throws");
(w.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem = origSet as (k: string, v: string) => void;
assert(persistStylePresets([full]) === true, "persist: returns true on success");

console.log("\n--- style preset store snapshot ---");
console.log(store.get("am.capture.stylePresets")?.slice(0, 160) + "…");
