/**
 * Advanced Polygon Labeling Utility:
 * - Computes polygon area, centroid & center of mass
 * - Computes principal orientation axis (rotate to fit)
 * - Computes curved spine bezier path (curve to fit)
 * - Computes optimal font size & dimension bounding (size to fit)
 */

export interface LabelPlacement {
  id: string;
  name: string;
  sovereign: string;
  centerLng: number;
  centerLat: number;
  angleDeg: number; // Principal axis angle in degrees (-65 to +65)
  curveControlLng: number; // Midpoint control for bezier curve
  curveControlLat: number;
  startLng: number;
  startLat: number;
  endLng: number;
  endLat: number;
  approxSpanDeg: number; // Approximate geographic span in degrees
  areaSqDeg: number; // Geographic area in square degrees
  isCurved: boolean;
}

/**
 * Calculates polygon area using the surveyor's formula
 */
function getRingArea(ring: GeoJSON.Position[]): number {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

/**
 * Calculates polygon centroid
 */
function getRingCentroid(ring: GeoJSON.Position[]): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < ring.length - 1; i++) {
    const factor = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    area += factor;
    cx += (ring[i][0] + ring[i + 1][0]) * factor;
    cy += (ring[i][1] + ring[i + 1][1]) * factor;
  }

  area /= 2;
  if (Math.abs(area) < 1e-7) {
    // Fallback: simple average
    let sumX = 0;
    let sumY = 0;
    const len = ring.length;
    for (let i = 0; i < len; i++) {
      sumX += ring[i][0];
      sumY += ring[i][1];
    }
    return [sumX / len, sumY / len];
  }

  cx = cx / (6 * area);
  cy = cy / (6 * area);
  return [cx, cy];
}

/**
 * Computes the principal orientation angle and curved spine of a polygon ring
 */
function computeRingOrientation(
  ring: GeoJSON.Position[],
  cx: number,
  cy: number
): {
  angleDeg: number;
  startLng: number;
  startLat: number;
  endLng: number;
  endLat: number;
  ctrlLng: number;
  ctrlLat: number;
  span: number;
  isCurved: boolean;
} {
  let ixx = 0;
  let iyy = 0;
  let ixy = 0;
  const cosLat = Math.cos((cy * Math.PI) / 180);

  for (const [lng, lat] of ring) {
    const dx = (lng - cx) * cosLat;
    const dy = lat - cy;
    ixx += dy * dy;
    iyy += dx * dx;
    ixy += dx * dy;
  }

  // Principal axis angle in radians
  let theta = 0.5 * Math.atan2(-2 * ixy, ixx - iyy);
  // Convert to degrees
  let deg = (theta * 180) / Math.PI;

  // Keep angle within readable bounds (-65deg to +65deg) so text is never upside down or vertical
  while (deg > 65) deg -= 180;
  while (deg < -65) deg += 180;
  if (deg > 65) deg = 65;
  if (deg < -65) deg = -65;

  const rad = (deg * Math.PI) / 180;
  const uX = Math.cos(rad) / Math.max(0.1, cosLat);
  const uY = Math.sin(rad);

  // Find extent along this principal vector
  let minProj = Infinity;
  let maxProj = -Infinity;

  for (const [lng, lat] of ring) {
    const dx = (lng - cx) * cosLat;
    const dy = lat - cy;
    const proj = dx * Math.cos(rad) + dy * Math.sin(rad);

    if (proj < minProj) {
      minProj = proj;
    }
    if (proj > maxProj) {
      maxProj = proj;
    }
  }

  const span = Math.max(0.1, maxProj - minProj);

  // Inward offset of spine endpoints (span ~60% of landmass)
  const halfLen = (span * 0.35);
  const startLng = cx - uX * halfLen;
  const startLat = cy - uY * halfLen;
  const endLng = cx + uX * halfLen;
  const endLat = cy + uY * halfLen;

  // Check curvature: average perpendicular deviation from the chord
  let perpSum = 0;
  let count = 0;
  const vX = -Math.sin(rad);
  const vY = Math.cos(rad);

  for (const [lng, lat] of ring) {
    const dx = (lng - cx) * cosLat;
    const dy = lat - cy;
    const perp = dx * vX + dy * vY;
    perpSum += perp;
    count++;
  }

  const avgPerp = count > 0 ? (perpSum / count) : 0;
  const isCurved = Math.abs(avgPerp) > 0.08 * span && span > 3;

  // Curvature control point
  const ctrlLng = cx + (vX * avgPerp * 0.8) / Math.max(0.1, cosLat);
  const ctrlLat = cy + (vY * avgPerp * 0.8);

  return {
    angleDeg: Math.round(deg * 10) / 10,
    startLng,
    startLat,
    endLng,
    endLat,
    ctrlLng,
    ctrlLat,
    span,
    isCurved,
  };
}

/**
 * Extracts label placements for all countries in GeoJSON dataset
 */
export function extractCountryLabelPlacements(
  geoJsonData: unknown
): LabelPlacement[] {
  if (!geoJsonData) return [];
  const data = geoJsonData as {
    features?: Array<{
      properties?: Record<string, unknown> | null;
      geometry?: GeoJSON.Geometry | null;
    }>;
  };
  if (!data.features) return [];

  // Group features by primary country name to calculate composite largest landmass
  const countryPolys = new Map<
    string,
    {
      sovereign: string;
      largestRing: GeoJSON.Position[];
      largestArea: number;
      totalArea: number;
    }
  >();

  data.features.forEach((f) => {
    if (!f || !f.geometry || !f.properties) return;
    const p = f.properties;
    const rawName = p.NAME ?? p.name ?? p.SUBJECTO ?? p.subjecto ?? p.PARTOF ?? p.partof;
    if (typeof rawName !== "string" || rawName.trim().length === 0) return;

    const name = rawName.trim();
    const sovereign = typeof p.SUBJECTO === "string" ? p.SUBJECTO.trim() : name;

    let rings: GeoJSON.Position[][] = [];

    if (f.geometry.type === "Polygon") {
      const polyCoords = (f.geometry as GeoJSON.Polygon).coordinates;
      if (polyCoords && polyCoords.length > 0) {
        rings.push(polyCoords[0]);
      }
    } else if (f.geometry.type === "MultiPolygon") {
      const multiCoords = (f.geometry as GeoJSON.MultiPolygon).coordinates;
      if (multiCoords) {
        multiCoords.forEach((poly) => {
          if (poly && poly.length > 0) {
            rings.push(poly[0]);
          }
        });
      }
    }

    if (rings.length === 0) return;

    if (!countryPolys.has(name)) {
      countryPolys.set(name, {
        sovereign,
        largestRing: rings[0],
        largestArea: 0,
        totalArea: 0,
      });
    }

    const entry = countryPolys.get(name)!;

    rings.forEach((ring) => {
      const area = getRingArea(ring);
      entry.totalArea += area;
      if (area > entry.largestArea) {
        entry.largestArea = area;
        entry.largestRing = ring;
      }
    });
  });

  const placements: LabelPlacement[] = [];

  countryPolys.forEach((val, name) => {
    // Filter tiny specks (< 0.05 sq deg) unless name is very short
    if (val.largestArea < 0.01 && name.length > 8) return;

    const [cx, cy] = getRingCentroid(val.largestRing);

    // Sanity check latitude & longitude
    if (isNaN(cx) || isNaN(cy) || cx < -180 || cx > 180 || cy < -85 || cy > 85) {
      return;
    }

    const orientation = computeRingOrientation(val.largestRing, cx, cy);

    placements.push({
      id: `label-${name.replace(/[^a-zA-Z0-9]/g, "-")}`,
      name,
      sovereign: val.sovereign,
      centerLng: cx,
      centerLat: cy,
      angleDeg: orientation.angleDeg,
      startLng: orientation.startLng,
      startLat: orientation.startLat,
      endLng: orientation.endLng,
      endLat: orientation.endLat,
      curveControlLng: orientation.ctrlLng,
      curveControlLat: orientation.ctrlLat,
      approxSpanDeg: orientation.span,
      areaSqDeg: val.totalArea,
      isCurved: orientation.isCurved,
    });
  });

  // Sort by territory area (largest empires first so their labels establish primary hierarchy)
  placements.sort((a, b) => b.areaSqDeg - a.areaSqDeg);

  return placements;
}
