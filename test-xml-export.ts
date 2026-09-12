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

// Only ONE filter def for the sepia effect (shared across layers)
assert(
  (stacked!.xml.match(/id="am-tone-sepia"/g) || []).length === 1,
  "stack: single shared filter def"
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

console.log("\n--- BELOW MODE SVG (body excerpt) ---");
const i = below!.xml.indexOf("<svg");
const j = below!.xml.indexOf("</svg>");
console.log(below!.xml.slice(i, j + 6).split("\n").slice(12).join("\n"));
