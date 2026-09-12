import { getFeatureName, getFeatureSovereign } from "./countryFilter";
import { SymbolOptions, drawSymbol, getSymbolPosition, findColorRegionCenters } from "./symbolOverlays";

export type ImageFitMode = "cover" | "contain" | "stretch" | "manual";

export type ImageFilterEffect =
  | "none"
  | "grayscale"
  | "sepia"
  | "vintage"
  | "high-contrast"
  | "invert";

export type MapProjection = "mercator" | "equirectangular" | "naturalEarth";

/**
 * Layer order between the flag/image layer and the selected country layer.
 *  - "masked": the image is masked (clipped) by the country's territory —
 *              the country layer sits BELOW the image layer.
 *  - "below":  the image is a full, unclipped layer placed BELOW the country
 *              layer — the country fill + border are painted on top of it.
 */
export type ImageLayerOrder = "masked" | "below";

export interface ColorCombineOptions {
  enabled: boolean;
  baseColor: string; // Background color underneath the image
  baseColorOpacity: number; // 0.0 to 1.0 (opacity of base color under image)
  tintEnabled?: boolean; // Whether to apply an optional subtle tint
  tintColor?: string; // Color of the subtle tint
  tintOpacity?: number; // 0.0 to 0.6 (mix intensity)
  blendMode?: GlobalCompositeOperation; // 'soft-light' | 'overlay' | 'color' | 'multiply'
  filterEffect?: ImageFilterEffect;
}

export interface ImageFillOptions {
  image: HTMLImageElement | null;
  fitMode: ImageFitMode;
  scale: number; // 0.1 to 5.0 (1.0 = 100%)
  offsetX: number; // -100 to 100 (% offset from center)
  offsetY: number; // -100 to 100 (% offset from center)
  rotation: number; // 0 to 360 degrees
  opacity: number; // 0.0 to 1.0
  colorCombine?: ColorCombineOptions;
  /** Layer order vs the country layer — "masked" (default) or "below" */
  layerOrder?: ImageLayerOrder;
}

/* ------------------------------------------------------------------ */
/* Multi-layer stack (Capture Studio layer editor)                     */
/* ------------------------------------------------------------------ */

/** Shared transform parameters for painting one image layer */
export interface ImageDrawParams {
  image: HTMLImageElement;
  fitMode: ImageFitMode;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
  filterEffect?: ImageFilterEffect;
  /** Mirror-repeat the image as a texture instead of stretching it (fit mode ignored) */
  tile?: boolean;
}

export interface RenderImageLayer extends ImageDrawParams {
  kind: "image";
  /** Composite (blend) mode vs everything beneath this layer ("source-over" = normal) */
  blendMode?: GlobalCompositeOperation;
  /** Mask (clip) this layer to the selected country's territory */
  clipToLand: boolean;
  /** Optional atmosphere tint painted over the layer (inside the mask when clipped) */
  tint?: { color: string; opacity: number; blend: GlobalCompositeOperation } | null;
}

export interface RenderCountryLayer {
  kind: "country";
  fillColor: string;
  fillOpacity: number; // 0.0 to 1.0 (0 = invisible fill, border still draws)
  /** Composite (blend) mode vs everything beneath this layer ("source-over" = normal) */
  blendMode?: GlobalCompositeOperation;
}

export type RenderLayer = RenderImageLayer | RenderCountryLayer;

export interface CaptureOptions {
  width: number;
  height: number;
  paddingRatio: number;
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
  backgroundColor: string;
  showTitle: boolean;
  countryName: string;
  yearLabel: string;
  projection?: MapProjection;
  imageFill?: ImageFillOptions | null;
  /**
   * Multi-layer stack in BOTTOM → TOP order (Capture Studio layer editor).
   * When provided, the renderer paints this stack and ignores `imageFill`.
   */
  layers?: RenderLayer[];
  symbols?: SymbolOptions[];
}

/**
 * Web Mercator Projection (EPSG:3857) - Exact projection used by Leaflet & web maps
 */
export function projectMercator(lng: number, lat: number): [number, number] {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const x = (lng * Math.PI) / 180;
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return [x, y];
}

/**
 * Equirectangular / Plate Carrée Projection (EPSG:4326)
 */
export function projectEquirectangular(lng: number, lat: number): [number, number] {
  const x = (lng * Math.PI) / 180;
  const y = (lat * Math.PI) / 180;
  return [x, y];
}

/**
 * Natural Earth pseudo-cylindrical projection
 */
export function projectNaturalEarth(lng: number, lat: number): [number, number] {
  const latRad = (lat * Math.PI) / 180;
  const l = latRad;
  const l2 = l * l;
  const l4 = l2 * l2;
  const l6 = l4 * l2;
  const x =
    ((lng * Math.PI) / 180) *
    (0.8707 - 0.131979 * l2 - 0.003971 * l4 + 0.001529 * l6 + 0.000344 * (l6 * l2));
  const y =
    l * (1.007226 + 0.015085 * l2 - 0.044475 * l4 + 0.028874 * l6 - 0.005916 * (l6 * l2));
  return [x, y];
}

/**
 * Projects [lng, lat] to 2D Cartesian coordinates based on chosen projection
 */
export function projectCoordinates(
  lng: number,
  lat: number,
  projection: MapProjection = "mercator"
): [number, number] {
  switch (projection) {
    case "equirectangular":
      return projectEquirectangular(lng, lat);
    case "naturalEarth":
      return projectNaturalEarth(lng, lat);
    case "mercator":
    default:
      return projectMercator(lng, lat);
  }
}

/**
 * Extracts Polygon coordinates from any GeoJSON Geometry
 */
export function extractCoordinatesFromGeometry(
  geom: GeoJSON.Geometry,
  outPolygons: GeoJSON.Position[][][]
) {
  if (geom.type === "Polygon") {
    outPolygons.push((geom as GeoJSON.Polygon).coordinates);
  } else if (geom.type === "MultiPolygon") {
    (geom as GeoJSON.MultiPolygon).coordinates.forEach((poly) => {
      outPolygons.push(poly);
    });
  } else if (geom.type === "GeometryCollection") {
    (geom as GeoJSON.GeometryCollection).geometries.forEach((g) => {
      extractCoordinatesFromGeometry(g, outPolygons);
    });
  }
}

/**
 * Extracts all Polygon and MultiPolygon geometries from features matching countryName or selectedFeature.
 * Correctly gathers ALL composite features belonging to that country across the entire dataset.
 */
export function getCountryGeometries(
  geoJsonData: unknown,
  countryName: string,
  selectedFeature?: unknown
): GeoJSON.Position[][][] {
  const polygons: GeoJSON.Position[][][] = [];
  if (!countryName) return [];

  const target = countryName.trim().toLowerCase();
  const isMatchAll =
    target === "__all__" ||
    target === "all" ||
    target === "all regions" ||
    target === "full dataset";

  const data = geoJsonData as {
    type?: string;
    features?: Array<{
      properties?: Record<string, unknown> | null;
      geometry?: GeoJSON.Geometry;
    }>;
  };

  if (data && data.features && Array.isArray(data.features)) {
    data.features.forEach((f) => {
      if (!f || !f.geometry) return;

      if (isMatchAll) {
        extractCoordinatesFromGeometry(f.geometry, polygons);
        return;
      }

      const name = getFeatureName(f.properties)?.toLowerCase();
      const sovereign = getFeatureSovereign(f.properties)?.toLowerCase();

      if (name === target || sovereign === target) {
        extractCoordinatesFromGeometry(f.geometry, polygons);
        return;
      }

      if (f.properties) {
        for (const val of Object.values(f.properties)) {
          if (typeof val === "string" && val.trim().toLowerCase() === target) {
            extractCoordinatesFromGeometry(f.geometry, polygons);
            return;
          }
        }
      }
    });
  }

  // If no polygons matched in the collection, use the selectedFeature object directly
  if (polygons.length === 0 && selectedFeature) {
    const f = selectedFeature as {
      geometry?: GeoJSON.Geometry;
      properties?: Record<string, unknown>;
    };
    if (f && f.geometry) {
      extractCoordinatesFromGeometry(f.geometry, polygons);
    }
  }

  return polygons;
}

/**
 * Normalizes rings that cross the 180th antimeridian to prevent countries (Russia, Alaska, Fiji, Pacific)
 * from splitting or stretching across the entire 360-degree width of the world.
 */
function normalizeAntimeridianPolygons(
  polygons: GeoJSON.Position[][][]
): GeoJSON.Position[][][] {
  let hasFarEast = false;
  let hasFarWest = false;

  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [lng] of ring) {
        if (lng > 90) hasFarEast = true;
        if (lng < -90) hasFarWest = true;
      }
    }
  }

  if (hasFarEast && hasFarWest) {
    return polygons.map((poly) =>
      poly.map((ring) =>
        ring.map(([lng, lat, ...rest]) => [lng < 0 ? lng + 360 : lng, lat, ...rest])
      )
    );
  }

  return polygons;
}

/**
 * Computes bounding box of all polygon coordinates in the projected coordinate system
 */
export function computeProjectedBounds(
  polygons: GeoJSON.Position[][][],
  projection: MapProjection = "mercator"
): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (polygons.length === 0) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  polygons.forEach((poly) => {
    poly.forEach((ring) => {
      ring.forEach(([lng, lat]) => {
        if (typeof lng === "number" && typeof lat === "number" && !isNaN(lng) && !isNaN(lat)) {
          const [px, py] = projectCoordinates(lng, lat, projection);
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      });
    });
  });

  if (minX === Infinity || minY === Infinity || isNaN(minX) || isNaN(minY)) return null;
  return { minX, maxX, minY, maxY };
}

/**
 * Baking information for a land shape inside an output surface (canvas pixels or vector art).
 * Shared by the PNG canvas renderer and the vector XML exporters so both stay pixel-identical.
 */
export interface LandTransform {
  /** Antimeridian-normalized polygons (the exact set used for the fit below) */
  polygons: GeoJSON.Position[][][];
  projection: MapProjection;
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  scale: number;
  renderWidth: number;
  renderHeight: number;
  offsetX: number;
  offsetY: number;
  centerX: number;
  centerY: number;
  /** Projects [lng, lat] into output pixel space (Y flipped, shape centered & fitted) */
  toCanvas: (lng: number, lat: number) => [number, number];
}

/**
 * Fits a country's polygons into a width x height surface with padding, using the exact same
 * conformal projection scale as the live map / Capture Studio canvas.
 * Returns null when the polygons are empty or unprojectable.
 */
export function computeLandTransform(
  polygons: GeoJSON.Position[][][],
  options: {
    width: number;
    height: number;
    paddingRatio?: number;
    showTitle?: boolean;
    projection?: MapProjection;
  }
): LandTransform | null {
  const { width, height, paddingRatio = 0.12, showTitle = false, projection = "mercator" } = options;
  if (!polygons || polygons.length === 0) return null;

  const normalizedPolygons = normalizeAntimeridianPolygons(polygons);
  const bounds = computeProjectedBounds(normalizedPolygons, projection);
  if (!bounds) return null;

  const { minX, maxX, minY, maxY } = bounds;
  const projWidth = Math.max(0.00001, maxX - minX);
  const projHeight = Math.max(0.00001, maxY - minY);

  const paddingX = width * paddingRatio;
  const paddingY = height * paddingRatio + (showTitle ? height * 0.08 : 0);
  const usableWidth = width - 2 * paddingX;
  const usableHeight = height - 2 * paddingY;

  // Exact 1:1 conformal scale matching the map projection space
  const scale = Math.min(usableWidth / projWidth, usableHeight / projHeight);

  const renderWidth = projWidth * scale;
  const renderHeight = projHeight * scale;
  const offsetX = paddingX + (usableWidth - renderWidth) / 2;
  const offsetY = paddingY + (usableHeight - renderHeight) / 2;

  const centerX = offsetX + renderWidth / 2;
  const centerY = offsetY + renderHeight / 2;

  const toCanvas = (lng: number, lat: number): [number, number] => {
    const [px, py] = projectCoordinates(lng, lat, projection);
    return [offsetX + (px - minX) * scale, offsetY + (maxY - py) * scale];
  };

  return {
    polygons: normalizedPolygons,
    projection,
    width,
    height,
    minX,
    maxX,
    minY,
    maxY,
    scale,
    renderWidth,
    renderHeight,
    offsetX,
    offsetY,
    centerX,
    centerY,
    toCanvas,
  };
}

/**
 * Single-pass extraction of every country/region in a dataset.
 * Used by the bulk "all countries × all eras" XML export, where calling
 * getCountryGeometries() once per country would be needlessly expensive.
 */
export function getDatasetCountryGeometries(
  geoJsonData: unknown
): Map<string, { sovereign: string | null; polygons: GeoJSON.Position[][][] }> {
  const byCountry = new Map<string, { sovereign: string | null; polygons: GeoJSON.Position[][][] }>();
  const data = geoJsonData as {
    features?: Array<{
      properties?: Record<string, unknown> | null;
      geometry?: GeoJSON.Geometry;
    }>;
  };

  if (!data || !Array.isArray(data.features)) return byCountry;

  data.features.forEach((f) => {
    if (!f || !f.geometry) return;
    const name = getFeatureName(f.properties);
    if (!name) return;

    let entry = byCountry.get(name);
    if (!entry) {
      entry = { sovereign: getFeatureSovereign(f.properties), polygons: [] };
      byCountry.set(name, entry);
    }
    extractCoordinatesFromGeometry(f.geometry, entry.polygons);
  });

  return byCountry;
}

/** 2×2 mirrored super-tile cache, keyed by the source image element */
const mirrorTileCache = new WeakMap<object, HTMLCanvasElement>();

/**
 * Builds (and caches) the seamless mirror-tile source for an image: a 2×2
 * super-tile whose cells are the image mirrored across each shared edge, so
 * repeating the pattern shows no visible seam. Falls back to the raw image
 * (plain repeat) when no canvas 2d context is available.
 */
function tileSourceFor(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const cached = mirrorTileCache.get(img as object);
  if (cached) return cached;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (typeof document === "undefined" || !w || !h) return img;

  const tile = document.createElement("canvas");
  tile.width = w * 2;
  tile.height = h * 2;
  const tctx = tile.getContext("2d");
  if (!tctx) return img;

  tctx.drawImage(img, 0, 0); // top-left: normal
  tctx.save();
  tctx.translate(w, 0);
  tctx.scale(-1, 1);
  tctx.drawImage(img, 0, 0); // top-right: mirrored X
  tctx.restore();
  tctx.save();
  tctx.translate(0, h);
  tctx.scale(1, -1);
  tctx.drawImage(img, 0, 0); // bottom-left: mirrored Y
  tctx.restore();
  tctx.save();
  tctx.translate(w, h);
  tctx.scale(-1, -1);
  tctx.drawImage(img, 0, 0); // bottom-right: mirrored both
  tctx.restore();

  mirrorTileCache.set(img as object, tile);
  return tile;
}

/**
 * Helper to convert hex to rgba string
 */
export function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

/**
 * Draws the country's land polygons onto an HTML canvas with accurate projection & antimeridian normalization.
 */
export function renderCountryToCanvas(
  canvas: HTMLCanvasElement,
  polygons: GeoJSON.Position[][][],
  options: CaptureOptions
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const {
    width,
    height,
    paddingRatio,
    fillColor,
    fillOpacity,
    borderColor,
    borderWidth,
    backgroundColor,
    showTitle,
    countryName,
    yearLabel,
    projection = "mercator",
    imageFill,
    symbols,
  } = options;

  canvas.width = width;
  canvas.height = height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Fill background if not transparent
  if (backgroundColor && backgroundColor !== "transparent") {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }

  // Normalize antimeridian coordinates + fit the land into the canvas (shared with XML export)
  const land = computeLandTransform(polygons, {
    width,
    height,
    paddingRatio,
    showTitle,
    projection,
  });

  if (!land) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("No geometry available for this country", width / 2, height / 2);
    return;
  }

  const {
    polygons: normalizedPolygons,
    renderWidth: actualRenderW,
    renderHeight: actualRenderH,
    offsetX,
    offsetY,
    centerX: countryCenterX,
    centerY: countryCenterY,
    toCanvas,
  } = land;

  // Construct path for all polygon rings
  const tracePolygons = () => {
    ctx.beginPath();
    normalizedPolygons.forEach((poly) => {
      poly.forEach((ring) => {
        if (ring.length === 0) return;
        const [firstLng, firstLat] = ring[0];
        const [startX, startY] = toCanvas(firstLng, firstLat);
        ctx.moveTo(startX, startY);

        for (let i = 1; i < ring.length; i++) {
          const [lng, lat] = ring[i];
          const [px, py] = toCanvas(lng, lat);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
      });
    });
  };

  // 1. Draw Land Fill (Solid Color OR Image, honoring the layer order)
  const activeFill =
    imageFill && imageFill.image && imageFill.image.complete && imageFill.image.naturalWidth > 0
      ? imageFill
      : null;
  const layerOrder: ImageLayerOrder = imageFill?.layerOrder ?? "masked";

  // Shared painter for an image layer (fit + scale + offset + rotation + filter + opacity).
  // The caller decides whether it runs inside a country-territory clip or on the bare canvas.
  const drawImageLayer = (p: ImageDrawParams) => {
    const img = p.image;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const {
      fitMode,
      scale: userScale,
      offsetX: pctX,
      offsetY: pctY,
      rotation,
      opacity: imgOpacity,
    } = p;

    // Compute dimensions according to fit mode
    let baseW = actualRenderW;
    let baseH = actualRenderH;

    if (fitMode === "cover") {
      const coverRatio = Math.max(actualRenderW / imgW, actualRenderH / imgH);
      baseW = imgW * coverRatio;
      baseH = imgH * coverRatio;
    } else if (fitMode === "contain") {
      const containRatio = Math.min(actualRenderW / imgW, actualRenderH / imgH);
      baseW = imgW * containRatio;
      baseH = imgH * containRatio;
    } else if (fitMode === "stretch") {
      baseW = actualRenderW;
      baseH = actualRenderH;
    } else {
      const aspect = imgW / imgH;
      baseW = actualRenderW;
      baseH = actualRenderW / aspect;
    }

    // Apply manual user scale multiplier
    const finalW = baseW * userScale;
    const finalH = baseH * userScale;

    // Apply manual user offset percentages (relative to country dimensions)
    const shiftX = (pctX / 100) * actualRenderW;
    const shiftY = (pctY / 100) * actualRenderH;

    ctx.save();
    ctx.translate(countryCenterX + shiftX, countryCenterY + shiftY);

    if (rotation !== 0) {
      ctx.rotate((rotation * Math.PI) / 180);
    }

    // Apply optional filter effects (grayscale, sepia, vintage film, etc.)
    if (p.filterEffect && p.filterEffect !== "none") {
      switch (p.filterEffect) {
        case "grayscale":
          ctx.filter = "grayscale(100%)";
          break;
        case "sepia":
          ctx.filter = "sepia(85%) contrast(95%)";
          break;
        case "vintage":
          ctx.filter = "sepia(40%) contrast(110%) brightness(95%)";
          break;
        case "high-contrast":
          ctx.filter = "contrast(140%) saturate(120%)";
          break;
        case "invert":
          ctx.filter = "invert(100%)";
          break;
      }
    }

    ctx.globalAlpha = Math.max(0, Math.min(1, imgOpacity));

    if (p.tile) {
      // Mirror-repeat texture: the pattern is anchored at the layer origin, so
      // panning / rotating / scaling the layer moves & resizes the tiles with it.
      const pattern = ctx.createPattern(tileSourceFor(img), "repeat");
      if (pattern) {
        const s = userScale > 0 ? userScale : 1;
        const rotRad = (rotation * Math.PI) / 180;
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);
        // Canvas corners expressed in the layer's local space (post-rotate,
        // post-scale) — fill exactly the visible area, nothing more.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const corners: Array<[number, number]> = [
          [0, 0],
          [width, 0],
          [width, height],
          [0, height],
        ];
        for (const [gx, gy] of corners) {
          const dx = gx - (countryCenterX + shiftX);
          const dy = gy - (countryCenterY + shiftY);
          const lx = (dx * cos + dy * sin) / s;
          const ly = (-dx * sin + dy * cos) / s;
          if (lx < minX) minX = lx;
          if (lx > maxX) maxX = lx;
          if (ly < minY) minY = ly;
          if (ly > maxY) maxY = ly;
        }
        ctx.scale(s, s);
        ctx.fillStyle = pattern;
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      }
    } else {
      ctx.drawImage(img, -finalW / 2, -finalH / 2, finalW, finalH);
    }

    ctx.restore();
  };

  const layerStack = options.layers;
  const paintTint = (tint: { color: string; opacity: number; blend: GlobalCompositeOperation }) => {
    ctx.save();
    ctx.globalCompositeOperation = tint.blend || "soft-light";
    ctx.fillStyle = hexToRgba(tint.color, tint.opacity);
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  if (layerStack && layerStack.length > 0) {
    // ── Multi-layer stack (Capture Studio layer editor) — BOTTOM → TOP ──
    // Every visible image layer paints in order (optionally clipped to the
    // territory); the country layer fills the territory at its stack position.
    // The border below is always drawn LAST, so the outline stays crisp on top.
    for (const layer of layerStack) {
      if (layer.kind === "image") {
        const img = layer.image;
        if (!img || !img.complete || img.naturalWidth <= 0) continue;

        ctx.save();
        if (layer.clipToLand) {
          tracePolygons();
          ctx.clip("evenodd");
        }
        // Per-layer blend mode vs everything painted beneath it
        ctx.globalCompositeOperation = layer.blendMode || "source-over";
        drawImageLayer(layer);
        if (layer.tint && layer.tint.opacity > 0) {
          paintTint(layer.tint);
        }
        ctx.restore();
      } else if (layer.fillOpacity > 0) {
        ctx.save();
        ctx.globalCompositeOperation = layer.blendMode || "source-over";
        tracePolygons();
        ctx.fillStyle = hexToRgba(layer.fillColor, layer.fillOpacity);
        ctx.fill("evenodd");
        ctx.restore();
      }
    }
  } else if (activeFill && layerOrder === "below") {
    // IMAGE LAYER BELOW THE COUNTRY LAYER:
    // draw the full, unclipped image first, then paint the country fill on top of it.
    drawImageLayer({
      image: activeFill.image!,
      fitMode: activeFill.fitMode,
      scale: activeFill.scale,
      offsetX: activeFill.offsetX,
      offsetY: activeFill.offsetY,
      rotation: activeFill.rotation,
      opacity: activeFill.opacity,
      filterEffect: activeFill.colorCombine?.filterEffect,
    });

    tracePolygons();
    ctx.fillStyle = hexToRgba(fillColor, fillOpacity > 0 ? fillOpacity : 0.85);
    ctx.fill("evenodd");
  } else if (activeFill) {
    // MASKED: the image is clipped inside the country territory (country layer below image)
    tracePolygons();

    // Save state for clipping mask
    ctx.save();
    // 'evenodd' rule natively handles island rings and lake holes!
    ctx.clip("evenodd");

    // STEP A: Draw Base Underlay Land Color FIRST (Underneath the Image)
    if (
      activeFill.colorCombine?.enabled &&
      activeFill.colorCombine.baseColor &&
      activeFill.colorCombine.baseColorOpacity > 0
    ) {
      ctx.fillStyle = hexToRgba(activeFill.colorCombine.baseColor, activeFill.colorCombine.baseColorOpacity);
      ctx.fillRect(0, 0, width, height);
    } else if (fillColor && fillOpacity > 0) {
      ctx.fillStyle = hexToRgba(fillColor, fillOpacity);
      ctx.fillRect(0, 0, width, height);
    }

    // STEP B: Draw the Image ON TOP of the Base Color
    drawImageLayer({
      image: activeFill.image!,
      fitMode: activeFill.fitMode,
      scale: activeFill.scale,
      offsetX: activeFill.offsetX,
      offsetY: activeFill.offsetY,
      rotation: activeFill.rotation,
      opacity: activeFill.opacity,
      filterEffect: activeFill.colorCombine?.filterEffect,
    });

    // STEP C: Optional Non-Destructive Atmosphere Tint (ONLY if explicitly enabled)
    if (
      activeFill.colorCombine?.enabled &&
      activeFill.colorCombine.tintEnabled &&
      activeFill.colorCombine.tintColor &&
      activeFill.colorCombine.tintOpacity &&
      activeFill.colorCombine.tintOpacity > 0
    ) {
      ctx.save();
      ctx.globalCompositeOperation = activeFill.colorCombine.blendMode || "soft-light";
      ctx.fillStyle = hexToRgba(activeFill.colorCombine.tintColor, activeFill.colorCombine.tintOpacity);
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // Restore state after clipping mask
    ctx.restore();
  } else {
    // Solid color fill or fallback while image is loading
    tracePolygons();
    ctx.fillStyle = hexToRgba(fillColor, fillOpacity > 0 ? fillOpacity : 0.85);
    ctx.fill("evenodd");
  }

  // 2. Draw Crisp Straight Border Lines (on top of land/image)
  if (borderWidth > 0) {
    tracePolygons();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.miterLimit = 4;
    ctx.stroke();
  }

  // 2.5 Draw Symbol Overlays (inside the country shape, clipped)
  if (symbols && symbols.length > 0 && symbols.some((s) => s.type !== "none")) {
    tracePolygons();
    ctx.save();
    ctx.clip("evenodd");

    const maxWidth = actualRenderW;
    const maxHeight = actualRenderH;
    const boundsMinX = offsetX;
    const boundsMaxX = offsetX + actualRenderW;
    const boundsMinY = offsetY;
    const boundsMaxY = offsetY + actualRenderH;

    symbols.forEach((sym) => {
      if (sym.type === "none") return;

      if (sym.applyMode === "color-region") {
        // Detect matching color regions on the already-rendered canvas
        const regions = findColorRegionCenters(
          ctx,
          sym.targetColor,
          sym.colorTolerance,
          width,
          height,
          10
        );
        regions.forEach((region) => {
          if (
            region.x >= boundsMinX && region.x <= boundsMaxX &&
            region.y >= boundsMinY && region.y <= boundsMaxY
          ) {
            drawSymbol(ctx, sym, region.x, region.y, maxWidth, maxHeight);
          }
        });
      } else if (sym.applyMode === "fill") {
        // Tile the symbol as a repeating pattern across the shape
        const cellSize = Math.max(20, (sym.size / 100) * Math.min(maxWidth, maxHeight) + sym.spacing);
        const cols = Math.ceil(actualRenderW / cellSize);
        const rows = Math.ceil(actualRenderH / cellSize);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cx = boundsMinX + (col + 0.5) * cellSize;
            const cy = boundsMinY + (row + 0.5) * cellSize;
            drawSymbol(ctx, sym, cx, cy, cellSize, cellSize);
          }
        }
      } else {
        // Default: place at a fixed position on the shape
        const [sx, sy] = getSymbolPosition(
          sym.placement,
          boundsMinX,
          boundsMaxX,
          boundsMinY,
          boundsMaxY
        );
        drawSymbol(ctx, sym, sx, sy, maxWidth, maxHeight);
      }
    });

    ctx.restore();
  }

  // 3. Optional Title Watermark
  if (showTitle) {
    const fontSize = Math.max(14, Math.round(width * 0.035));
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    ctx.fillStyle = backgroundColor === "#ffffff" || backgroundColor === "#F5E6C8" ? "#111827" : "#f3f4f6";
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillText(`${countryName}`, width / 2, height - fontSize * 0.8);

    ctx.font = `500 ${Math.round(fontSize * 0.65)}px monospace`;
    ctx.fillStyle = backgroundColor === "#ffffff" || backgroundColor === "#F5E6C8" ? "#4b5563" : "#d97706";
    ctx.fillText(`${yearLabel}`, width / 2, height - fontSize * 0.15);
  }
}
