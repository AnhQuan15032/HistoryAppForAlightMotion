export type SymbolType =
  | "none"
  | "cross"
  | "cross-of-lorraine"
  | "saltire"
  | "star"
  | "star-outline"
  | "circle"
  | "circle-outline"
  | "triangle"
  | "square"
  | "diamond"
  | "crescent"
  | "union-jack"
  | "nordic-cross"
  | "vertical-stripes"
  | "horizontal-stripes"
  | "diagonal-stripes"
  | "checky"
  | "bend"
  | "pale"
  | "fess"
  | "chevron"
  | "canton"
  | "border-frame";

export interface SymbolInfo {
  id: SymbolType;
  label: string;
  icon: string;
  category: "charge" | "cross" | "geometric" | "division" | "pattern";
}

export const SYMBOLS: SymbolInfo[] = [
  { id: "none", label: "None", icon: "⬜", category: "charge" },
  { id: "cross", label: "Cross", icon: "✚", category: "cross" },
  { id: "cross-of-lorraine", label: "Lorraine Cross", icon: "☨", category: "cross" },
  { id: "saltire", label: "Saltire (X)", icon: "✕", category: "cross" },
  { id: "nordic-cross", label: "Nordic Cross", icon: "🇩🇰", category: "cross" },
  { id: "star", label: "Star", icon: "★", category: "charge" },
  { id: "star-outline", label: "Star (Outline)", icon: "☆", category: "charge" },
  { id: "circle", label: "Circle / Sun Disc", icon: "●", category: "charge" },
  { id: "circle-outline", label: "Circle (Outline)", icon: "○", category: "charge" },
  { id: "crescent", label: "Crescent", icon: "🌙", category: "charge" },
  { id: "triangle", label: "Triangle", icon: "▲", category: "geometric" },
  { id: "square", label: "Square", icon: "■", category: "geometric" },
  { id: "diamond", label: "Diamond / Lozenge", icon: "◆", category: "geometric" },
  { id: "vertical-stripes", label: "Vertical Stripes", icon: "⫼", category: "pattern" },
  { id: "horizontal-stripes", label: "Horizontal Stripes", icon: "≣", category: "pattern" },
  { id: "diagonal-stripes", label: "Diagonal Stripes", icon: "cctor", category: "pattern" },
  { id: "checky", label: "Checky Pattern", icon: "▦", category: "pattern" },
  { id: "bend", label: "Bend (Diagonal)", icon: "◤", category: "division" },
  { id: "pale", label: "Pale (Vertical Band)", icon: "◫", category: "division" },
  { id: "fess", label: "Fess (Horizontal Band)", icon: "▬", category: "division" },
  { id: "chevron", label: "Chevron", icon: "◣", category: "division" },
  { id: "canton", label: "Canton (Corner Box)", icon: "◧", category: "division" },
  { id: "border-frame", label: "Border Frame", icon: "▢", category: "division" },
  { id: "union-jack", label: "Union Jack Style", icon: "🇬🇧", category: "pattern" },
];

export type SymbolPlacement = "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type SymbolApplyMode = "shape" | "color-region" | "fill";

export interface SymbolOptions {
  type: SymbolType;
  color: string;
  opacity: number;
  size: number;
  rotation: number;
  thickness: number;
  placement: SymbolPlacement;
  offsetX: number;
  offsetY: number;
  count: number;
  spacing: number;
  /** How the symbol is applied */
  applyMode: SymbolApplyMode;
  /** For color-region mode: the target color to match (hex) */
  targetColor: string;
  /** For color-region mode: tolerance 0-100 */
  colorTolerance: number;
  /** For color-region mode: sample the source image */
  sampleFromImage: boolean;
}

export const DEFAULT_SYMBOL_OPTIONS: SymbolOptions = {
  type: "none",
  color: "#FFFFFF",
  opacity: 1.0,
  size: 40,
  rotation: 0,
  thickness: 8,
  placement: "center",
  offsetX: 0,
  offsetY: 0,
  count: 1,
  spacing: 20,
  applyMode: "shape",
  targetColor: "#FF0000",
  colorTolerance: 30,
  sampleFromImage: true,
};

/**
 * Converts a hex color to RGB tuple
 */
export function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace("#", "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return [255, 0, 0];
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

/**
 * Converts an RGB tuple to hex string
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Finds all regions (bounding boxes of connected pixels) matching a target color
 * within an image drawn on a canvas. Returns the centers of those regions.
 */
export function findColorRegionCenters(
  ctx: CanvasRenderingContext2D,
  targetHex: string,
  tolerance: number,
  width: number,
  height: number,
  sampleStep: number = 8
): Array<{ x: number; y: number; count: number }> {
  const [tr, tg, tb] = hexToRgb(targetHex);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const regions: Array<{ sumX: number; sumY: number; count: number }> = [];
  const grid: number[][] = [];

  // Build a boolean grid of matching pixels
  for (let y = 0; y < height; y += sampleStep) {
    const row: number[] = [];
    for (let x = 0; x < width; x += sampleStep) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      const matches = isColorMatch(r, g, b, a, tr, tg, tb, tolerance);
      row.push(matches ? 1 : 0);
    }
    grid.push(row);
  }

  // Simple connected-component labeling (flood fill)
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (grid[gy][gx] === 1 && !visited[gy][gx]) {
        // Flood fill from this pixel
        const stack: Array<[number, number]> = [[gx, gy]];
        let sumX = 0, sumY = 0, count = 0;
        visited[gy][gx] = true;

        while (stack.length > 0) {
          const [cx, cy] = stack.pop()!;
          sumX += cx * sampleStep;
          sumY += cy * sampleStep;
          count++;

          // Check 4 neighbors
          const neighbors: Array<[number, number]> = [
            [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1],
          ];
          for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < cols && ny >= 0 && ny < rows &&
                grid[ny][nx] === 1 && !visited[ny][nx]) {
              visited[ny][nx] = true;
              stack.push([nx, ny]);
            }
          }
        }

        if (count > 2) {
          regions.push({
            sumX: sumX / count,
            sumY: sumY / count,
            count,
          });
        }
      }
    }
  }

  // Convert to centers, sorted by size (largest first)
  return regions
    .map((r) => ({ x: r.sumX, y: r.sumY, count: r.count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Samples the color at a specific pixel from a canvas
 */
export function samplePixelColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number
): string {
  const data = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return rgbToHex(data[0], data[1], data[2]);
}

/**
 * Gets the N most dominant colors from a canvas region (for palette suggestions)
 */
export function extractColorPalette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  maxColors: number = 6
): Array<{ hex: string; percentage: number }> {
  const data = ctx.getImageData(0, 0, width, height).data;
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>();
  let total = 0;

  for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { count: 1, r, g, b });
    }
    total++;
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((v) => ({
      hex: rgbToHex(v.r, v.g, v.b),
      percentage: total > 0 ? Math.round((v.count / total) * 100) : 0,
    }));
}

/**
 * Draws a symbol onto a canvas context at the specified position
 */
export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  opts: SymbolOptions,
  cx: number,
  cy: number,
  maxWidth: number,
  maxHeight: number
): void {
  if (opts.type === "none") return;

  const size = Math.min(opts.size / 100 * Math.min(maxWidth, maxHeight), Math.min(maxWidth, maxHeight));
  const half = size / 2;
  const thick = Math.max(1, (opts.thickness / 100) * size);

  ctx.save();
  ctx.translate(cx + (opts.offsetX / 100) * maxWidth, cy + (opts.offsetY / 100) * maxHeight);

  if (opts.rotation !== 0) {
    ctx.rotate((opts.rotation * Math.PI) / 180);
  }

  ctx.globalAlpha = opts.opacity;
  ctx.fillStyle = opts.color;
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = thick;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";

  switch (opts.type) {
    case "cross":
      ctx.fillRect(-thick / 2, -half, thick, size);
      ctx.fillRect(-half, -thick / 2, size, thick);
      break;

    case "cross-of-lorraine":
      ctx.fillRect(-thick / 2, -half, thick, size);
      const armW = size * 0.45;
      const armT = thick * 0.75;
      ctx.fillRect(-armW / 2, -half * 0.55, armW, armT);
      ctx.fillRect(-armW / 2, -half * 0.05, armW, armT);
      break;

    case "saltire":
      ctx.beginPath();
      ctx.moveTo(-half, -half); ctx.lineTo(half, half);
      ctx.moveTo(half, -half); ctx.lineTo(-half, half);
      ctx.stroke();
      break;

    case "nordic-cross":
      ctx.fillRect(-half - thick / 2, -half, thick * 3, size);
      ctx.fillRect(-half - size * 0.15, -half, thick, size);
      break;

    case "star":
    case "star-outline": {
      const points = 5;
      const outerR = half;
      const innerR = outerR * 0.382;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const px = r * Math.cos(angle);
        const py = r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (opts.type === "star") {
        ctx.fill();
      } else {
        ctx.lineWidth = thick * 0.5;
        ctx.stroke();
      }
      break;
    }

    case "circle":
    case "circle-outline":
      ctx.beginPath();
      ctx.arc(0, 0, half, 0, Math.PI * 2);
      if (opts.type === "circle") {
        ctx.fill();
      } else {
        ctx.lineWidth = thick * 0.5;
        ctx.stroke();
      }
      break;

    case "crescent": {
      ctx.beginPath();
      ctx.arc(0, 0, half, 0.5, Math.PI * 2 - 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(half * 0.3, 0, half * 0.8, 0.5, Math.PI * 2 - 0.5);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      break;
    }

    case "triangle":
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(half * 0.87, half * 0.5);
      ctx.lineTo(-half * 0.87, half * 0.5);
      ctx.closePath();
      ctx.fill();
      break;

    case "square":
      ctx.fillRect(-half, -half, size, size);
      break;

    case "diamond":
      ctx.beginPath();
      ctx.moveTo(0, -half);
      ctx.lineTo(half, 0);
      ctx.lineTo(0, half);
      ctx.lineTo(-half, 0);
      ctx.closePath();
      ctx.fill();
      break;

    case "vertical-stripes": {
      const stripeW = size / (opts.count * 2 - 1);
      for (let i = 0; i < opts.count; i++) {
        ctx.fillRect(-half + i * stripeW * 2, -half, stripeW, size);
      }
      break;
    }

    case "horizontal-stripes": {
      const stripeH = size / (opts.count * 2 - 1);
      for (let i = 0; i < opts.count; i++) {
        ctx.fillRect(-half, -half + i * stripeH * 2, size, stripeH);
      }
      break;
    }

    case "diagonal-stripes": {
      const gap = size / (opts.count * 2 - 1);
      for (let i = 0; i < opts.count; i++) {
        const offset = -half + i * gap * 2;
        ctx.beginPath();
        ctx.moveTo(offset, half);
        ctx.lineTo(offset + gap, half);
        ctx.lineTo(offset + gap + size * 0.4, -half);
        ctx.lineTo(offset + size * 0.4, -half);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }

    case "checky": {
      const cell = size / Math.max(2, opts.count);
      for (let y = 0; y < Math.max(2, opts.count); y++) {
        for (let x = 0; x < Math.max(2, opts.count); x++) {
          if ((x + y) % 2 === 0) {
            ctx.fillRect(-half + x * cell, -half + y * cell, cell, cell);
          }
        }
      }
      break;
    }

    case "bend":
      ctx.beginPath();
      ctx.moveTo(-half, half);
      ctx.lineTo(-half + thick, half);
      ctx.lineTo(half, -half);
      ctx.lineTo(half - thick, -half);
      ctx.closePath();
      ctx.fill();
      break;

    case "pale":
      ctx.fillRect(-thick, -half, thick * 2, size);
      break;

    case "fess":
      ctx.fillRect(-half, -thick, size, thick * 2);
      break;

    case "chevron":
      ctx.beginPath();
      ctx.moveTo(-half, half);
      ctx.lineTo(0, 0);
      ctx.lineTo(half, half);
      ctx.lineTo(half, half - thick);
      ctx.lineTo(0, thick);
      ctx.lineTo(-half, half - thick);
      ctx.closePath();
      ctx.fill();
      break;

    case "canton":
      ctx.fillRect(-half, -half, size * 0.4, size * 0.4);
      break;

    case "border-frame":
      ctx.lineWidth = thick;
      ctx.strokeRect(-half, -half, size, size);
      break;

    case "union-jack":
      // Simplified Union Jack style: cross + saltire
      ctx.fillRect(-half, -thick * 0.4, size, thick * 0.8);
      ctx.fillRect(-thick * 0.4, -half, thick * 0.8, size);
      ctx.lineWidth = thick * 0.35;
      ctx.beginPath();
      ctx.moveTo(-half, -half); ctx.lineTo(half, half);
      ctx.moveTo(half, -half); ctx.lineTo(-half, half);
      ctx.stroke();
      break;
  }

  ctx.restore();
}

/**
 * Gets the symbol placement position within a bounding box
 */
export function getSymbolPosition(
  placement: SymbolPlacement,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): [number, number] {
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const w = maxX - minX;
  const h = maxY - minY;

  switch (placement) {
    case "top-left": return [minX + w * 0.25, minY + h * 0.25];
    case "top-right": return [maxX - w * 0.25, minY + h * 0.25];
    case "bottom-left": return [minX + w * 0.25, maxY - h * 0.25];
    case "bottom-right": return [maxX - w * 0.25, maxY - h * 0.25];
    case "center":
    default: return [midX, midY];
  }
}

/**
 * Determines if a pixel color is within tolerance of a target color
 * Used for color-based symbol application
 */
export function isColorMatch(
  r: number, g: number, b: number, a: number,
  targetR: number, targetG: number, targetB: number,
  tolerance: number
): boolean {
  if (a < 10) return false;
  const dist = Math.sqrt(
    (r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2
  );
  // tolerance is 0-100, convert to 0-441 (max RGB distance)
  return dist <= (tolerance / 100) * 441;
}

/**
 * Extracts the dominant color from an image region
 */
export function getDominantColor(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number
): [number, number, number] {
  if (w <= 0 || h <= 0) return [255, 255, 255];
  const data = ctx.getImageData(x, y, Math.floor(w), Math.floor(h)).data;
  const counts = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    // Quantize to reduce noise
    const key = `${Math.round(r / 16)}-${Math.round(g / 16)}-${Math.round(b / 16)}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { count: 1, r, g, b });
    }
  }

  let best = { count: 0, r: 255, g: 255, b: 255 };
  counts.forEach((v) => {
    if (v.count > best.count) {
      best = v;
    }
  });

  return [best.r, best.g, best.b];
}
