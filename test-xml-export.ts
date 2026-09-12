/*
 * Standalone verification for the Capture Studio image layer-order feature.
 * Run:
 *   npx esbuild test-xml-export.ts --bundle --format=esm --platform=node --outfile=/tmp/t.mjs && node /tmp/t.mjs
 * (not part of the app build or tsconfig)
 */
import { buildXmlDocument } from "./src/utils/xmlExport";

// GeoJSON.Position[][][] = [polygon][ring][position]
const polygons = [
  [
    [
      [10, 50],
      [12, 50],
      [12, 52],
      [10, 52],
      [10, 50],
    ],
  ],
];

const base = {
  countryName: "Testland",
  yearLabel: "2000 AD",
  polygons,
  projection: "mercator" as const,
  width: 1024,
  height: 1024,
  paddingRatio: 0.12,
  showTitle: false,
  fillColor: "#DC2626",
  fillOpacity: 0.5,
  borderColor: "#FFFFFF",
  borderWidth: 2,
  backgroundColor: "#FFFFFF",
  image: {
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    naturalWidth: 100,
    naturalHeight: 100,
    fitMode: "cover" as const,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    opacity: 1,
    filterEffect: "sepia" as const,
    tintColor: "#D4AF37",
    tintOpacity: 0.3,
    tintBlendMode: "soft-light",
  },
};

const masked = buildXmlDocument({ ...base, format: "svg" });
const below = buildXmlDocument({ ...base, format: "svg", image: { ...base.image, layerOrder: "below" } });
const solid = buildXmlDocument({ ...base, format: "svg", image: null });

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:  ", msg);
  }
}

assert(!!masked && !!below && !!solid, "all three docs built");

// MASKED (default): clipPath + clipped group, land path stroke-only, tint present
assert(masked!.xml.includes("<clipPath id="), "masked: clipPath defined");
assert(masked!.xml.includes('clip-path="url(#'), "masked: image group clipped to land");
assert(/<path id="testland-land"[\s\S]*?fill="none"/.test(masked!.xml), "masked: land path is stroke-only (fill=none)");
assert(masked!.xml.includes("mix-blend-mode:soft-light"), "masked: tint rect present");

// BELOW: no clip, land path carries the country fill + opacity, no tint
assert(!below!.xml.includes("clipPath"), "below: no clipPath emitted");
assert(/<path id="testland-land"[\s\S]*?fill="#DC2626"/.test(below!.xml), "below: land path filled with country color");
assert(/<path id="testland-land"[\s\S]*?fill-opacity="0\.5"/.test(below!.xml), "below: land path uses country-layer opacity");
assert(!below!.xml.includes("mix-blend-mode"), "below: no tint rect");
assert(below!.xml.includes("<image "), "below: full image element present");
assert(below!.xml.includes("am-tone-sepia"), "below: filter still applied to image");

// Draw order: background must be painted BEFORE image & land in every mode
function bgBefore(xml: string, other: string) {
  const bg = xml.indexOf('id="background"');
  const idx = xml.indexOf(other);
  return bg >= 0 && idx >= 0 && bg < idx;
}
assert(bgBefore(masked!.xml, "<image "), "masked: background painted before image");
assert(bgBefore(below!.xml, "<image "), "below: background painted before image");
assert(bgBefore(solid!.xml, 'id="testland-land"'), "solid: background painted before land");

// ── LAYER STACK (Capture Studio multi-image layer editor) ──
const imgA = {
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  naturalWidth: 100,
  naturalHeight: 100,
  fitMode: "cover" as const,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  opacity: 1,
  filterEffect: "sepia" as const,
  blendMode: "multiply",
  clipToLand: true,
  tint: { color: "#D4AF37", opacity: 0.3, blend: "soft-light" },
};
const imgB = { ...imgA, clipToLand: false, filterEffect: undefined, tint: null, blendMode: "screen" };

const stacked = buildXmlDocument({
  ...base,
  format: "svg",
  image: null,
  // BOTTOM → TOP: masked image (multiply), country fill (soft-light), unmasked image (screen)
  layers: [imgA, { kind: "country" as const, blendMode: "soft-light" }, imgB],
});

assert(!!stacked, "stack: document built");
assert(stacked!.xml.includes("<clipPath id="), "stack: clipPath defined (a masked layer exists)");
assert(
  stacked!.xml.includes('<g id="testland-layer-0" clip-path="url(#testland-clip)">'),
  "stack: masked image wrapped in a clipped group"
);
assert(stacked!.xml.includes('id="testland-land-fill"'), "stack: country layer emitted as its own fill path");

const g0 = stacked!.xml.indexOf('id="testland-layer-0"');
const firstImg = stacked!.xml.indexOf("<image ");
const landFill = stacked!.xml.indexOf('id="testland-land-fill"');
const secondImg = stacked!.xml.indexOf("<image ", firstImg + 1);
const topLand = stacked!.xml.indexOf('id="testland-land"');

assert(g0 >= 0 && g0 < firstImg, "stack: clipped group opens before its image");
assert(
  firstImg < landFill && landFill < secondImg,
  `stack: draw order bottom→top (group image < country fill < top image; got ${firstImg} < ${landFill} < ${secondImg})`
);
assert(secondImg < topLand, "stack: topmost land outline painted after every layer");
assert(
  /id="testland-land"[\s\S]{0,400}?fill="none"/.test(stacked!.xml.slice(topLand)),
  "stack: topmost land path is stroke-only (fill=none)"
);

// Tint rect must sit INSIDE the clipped group
const groupClose = stacked!.xml.indexOf("</g>", firstImg);
const tint = stacked!.xml.indexOf("mix-blend-mode:soft-light");
assert(tint > firstImg && tint < groupClose, "stack: tint rect inside the clipped group");

// Per-layer effect defs: only the toned layer (index 0) gets one
assert(
  (stacked!.xml.match(/id="testland-fx-\d+"/g) || []).length === 1,
  "stack: per-layer fx def emitted only for the toned layer"
);
assert(
  /id="testland-fx-0"[\s\S]{0,400}?feColorMatrix/.test(stacked!.xml),
  "stack: fx def carries the sepia tone primitives"
);
assert(
  (stacked!.xml.match(/filter="url\(#testland-fx-0\)"/g) || []).length === 1,
  "stack: toned image references its fx def (and only it)"
);

// Per-layer blend modes → CSS mix-blend-mode on the right elements
assert(stacked!.xml.includes('style="mix-blend-mode:multiply"'), "blend: bottom image carries multiply");
assert(stacked!.xml.includes('style="mix-blend-mode:screen"'), "blend: top image carries screen");
assert(
  /id="testland-land-fill"[\s\S]{0,400}?style="mix-blend-mode:soft-light"/.test(stacked!.xml),
  "blend: country fill path carries its own blend mode"
);
// Default-normal layers must NOT get a style attribute (img markup check: 2 styles total for images
// — multiply + screen — plus tint rect + country path = 4 mix-blend-mode occurrences)
assert((stacked!.xml.match(/mix-blend-mode:/g) || []).length === 4, "blend: no stray blend styles emitted");

// ── TILED layer (mirror repeat) → SVG <pattern> + rect ──
const tiledLayer = { ...imgA, tile: true, blendMode: "multiply", filterEffect: "grayscale" as const };
const tiledDoc = buildXmlDocument({
  ...base,
  format: "svg",
  image: null,
  layers: [tiledLayer, { kind: "country" as const, blendMode: "screen" }],
});

assert(!!tiledDoc, "tile: document built");
assert(
  tiledDoc!.xml.includes('<pattern id="testland-tile-0" width="200" height="200" patternUnits="userSpaceOnUse">'),
  "tile: 2×2 pattern def emitted at double image size"
);
assert((tiledDoc!.xml.match(/<pattern id="testland-tile-0"/g) || []).length === 1, "tile: single pattern def");
assert((tiledDoc!.xml.match(/<image /g) || []).length === 4, "tile: pattern holds 4 mirrored image cells");
assert(/transform="translate\(200 0\) scale\(-1 1\)"/.test(tiledDoc!.xml), "tile: right cell flipped X");
assert(/transform="translate\(0 200\) scale\(1 -1\)"/.test(tiledDoc!.xml), "tile: bottom cell flipped Y");
assert(/transform="translate\(200 200\) scale\(-1 -1\)"/.test(tiledDoc!.xml), "tile: corner cell flipped both ways");
assert(/<rect[^>]*fill="url\(#testland-tile-0\)"/.test(tiledDoc!.xml), "tile: rect filled with the pattern");
assert(/<rect[^>]*style="mix-blend-mode:multiply"/.test(tiledDoc!.xml), "tile: rect carries the layer blend mode");
assert(/<rect[^>]*opacity="1"[^>]*transform="translate\([0-9.-]+ [0-9.-]+\)"/.test(tiledDoc!.xml), "tile: rect keeps layer opacity + placement transform");
const tGroup = tiledDoc!.xml.indexOf('<g id="testland-layer-0" clip-path="url(#testland-clip)">');
const tRect = tiledDoc!.xml.indexOf('fill="url(#testland-tile-0)"');
assert(tGroup >= 0 && tRect > tGroup, "tile: pattern rect inside the clipped layer group");

// ── Per-layer SHADOW → feDropShadow filters ──
const shadowedDoc = buildXmlDocument({
  ...base,
  format: "svg",
  image: null,
  layers: [
    { ...imgA, shadow: { color: "#000000", opacity: 0.6, blur: 20, offsetX: -4, offsetY: 10 } },
    { kind: "country" as const, shadow: { color: "#7C3AED", opacity: 0.4, blur: 12, offsetX: 0, offsetY: 6 } },
  ],
});

assert(!!shadowedDoc, "shadow: document built");
assert((shadowedDoc!.xml.match(/<feDropShadow /g) || []).length === 2, "shadow: one feDropShadow per shadowed layer");
assert(
  /<filter id="testland-fx-0"[\s\S]{0,600}?flood-color="#000000" flood-opacity="0\.6"/.test(shadowedDoc!.xml),
  "shadow: image fx def carries flood color + opacity"
);
assert(/dx="-4" dy="10" stdDeviation="10"/.test(shadowedDoc!.xml), "shadow: offset baked, stdDeviation = blur/2");
assert(
  /id="testland-fx-country"[\s\S]{0,300}?flood-color="#7C3AED"/.test(shadowedDoc!.xml),
  "shadow: country gets its own fx def"
);
assert(
  /<path id="testland-land-fill"[^>]*filter="url\(#testland-fx-country\)"/.test(shadowedDoc!.xml),
  "shadow: territory fill path references the country fx def"
);
assert(
  (shadowedDoc!.xml.match(/filter="url\(#testland-fx-0\)"/g) || []).length === 1,
  "shadow: image layer references its fx def (tone + shadow combined)"
);

console.log("\n--- BELOW MODE SVG (body excerpt) ---");
const i = below!.xml.indexOf("<svg");
const j = below!.xml.indexOf("</svg>");
console.log(below!.xml.slice(i, j + 6).split("\n").slice(12).join("\n"));
