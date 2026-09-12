/**
 * Vector XML Export Engine
 * ---------------------------------------------------------------------------
 * Turns a country's projected land geometry into three interoperable XML
 * document flavors, all baked with the EXACT same projection + fit math the
 * Capture Studio canvas uses (see computeLandTransform) so the vector art
 * matches the exported PNG pixel for pixel.
 *
 *  - "svg"      : SVG 1.1 vector document (XML) — land path, colors, optional
 *                 embedded flag image masked to the country outline.
 *  - "alight"   : Alight Motion style shape preset XML (layers / transform /
 *                 path data / keyframes). Community-style layout, unofficial.
 *  - "geometry" : Raw <historyShape> geometry — every ring in decimal degrees
 *                 AND baked pixels, plus bounds, centroids and styling.
 */

import {
  computeLandTransform,
  type LandTransform,
  type MapProjection,
  type ImageLayerOrder,
} from "./geoCapture";
import type { ImageFilterEffect } from "./geoCapture";

export type XmlExportFormat = "svg" | "alight" | "geometry";

export const GENERATOR_NAME = "HistoryApp for Alight Motion";
export const GENERATOR_VERSION = "1.1";

export const XML_FORMAT_INFO: Record<
  XmlExportFormat,
  { label: string; icon: string; desc: string; bestFor: string; ext: string }
> = {
  svg: {
    label: "SVG Vector",
    icon: "🧇",
    desc: "Standard SVG 1.1 XML: <path> land outline, land color, border and (optionally) your flag image clipped inside the shape.",
    bestFor: "Any vector app · Alight Motion, Illustrator, Inkscape, After Effects",
    ext: "svg", // an SVG file IS an XML document - this extension just keeps vector apps happy
  },
  alight: {
    label: "Alight Motion Preset",
    icon: "🎬",
    desc: "AM style shape-preset XML: shape layer with transform, fill/stroke and optional scale/fade intro keyframes.",
    bestFor: "Dropping a land layer + motion into an AM project (community XML layout)",
    ext: "xml",
  },
  geometry: {
    label: "Raw Geometry",
    icon: "📐",
    desc: "Neutral <historyShape> XML: every ring as decimal degrees and baked pixels, with bounds, centroids and styling.",
    bestFor: "Scripting, custom importers, re-projecting at another size later",
    ext: "xml",
  },
};

export interface XmlImageOptions {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  fitMode: "cover" | "contain" | "stretch" | "manual";
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
  filterEffect?: ImageFilterEffect;
  tintColor?: string | null;
  tintOpacity?: number;
  tintBlendMode?: string;
  /** "masked" (default) = image clipped inside the land; "below" = full image with the country fill on top */
  layerOrder?: ImageLayerOrder;
}

/**
 * One entry of the multi-layer SVG stack (Capture Studio layer editor).
 * Order is BOTTOM → TOP; the land stroke is always painted last (topmost).
 */
export interface XmlImageLayerSpec {
  kind: "image";
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  fitMode: "cover" | "contain" | "stretch" | "manual";
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
  filterEffect?: ImageFilterEffect;
  /** image clipped inside the land outline */
  clipToLand: boolean;
  /** Composite (blend) mode vs everything beneath (CSS mix-blend-mode name; "source-over"/"normal" = default) */
  blendMode?: string;
  /** mirror-repeat the image as a texture (fit mode ignored) */
  tile?: boolean;
  /** atmosphere tint painted over this image layer */
  tint?: { color: string; opacity: number; blend: string } | null;
}

export interface XmlCountryLayerSpec {
  kind: "country";
  /** Composite (blend) mode of the territory fill (CSS mix-blend-mode name) */
  blendMode?: string;
}

export type XmlRenderLayer = XmlImageLayerSpec | XmlCountryLayerSpec;

export interface XmlExportInput {
  format: XmlExportFormat;
  countryName: string;
  sovereign?: string | null;
  yearLabel: string;
  year?: number | null;
  polygons: GeoJSON.Position[][][];
  projection: MapProjection;
  width: number;
  height: number;
  paddingRatio?: number;
  showTitle?: boolean;
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
  backgroundColor?: string | null;
  /** 0 = keep every vertex, otherwise max vertices kept per ring */
  maxPointsPerRing?: number;
  includeIntroKeyframes?: boolean;
  image?: XmlImageOptions | null;
  /**
   * Multi-layer stack, BOTTOM → TOP (Capture Studio layer editor).
   * When present, the SVG paints this stack and ignores `image`.
   */
  layers?: XmlRenderLayer[];
  symbols?: string[];
}

/* ------------------------------------------------------------------ */
/* Small numeric / string helpers                                      */
/* ------------------------------------------------------------------ */

function num(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "0";
  const v = Number(n.toFixed(digits));
  return Object.is(v, -0) ? "0" : String(v);
}
const px = (n: number) => num(n, 2);
const deg = (n: number) => num(n, 5);
const pct = (n: number) => num(n, 3);

export function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** XML comments cannot contain "--" and must not end with "-" */
function sanitizeComment(value: string): string {
  return String(value)
    .replace(/--+/g, "-")
    .replace(/-+$/, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

export function sanitizeFilePart(value: string): string {
  const clean = String(value)
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~\[\]`'&$+=>]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .replace(/[._]+$/, "");
  return clean.length > 0 ? clean.slice(0, 60) : "land";
}

export function buildXmlFilename(
  countryName: string,
  yearLabel: string,
  projection: MapProjection,
  format: XmlExportFormat
): string {
  const name = sanitizeFilePart(countryName || "land");
  const year = sanitizeFilePart(yearLabel || "era");
  return `${name}_${year}_${projection}.${XML_FORMAT_INFO[format].ext}`;
}

/* ------------------------------------------------------------------ */
/* Ring processing: decimation + dual coordinate spaces                */
/* ------------------------------------------------------------------ */

interface ProcessedRing {
  role: "outer" | "hole";
  degrees: string;
  pixels: string;
  pointCount: number;
  originalCount: number;
}

interface ProcessedPart {
  rings: ProcessedRing[];
  bbox: { x: number; y: number; w: number; h: number };
  /** Geographic (lon/lat) extent of the whole part, holes included */
  bboxDeg: { minX: number; minY: number; maxX: number; maxY: number };
  centroid: { x: number; y: number };
  /** Midpoint of the OUTER ring's geographic box — a safe label/anchor hint */
  centroidDeg: { lng: number; lat: number };
  pointCount: number;
}

/** Keeps the ring closed and evenly strides long rings down to `maxPoints` */
function decimateRing<T>(ring: T[], maxPoints: number): T[] {
  if (maxPoints <= 0 || ring.length <= maxPoints) return ring;

  const keep = Math.max(4, maxPoints);
  const stride = (ring.length - 1) / (keep - 1);
  const out: T[] = [];
  let prevIdx = -1;
  for (let i = 0; i < keep; i++) {
    const idx = Math.min(ring.length - 1, Math.round(i * stride));
    if (idx !== prevIdx) {
      out.push(ring[idx]);
      prevIdx = idx;
    }
  }
  const last = ring[ring.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function processPolygons(
  tf: LandTransform,
  maxPoints: number
): ProcessedPart[] {
  const parts: ProcessedPart[] = [];

  tf.polygons.forEach((poly) => {
    if (!poly || poly.length === 0) return;

    const rings: ProcessedRing[] = [];
    let bbox = { x: Infinity, y: Infinity, w: 0, h: 0 };
    let bboxDeg = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const outerDeg = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let pointCount = 0;
    let areaSum = 0;
    let cxAcc = 0;
    let cyAcc = 0;
    let outerPoints = 0;

    poly.forEach((ring, ringIndex) => {
      if (!ring || ring.length < 2) return;
      const sampled = decimateRing(ring, maxPoints);
      const pts = sampled
        .map(([lng, lat]) => {
          const [x, y] = tf.toCanvas(lng, lat);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (lng < bboxDeg.minX) bboxDeg.minX = lng;
          if (lng > bboxDeg.maxX) bboxDeg.maxX = lng;
          if (lat < bboxDeg.minY) bboxDeg.minY = lat;
          if (lat > bboxDeg.maxY) bboxDeg.maxY = lat;
          if (ringIndex === 0) {
            if (lng < outerDeg.minX) outerDeg.minX = lng;
            if (lng > outerDeg.maxX) outerDeg.maxX = lng;
            if (lat < outerDeg.minY) outerDeg.minY = lat;
            if (lat > outerDeg.maxY) outerDeg.maxY = lat;
          }
          return { x, y, lng, lat };
        })
        .filter((p): p is { x: number; y: number; lng: number; lat: number } => p !== null);

      if (pts.length < 3) return;

      if (ringIndex === 0) {
        // Shoelace area + area-weighted centroid of the outer ring (used as the layer anchor)
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const a = pts[i];
          const b = pts[j];
          const cross = a.x * b.y - b.x * a.y;
          areaSum += cross;
          cxAcc += (a.x + b.x) * cross;
          cyAcc += (a.y + b.y) * cross;
        }
        outerPoints = pts.length;
      }

      const degrees = pts.map((p) => `${deg(p.lng)},${deg(p.lat)}`).join(" ");
      const pixels = pts.map((p) => `${px(p.x)},${px(p.y)}`).join(" ");

      rings.push({
        role: ringIndex === 0 ? "outer" : "hole",
        degrees,
        pixels,
        pointCount: pts.length,
        originalCount: ring.length,
      });
      pointCount += pts.length;
    });

    if (rings.length === 0 || minX === Infinity) return;

    bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const twiceArea = areaSum || 1;
    const hasCentroid = Math.abs(areaSum) > 1e-9 && outerPoints > 0;

    parts.push({
      rings,
      bbox,
      bboxDeg: Number.isFinite(bboxDeg.minX) ? bboxDeg : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      centroid: hasCentroid
        ? { x: cxAcc / (3 * twiceArea), y: cyAcc / (3 * twiceArea) }
        : { x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2 },
      centroidDeg: Number.isFinite(outerDeg.minX)
        ? { lng: (outerDeg.minX + outerDeg.maxX) / 2, lat: (outerDeg.minY + outerDeg.maxY) / 2 }
        : { lng: 0, lat: 0 },
      pointCount,
    });
  });

  return parts;
}

/**
 * Bakes the rings into SVG/AM path data with EXPLICIT L commands (some mobile importers
 * mishandle implicit lineto sequences). Coordinates are 2-decimal output pixels.
 */
function combinedPixelPath(parts: ProcessedPart[], origin?: { x: number; y: number }): string {
  const ox = origin ? origin.x : 0;
  const oy = origin ? origin.y : 0;
  return parts
    .map((part) =>
      part.rings
        .map((ring) => {
          const pts = ring.pixels.split(" ").map((pair) => {
            const [x, y] = pair.split(",");
            return `${num(Number(x) - ox, 2)},${num(Number(y) - oy, 2)}`;
          });
          if (pts.length === 0) return "";
          const [first, ...rest] = pts;
          return `M ${first}${rest.length > 0 ? ` L ${rest.join(" ")}` : ""} Z`;
        })
        .filter((r) => r !== "")
        .join(" ")
    )
    .filter((p) => p !== "")
    .join(" ");
}

function totalPoints(parts: ProcessedPart[]): number {
  return parts.reduce((acc, p) => acc + p.pointCount, 0);
}

/* ------------------------------------------------------------------ */
/* Shared metadata blocks                                              */
/* ------------------------------------------------------------------ */

function headerComment(input: XmlExportInput, extra: string[]): string {
  const lines = [
    `${GENERATOR_NAME} v${GENERATOR_VERSION} - ${input.countryName} (${input.yearLabel})`,
    ...extra,
  ];
  const body = lines.map((l) => `  ${sanitizeComment(l)}`).join("\n");
  return `<!--\n${body}\n-->`;
}

function statsFor(input: XmlExportInput, tf: LandTransform, parts: ProcessedPart[]) {
  const holes = parts.reduce((acc, p) => acc + Math.max(0, p.rings.length - 1), 0);

  let geoMinX = Infinity;
  let geoMinY = Infinity;
  let geoMaxX = -Infinity;
  let geoMaxY = -Infinity;
  parts.forEach((p) => {
    geoMinX = Math.min(geoMinX, p.bboxDeg.minX);
    geoMinY = Math.min(geoMinY, p.bboxDeg.minY);
    geoMaxX = Math.max(geoMaxX, p.bboxDeg.maxX);
    geoMaxY = Math.max(geoMaxY, p.bboxDeg.maxY);
  });
  const hasGeo = Number.isFinite(geoMinX);

  return {
    parts: parts.length,
    rings: parts.reduce((acc, p) => acc + p.rings.length, 0),
    holes,
    points: totalPoints(parts),
    maxPointsPerRing: input.maxPointsPerRing && input.maxPointsPerRing > 0 ? input.maxPointsPerRing : 0,
    /** Projected bounds in the projection's own units (radians for the built-ins) */
    bounds: {
      minX: deg(tf.minX),
      maxX: deg(tf.maxX),
      minY: deg(tf.minY),
      maxY: deg(tf.maxY),
    },
    /** Human readable geographic extent, always lon/lat degrees */
    geoBounds: hasGeo
      ? { minX: deg(geoMinX), minY: deg(geoMinY), maxX: deg(geoMaxX), maxY: deg(geoMaxY) }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    pixelBounds: {
      x: px(tf.offsetX),
      y: px(tf.offsetY),
      w: px(tf.renderWidth),
      h: px(tf.renderHeight),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 1) SVG vector XML                                                   */
/* ------------------------------------------------------------------ */

function svgFilterDef(effect: ImageFilterEffect | undefined): { id: string; markup: string } | null {
  switch (effect) {
    case "grayscale":
      return {
        id: "am-tone-grayscale",
        markup: '<filter id="am-tone-grayscale" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter>',
      };
    case "sepia":
      return {
        id: "am-tone-sepia",
        markup:
          '<filter id="am-tone-sepia" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.393 0.769 0.189 0 0 0.349 0.686 0.168 0 0 0.272 0.534 0.131 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="linear" slope="0.95" intercept="0.02"/><feFuncG type="linear" slope="0.95" intercept="0.02"/><feFuncB type="linear" slope="0.95" intercept="0.02"/></feComponentTransfer></filter>',
      };
    case "vintage":
      return {
        id: "am-tone-vintage",
        markup:
          '<filter id="am-tone-vintage" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0.393 0.769 0.189 0 0 0.349 0.686 0.168 0 0 0.272 0.534 0.131 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="linear" slope="1.1" intercept="-0.05"/><feFuncG type="linear" slope="1.1" intercept="-0.05"/><feFuncB type="linear" slope="1.1" intercept="-0.05"/></feComponentTransfer></filter>',
      };
    case "high-contrast":
      return {
        id: "am-tone-contrast",
        markup:
          '<filter id="am-tone-contrast" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="1.4" intercept="-0.2"/><feFuncG type="linear" slope="1.4" intercept="-0.2"/><feFuncB type="linear" slope="1.4" intercept="-0.2"/></feComponentTransfer><feColorMatrix type="saturate" values="1.2"/></filter>',
      };
    case "invert":
      return {
        id: "am-tone-invert",
        markup:
          '<filter id="am-tone-invert" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="table" tableValues="1 0"/><feFuncG type="table" tableValues="1 0"/><feFuncB type="table" tableValues="1 0"/></feComponentTransfer></filter>',
      };
    default:
      return null;
  }
}

/** Mirrors the canvas fit-mode + transform math so the SVG flag sits exactly like the PNG one */
function imageGeometryFor(
  img: { naturalWidth: number; naturalHeight: number; fitMode: string; scale: number; offsetX: number; offsetY: number },
  tf: LandTransform
) {
  const imgW = Math.max(1, img.naturalWidth);
  const imgH = Math.max(1, img.naturalHeight);

  let baseW = tf.renderWidth;
  let baseH = tf.renderHeight;

  if (img.fitMode === "cover") {
    const ratio = Math.max(tf.renderWidth / imgW, tf.renderHeight / imgH);
    baseW = imgW * ratio;
    baseH = imgH * ratio;
  } else if (img.fitMode === "contain") {
    const ratio = Math.min(tf.renderWidth / imgW, tf.renderHeight / imgH);
    baseW = imgW * ratio;
    baseH = imgH * ratio;
  } else if (img.fitMode === "manual") {
    const aspect = imgW / imgH;
    baseW = tf.renderWidth;
    baseH = tf.renderWidth / aspect;
  }

  const finalW = baseW * img.scale;
  const finalH = baseH * img.scale;
  const shiftX = (img.offsetX / 100) * tf.renderWidth;
  const shiftY = (img.offsetY / 100) * tf.renderHeight;

  return { finalW, finalH, shiftX, shiftY };
}

/** Legacy single-image variant */
function imageGeometry(input: XmlExportInput, tf: LandTransform) {
  return imageGeometryFor(input.image!, tf);
}

function buildSvgDocument(input: XmlExportInput, tf: LandTransform, parts: ProcessedPart[]): string {
  const stats = statsFor(input, tf, parts);
  const pathData = combinedPixelPath(parts);
  const landId = sanitizeFilePart(input.countryName).toLowerCase();
  const clipId = `${landId}-clip`;
  const hasImage = !!input.image?.dataUrl;
  const filter = hasImage ? svgFilterDef(input.image?.filterEffect) : null;

  const meta: string[] = [
    `  <history:region history:name="${escapeXml(input.countryName)}"${
      input.sovereign ? ` history:sovereign="${escapeXml(input.sovereign)}"` : ""
    }/>`,
    `  <history:era history:label="${escapeXml(input.yearLabel)}" history:year="${input.year ?? "unknown"}"/>`,
    `  <history:projection history:id="${input.projection}" history:units="svg-user-units"/>`,
    `  <history:canvas history:width="${input.width}" history:height="${input.height}" history:paddingRatio="${pct(
      input.paddingRatio ?? 0.12
    )}" history:titleWatermark="${input.showTitle ? "true" : "false"}"/>`,
    `  <history:bounds history:unit="degrees" history:minLon="${stats.geoBounds.minX}" history:maxLon="${stats.geoBounds.maxX}" history:minLat="${stats.geoBounds.minY}" history:maxLat="${stats.geoBounds.maxY}"/>`,
    Number(stats.geoBounds.maxX) > 180
      ? `  <history:antimeridian history:normalization="longitudes below 0 shifted +360 so the shape stays unbroken"/>`
      : "",
    `  <history:pixelBounds history:x="${stats.pixelBounds.x}" history:y="${stats.pixelBounds.y}" history:width="${stats.pixelBounds.w}" history:height="${stats.pixelBounds.h}"/>`,
    `  <history:geometry history:parts="${stats.parts}" history:rings="${stats.rings}" history:holes="${stats.holes}" history:points="${stats.points}" history:maxPointsPerRing="${stats.maxPointsPerRing || "full"}"/>`,
  ];
  if (input.symbols && input.symbols.length > 0) {
    meta.push(`  <history:symbols history:ids="${escapeXml(input.symbols.join(" "))}"/>`);
  }
  meta.push(
    `  <history:generator history:name="${GENERATOR_NAME}" history:version="${GENERATOR_VERSION}" history:exportedAt="${new Date().toISOString()}"/>`
  );

  const blocks: string[] = [];
  const layerStack = input.layers && input.layers.length > 0 ? input.layers : null;
  const imageBelow = hasImage && input.image!.layerOrder === "below";

  // Background FIRST (behind everything) — mirroring the canvas draw order
  if (input.backgroundColor && input.backgroundColor !== "transparent") {
    blocks.push(
      `  <rect id="background" x="0" y="0" width="${input.width}" height="${input.height}" fill="${escapeXml(
        input.backgroundColor
      )}" pointer-events="none"/>`
    );
  }

  /** CSS mix-blend-mode style for a layer (omitted for the default "normal") */
  const blendStyleFor = (blendMode?: string) =>
    blendMode && blendMode !== "source-over" && blendMode !== "normal"
      ? ` style="mix-blend-mode:${escapeXml(blendMode)}"`
      : "";

  /** One <image> element baked with the shared fit/transform math */
  const imageMarkupFor = (
    spec: {
      dataUrl: string;
      naturalWidth: number;
      naturalHeight: number;
      fitMode: string;
      scale: number;
      offsetX: number;
      offsetY: number;
      rotation: number;
      opacity: number;
      blendMode?: string;
    },
    filterAttr: string
  ) => {
    const { finalW, finalH, shiftX, shiftY } = imageGeometryFor(spec, tf);
    return `    <image x="${px(-finalW / 2)}" y="${px(-finalH / 2)}" width="${px(
      finalW
    )}" height="${px(
      finalH
    )}" xlink:href="${spec.dataUrl}" href="${spec.dataUrl}" preserveAspectRatio="none" opacity="${pct(
      spec.opacity
    )}" transform="translate(${px(tf.centerX + shiftX)} ${px(tf.centerY + shiftY)})${
      spec.rotation ? ` rotate(${pct(spec.rotation)})` : ""
    }"${filterAttr}${blendStyleFor(spec.blendMode)}/>`;
  };

  const tintRectFor = (tint: { color: string; opacity: number; blend: string }) =>
    `    <rect x="0" y="0" width="${input.width}" height="${input.height}" fill="${escapeXml(
      tint.color
    )}" fill-opacity="${pct(
      tint.opacity
    )}" style="mix-blend-mode:${escapeXml(tint.blend || "soft-light")}" pointer-events="none"/>`;

  if (layerStack) {
    // ── Multi-layer stack (Capture Studio layer editor) — BOTTOM → TOP ──
    const defsLines: string[] = [];
    const anyClip = layerStack.some((l) => l.kind !== "country" && l.clipToLand);
    if (anyClip) {
      defsLines.push(
        `    <clipPath id="${clipId}">`,
        `      <path d="${pathData}" clip-rule="evenodd"/>`,
        `    </clipPath>`
      );
    }
    const usedFilterIds = new Set<string>();
    layerStack.forEach((layer, index) => {
      if (layer.kind === "country") return;
      const f = svgFilterDef(layer.filterEffect);
      if (f && !usedFilterIds.has(f.id)) {
        usedFilterIds.add(f.id);
        defsLines.push(`    ${f.markup}`);
      }
      if (layer.tile) {
        // 2×2 mirrored super-tile: each cell is the image flipped across the
        // shared edge, so the repeat is seamless (matches the canvas renderer)
        const tw = Math.max(1, layer.naturalWidth);
        const th = Math.max(1, layer.naturalHeight);
        defsLines.push(
          `    <pattern id="${landId}-tile-${index}" width="${px(tw * 2)}" height="${px(th * 2)}" patternUnits="userSpaceOnUse">`,
          `      <image href="${layer.dataUrl}" x="0" y="0" width="${px(tw)}" height="${px(th)}"/>`,
          `      <image href="${layer.dataUrl}" x="0" y="0" width="${px(tw)}" height="${px(th)}" transform="translate(${px(tw * 2)} 0) scale(-1 1)"/>`,
          `      <image href="${layer.dataUrl}" x="0" y="0" width="${px(tw)}" height="${px(th)}" transform="translate(0 ${px(th * 2)}) scale(1 -1)"/>`,
          `      <image href="${layer.dataUrl}" x="0" y="0" width="${px(tw)}" height="${px(th)}" transform="translate(${px(tw * 2)} ${px(th * 2)}) scale(-1 -1)"/>`,
          `    </pattern>`
        );
      }
    });
    if (defsLines.length > 0) {
      blocks.push("  <defs>", ...defsLines, "  </defs>");
    }

    layerStack.forEach((layer, index) => {
      if (layer.kind === "country") {
        // Territory fill at its stack position (no stroke — the outline lands last)
        if (input.fillOpacity > 0) {
          blocks.push(
            `  <path id="${landId}-land-fill" d="${pathData}" fill="${escapeXml(
              input.fillColor
            )}" fill-opacity="${pct(input.fillOpacity)}" fill-rule="evenodd"${blendStyleFor(
              layer.blendMode
            )} shape-rendering="geometricPrecision"/>`
          );
        }
        return;
      }
      const f = svgFilterDef(layer.filterEffect);
      const filterAttr = f ? ` filter="url(#${f.id})"` : "";
      const markup = layer.tile
        ? (() => {
            // Mirror-repeat texture: pattern-filled rect in the layer's local
            // space (big enough to stay covered under pan/rotation)
            const shiftX = (layer.offsetX / 100) * tf.renderWidth;
            const shiftY = (layer.offsetY / 100) * tf.renderHeight;
            const cover = Math.max(input.width, input.height) * 2;
            return `    <rect x="${px(-cover)}" y="${px(-cover)}" width="${px(cover * 2)}" height="${px(cover * 2)}" fill="url(#${landId}-tile-${index})" opacity="${pct(layer.opacity)}"${filterAttr}${blendStyleFor(
              layer.blendMode
            )} transform="translate(${px(tf.centerX + shiftX)} ${px(tf.centerY + shiftY)})${
              layer.rotation ? ` rotate(${pct(layer.rotation)})` : ""
            }"/>`;
          })()
        : imageMarkupFor(layer, filterAttr);

      if (layer.clipToLand) {
        blocks.push(
          [
            `  <g id="${landId}-layer-${index}" clip-path="url(#${clipId})">`,
            markup,
            ...(layer.tint && layer.tint.opacity > 0 ? [tintRectFor(layer.tint)] : []),
            `  </g>`,
          ].join("\n")
        );
      } else {
        blocks.push(markup);
      }
    });
  } else if (hasImage) {
    const { finalW, finalH, shiftX, shiftY } = imageGeometry(input, tf);
    const img = input.image!;
    const filterAttr = filter ? ` filter="url(#${filter.id})"` : "";

    const imageMarkup = `    <image x="${px(-finalW / 2)}" y="${px(-finalH / 2)}" width="${px(
      finalW
    )}" height="${px(
      finalH
    )}" xlink:href="${img.dataUrl}" href="${img.dataUrl}" preserveAspectRatio="none" opacity="${pct(
      img.opacity
    )}" transform="translate(${px(tf.centerX + shiftX)} ${px(tf.centerY + shiftY)})${
      img.rotation ? ` rotate(${pct(img.rotation)})` : ""
    }"${filterAttr}/>`;

    const defsLines: string[] = [];
    if (!imageBelow) {
      defsLines.push(
        `    <clipPath id="${clipId}">`,
        `      <path d="${pathData}" clip-rule="evenodd"/>`,
        `    </clipPath>`
      );
    }
    if (filter) defsLines.push(`    ${filter.markup}`);

    if (defsLines.length > 0) {
      blocks.push("  <defs>", ...defsLines, "  </defs>");
    }

    if (imageBelow) {
      // Image layer BELOW the country layer: full unclipped image, the land fill
      // (below) paints on top of it — exactly like the canvas renderer.
      blocks.push(
        `  <g id="${landId}-flag-fill" clip-rule="none">`,
        imageMarkup,
        `  </g>`
      );
    } else {
      const clipped = [
        `  <g id="${landId}-flag-fill" clip-path="url(#${clipId})">`,
        // Land base colour sits UNDERNEATH the flag, exactly like the canvas renderer
        `    <rect x="0" y="0" width="${input.width}" height="${input.height}" fill="${escapeXml(
          input.fillColor
        )}" fill-opacity="${pct(input.fillOpacity)}"/>`,
        imageMarkup,
        ...(img.tintColor && img.tintOpacity && img.tintOpacity > 0
          ? [
              `    <rect x="0" y="0" width="${input.width}" height="${input.height}" fill="${escapeXml(
                img.tintColor
              )}" fill-opacity="${pct(
                img.tintOpacity
              )}" style="mix-blend-mode:${escapeXml(img.tintBlendMode || "soft-light")}" pointer-events="none"/>`,
            ]
          : []),
        `  </g>`,
      ];
      blocks.push(clipped.join("\n"));
    }
  }

  // Land path LAST (topmost): stroke-only in stack mode so the outline stays
  // crisp over every layer; real fill in "below" legacy mode; stroke-only when
  // the image is masked inside it. Mirrors the canvas draw order.
  const topmostLandFill = layerStack
    ? "none"
    : hasImage && !imageBelow
      ? "none"
      : escapeXml(input.fillColor);
  blocks.push(
    [
      `  <path id="${landId}-land"`,
      `    d="${pathData}"`,
      `    fill="${topmostLandFill}"`,
      topmostLandFill === "none" ? "" : `    fill-opacity="${pct(input.fillOpacity)}"`,
      `    fill-rule="evenodd"`,
      `    stroke="${escapeXml(input.borderColor)}"`,
      `    stroke-width="${pct(input.borderWidth)}"`,
      `    stroke-linejoin="miter"`,
      `    stroke-linecap="square"`,
      `    stroke-miterlimit="4"`,
      `    shape-rendering="geometricPrecision"/>`,
    ]
      .filter((l) => l !== "")
      .join("\n")
  );

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    headerComment(input, [
      "Vector land shape as SVG (an XML document).",
      `Projection: ${input.projection}. Surface: ${input.width}x${input.height}.`,
      "Open directly in any vector editor, or import into Alight Motion as artwork.",
    ]),
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:history="https://github.com/AnhQuan15032/HistoryAppForAlightMotion#" version="1.1" width="${input.width}" height="${input.height}" viewBox="0 0 ${input.width} ${input.height}">`,
    `  <title>${escapeXml(`${input.countryName} - ${input.yearLabel}`)}</title>`,
    `  <desc>${escapeXml(
      `${input.countryName}${input.sovereign && input.sovereign !== input.countryName ? ` (${input.sovereign})` : ""} land boundaries in ${input.yearLabel}. ${stats.parts} polygon part(s), ${stats.rings} ring(s), ${stats.points} vertices. Projection: ${input.projection}.`
    )}</desc>`,
    `  <metadata>`,
    meta.filter((l) => l !== "").join("\n"),
    `  </metadata>`,
    ...blocks,
    `</svg>`,
    "",
  ];

  return lines.filter((l) => l !== "").join("\n");
}

/* ------------------------------------------------------------------ */
/* 2) Alight Motion style preset XML                                   */
/* ------------------------------------------------------------------ */

function hexToChannels(hex: string): { r: number; g: number; b: number } {
  let clean = String(hex).replace("#", "");
  if (clean.length === 3) clean = clean.split("").map((c) => c + c).join("");
  if (clean.length < 6) return { r: 0.83, g: 0.69, b: 0.22 };
  return {
    r: Number((parseInt(clean.slice(0, 2), 16) / 255).toFixed(4)),
    g: Number((parseInt(clean.slice(2, 4), 16) / 255).toFixed(4)),
    b: Number((parseInt(clean.slice(4, 6), 16) / 255).toFixed(4)),
  };
}

function buildAlightDocument(input: XmlExportInput, tf: LandTransform, parts: ProcessedPart[]): string {
  const stats = statsFor(input, tf, parts);
  // AM shape layers store path points relative to the layer anchor (its centre)
  const anchorX = tf.offsetX + tf.renderWidth / 2;
  const anchorY = tf.offsetY + tf.renderHeight / 2;
  const pathData = combinedPixelPath(parts, { x: anchorX, y: anchorY });
  const color = hexToChannels(input.fillColor);
  const strokeColor = hexToChannels(input.borderColor);
  const withIntro = !!input.includeIntroKeyframes;
  const shapeId = sanitizeFilePart(input.countryName).toLowerCase().replace(/_/g, "-");

  const lines: string[] = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    headerComment(input, [
      "Alight Motion shape preset XML (unofficial, community-style layout).",
      "Layer paths are relative to the layer anchor (its centre). Compose space is the canvas size below.",
      "Import with AM's XML/preset importer, or use the <pathData> with the Vector Shape tool.",
    ]),
    `<preset type="shape-layer" name="${escapeXml(`${input.countryName} · ${input.yearLabel}`)}" version="1" generator="${escapeXml(
      GENERATOR_NAME
    )}" generatorVersion="${GENERATOR_VERSION}" exportedAt="${new Date().toISOString()}" official="false">`,
    `  <composition width="${input.width}" height="${input.height}" frameRate="30" durationSeconds="5" background="${escapeXml(
      input.backgroundColor && input.backgroundColor !== "transparent" ? input.backgroundColor : "transparent"
    )}">`,
    `    <source region="${escapeXml(input.countryName)}"${
      input.sovereign ? ` sovereign="${escapeXml(input.sovereign)}"` : ""
    } era="${escapeXml(input.yearLabel)}" year="${input.year ?? "unknown"}" projection="${input.projection}" parts="${
      stats.parts
    }" rings="${stats.rings}" holes="${stats.holes}" vertices="${stats.points}" simplified="${
      stats.maxPointsPerRing ? "true" : "false"
    }"/>`,
    `    <layer id="1" name="${escapeXml(`${input.countryName} Land`)}" type="shape" order="0" visible="true" blendingMode="normal" opacity="${pct(
      input.fillOpacity
    )}" inPoint="0" outPoint="5">`,
    `      <bounds left="${px(anchorX - tf.renderWidth / 2)}" top="${px(
      anchorY - tf.renderHeight / 2
    )}" right="${px(anchorX + tf.renderWidth / 2)}" bottom="${px(
      anchorY + tf.renderHeight / 2
    )}" width="${px(tf.renderWidth)}" height="${px(tf.renderHeight)}"/>`,
    `      <transform anchorX="0" anchorY="0" positionX="${px(anchorX)}" positionY="${px(
      anchorY
    )}" rotation="0" skewX="0" skewY="0" scaleX="100" scaleY="100" uniformScale="true">`,
    withIntro
      ? `        <animated property="scale" interpolation="smooth" unit="percent">
          <keyframe time="0" value="82"/>
          <keyframe time="0.5" value="104"/>
          <keyframe time="0.9" value="100"/>
        </animated>
        <animated property="positionX" interpolation="smooth" unit="pixelsFromCenter">
          <keyframe time="0" value="-24"/>
          <keyframe time="0.9" value="0"/>
        </animated>`
      : `        <static property="scale" value="100"/>`,
    `      </transform>`,
    `      <shape name="${escapeXml(shapeId)}" closed="true" fillRule="evenodd">`,
    `        <pathData space="layer-relative-center" precision="2" d="${pathData}"/>`,
    `      </shape>`,
    `      <fill enabled="true" colorHex="${escapeXml(
      input.fillColor
    )}" colorR="${color.r}" colorG="${color.g}" colorB="${color.b}" colorA="${pct(input.fillOpacity)}" opacity="${pct(
      input.fillOpacity
    )}"/>`,
    `      <stroke enabled="${input.borderWidth > 0 ? "true" : "false"}" colorHex="${escapeXml(
      input.borderColor
    )}" colorR="${strokeColor.r}" colorG="${strokeColor.g}" colorB="${strokeColor.b}" colorA="1" width="${pct(
      input.borderWidth
    )}" cap="square" join="miter" miterLimit="4"/>`,
    withIntro
      ? `      <effects>
        <effect id="am-fade-in" name="Fade In" order="0" enabled="true">
          <animated property="opacity" interpolation="smooth" unit="percent">
            <keyframe time="0" value="0"/>
            <keyframe time="0.5" value="100"/>
          </animated>
        </effect>
      </effects>`
      : `      <effects/>`,
    withIntro
      ? `      <keyframeTimes unit="seconds">0,0.5,0.9</keyframeTimes>`
      : "",
    `    </layer>`,
    `  </composition>`,
    `</preset>`,
    "",
  ];

  return lines.filter((l) => l !== "").join("\n");
}

/* ------------------------------------------------------------------ */
/* 3) Raw geometry XML                                                 */
/* ------------------------------------------------------------------ */

function buildGeometryDocument(
  input: XmlExportInput,
  tf: LandTransform,
  parts: ProcessedPart[]
): string {
  const stats = statsFor(input, tf, parts);

  const partBlocks = parts.map((part, index) => {
    const ringLines = part.rings.map(
      (ring, ringIndex) =>
        `        <ring index="${ringIndex}" role="${ring.role}" points="${ring.pointCount}" sourcePoints="${
          ring.originalCount
        }" degrees="${ring.degrees}" pixels="${ring.pixels}"/>`
    );
    return `    <part index="${index}">
      <bbox pixels="${px(part.bbox.x)} ${px(part.bbox.y)} ${px(part.bbox.w)} ${px(
      part.bbox.h
    )}" degrees="${deg(part.bboxDeg.minX)} ${deg(part.bboxDeg.minY)} ${deg(
      part.bboxDeg.maxX
    )} ${deg(part.bboxDeg.maxY)}"/>
      <centroid pixels="${px(part.centroid.x)} ${px(part.centroid.y)}" degrees="${deg(
      part.centroidDeg.lng
    )} ${deg(part.centroidDeg.lat)}" note="pixels: area centroid, degrees: outer-ring bbox midpoint"/>
      <rings count="${part.rings.length}" outer="1" holes="${Math.max(
      0,
      part.rings.length - 1
    )}">
${ringLines.join("\n")}
      </rings>
    </part>`;
  });

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    headerComment(input, [
      "Raw land geometry XML: every ring in decimal degrees (EPSG:4326) and baked output pixels.",
      `Projection ${input.projection}; pixels use a ${input.width}x${input.height} surface.`,
    ]),
    `<historyShape version="1" generator="${escapeXml(GENERATOR_NAME)}" generatorVersion="${GENERATOR_VERSION}" exportedAt="${new Date().toISOString()}">`,
    `  <region name="${escapeXml(input.countryName)}"${
      input.sovereign ? ` sovereign="${escapeXml(input.sovereign)}"` : ""
    }/>`,
    `  <era label="${escapeXml(input.yearLabel)}" year="${input.year ?? "unknown"}"/>`,
    `  <projection id="${input.projection}" degreesUnit="degrees" note="pixel space = fitted, Y flipped (screen space)"/>`,
    `  <canvas width="${input.width}" height="${input.height}" paddingRatio="${pct(
      input.paddingRatio ?? 0.12
    )}" titleWatermark="${input.showTitle ? "true" : "false"}"/>`,
    `  <style land="${escapeXml(input.fillColor)}" landOpacity="${pct(
      input.fillOpacity
    )}" border="${escapeXml(input.borderColor)}" borderWidth="${pct(
      input.borderWidth
    )}" background="${escapeXml(input.backgroundColor || "transparent")}"/>`,
    `  <projectedBounds unit="${input.projection === "mercator" ? "web-mercator-radians" : "degrees-space"}" minX="${
      stats.bounds.minX
    }" maxX="${stats.bounds.maxX}" minY="${stats.bounds.minY}" maxY="${
      stats.bounds.maxY
    }" scale="${pct(tf.scale)}"/>`,
    `  <geographicBounds unit="degrees" minLon="${stats.geoBounds.minX}" maxLon="${
      stats.geoBounds.maxX
    }" minLat="${stats.geoBounds.minY}" maxLat="${stats.geoBounds.maxY}"/>`,
    `  <fittedBox pixels="${stats.pixelBounds.x} ${stats.pixelBounds.y} ${stats.pixelBounds.w} ${stats.pixelBounds.h}"/>`,
    `  <summary parts="${stats.parts}" rings="${stats.rings}" holes="${stats.holes}" vertices="${
      stats.points
    }" maxPointsPerRing="${stats.maxPointsPerRing || "full"}"/>`,
    input.symbols && input.symbols.length > 0
      ? `  <symbols ids="${escapeXml(input.symbols.join(" "))}"/>`
      : "",
    `  <parts count="${parts.length}">`,
    ...partBlocks,
    `  </parts>`,
    `</historyShape>`,
    "",
  ];

  return lines.filter((l) => l !== "").join("\n");
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export interface BuiltXmlDocument {
  xml: string;
  filename: string;
  format: XmlExportFormat;
  mimeType: string;
  bytes: number;
  stats: { parts: number; rings: number; holes: number; points: number };
}

/**
 * Builds one XML document for a country's land shape.
 * Returns null when the geometry is empty or cannot be projected.
 */
export function buildXmlDocument(input: XmlExportInput): BuiltXmlDocument | null {
  const tf = computeLandTransform(input.polygons, {
    width: input.width,
    height: input.height,
    paddingRatio: input.paddingRatio ?? 0.12,
    showTitle: input.showTitle ?? false,
    projection: input.projection,
  });
  if (!tf) return null;

  const parts = processPolygons(tf, input.maxPointsPerRing ?? 0);
  if (parts.length === 0) return null;

  let xml: string;
  switch (input.format) {
    case "svg":
      xml = buildSvgDocument(input, tf, parts);
      break;
    case "alight":
      xml = buildAlightDocument(input, tf, parts);
      break;
    case "geometry":
    default:
      xml = buildGeometryDocument(input, tf, parts);
      break;
  }

  return {
    xml,
    filename: buildXmlFilename(input.countryName, input.yearLabel, input.projection, input.format),
    format: input.format,
    mimeType: input.format === "svg" ? "image/svg+xml" : "application/xml",
    bytes: xml.length,
    stats: (() => {
      const s = statsFor(input, tf, parts);
      return { parts: s.parts, rings: s.rings, holes: s.holes, points: s.points };
    })(),
  };
}

/** Convenience: builds the document and returns a ready-to-download Blob */
export function createXmlBlob(input: XmlExportInput): Blob | null {
  const built = buildXmlDocument(input);
  if (!built) return null;
  return new Blob([built.xml], { type: built.mimeType });
}

/**
 * Derives a signed numeric year from a human era label
 * ("1492 AD" -> 1492, "123,000 BC" -> -123000). Returns null when unparseable.
 */
export function yearFromLabel(label: string): number | null {
  const clean = String(label).replace(/,/g, "").trim();
  const match = clean.match(/(\d{1,9})\s*(BC|BCE|AD|CE)?/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  if (!Number.isFinite(value)) return null;
  const era = (match[2] || "").toUpperCase();
  return era === "BC" || era === "BCE" ? -value : value;
}
