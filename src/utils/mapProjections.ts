import {
  geoMercator,
  geoEquirectangular,
  geoNaturalEarth1,
  geoOrthographic,
  geoEqualEarth,
  geoTransverseMercator,
  geoAlbers,
  geoAzimuthalEqualArea,
  geoGraticule10,
  type GeoProjection,
} from "d3-geo";
import {
  geoRobinson,
  geoMollweide,
  geoWinkel3,
  geoBonne,
  geoEckert4,
  geoHammer,
  geoAitoff,
  geoArmadillo,
} from "d3-geo-projection";

export type ProjectionId =
  | "mercator"
  | "equirectangular"
  | "naturalEarth"
  | "robinson"
  | "mollweide"
  | "winkel3"
  | "equalEarth"
  | "orthographic"
  | "armadillo"
  | "bonne"
  | "eckert4"
  | "hammer"
  | "aitoff"
  | "albers"
  | "azimuthalEqualArea"
  | "transverseMercator";

export interface ProjectionInfo {
  id: ProjectionId;
  label: string;
  icon: string;
  isGlobe: boolean;
}

export const PROJECTIONS: ProjectionInfo[] = [
  { id: "mercator", label: "Web Mercator", icon: "🗺️", isGlobe: false },
  { id: "orthographic", label: "3D Globe", icon: "🌍", isGlobe: true },
  { id: "naturalEarth", label: "Natural Earth", icon: "🌐", isGlobe: false },
  { id: "robinson", label: "Robinson", icon: "📊", isGlobe: false },
  { id: "mollweide", label: "Mollweide", icon: "🥚", isGlobe: false },
  { id: "winkel3", label: "Winkel Tripel", icon: "⭐", isGlobe: false },
  { id: "equalEarth", label: "Equal Earth", icon: "⚖️", isGlobe: false },
  { id: "equirectangular", label: "Equirectangular", icon: "📐", isGlobe: false },
  { id: "armadillo", label: "Armadillo", icon: "🦔", isGlobe: true },
  { id: "bonne", label: "Bonne", icon: "💝", isGlobe: false },
  { id: "eckert4", label: "Eckert IV", icon: "🔄", isGlobe: false },
  { id: "hammer", label: "Hammer", icon: "🔨", isGlobe: false },
  { id: "aitoff", label: "Aitoff", icon: "🔵", isGlobe: false },
  { id: "albers", label: "Albers", icon: "🇺🇸", isGlobe: false },
  { id: "azimuthalEqualArea", label: "Azimuthal Equal Area", icon: "🎯", isGlobe: false },
  { id: "transverseMercator", label: "Transverse Mercator", icon: "🔄", isGlobe: false },
];

export interface ViewTransform {
  zoom: number;
  centerX: number;
  centerY: number;
  rotation: [number, number, number];
}

export const DEFAULT_VIEW: ViewTransform = {
  zoom: 1,
  centerX: 0,
  centerY: 0,
  rotation: [0, 0, 0],
};

/**
 * Creates a d3-geo projection with zoom, pan, and rotation support
 */
export function createProjection(
  id: ProjectionId,
  width: number,
  height: number,
  view: ViewTransform = DEFAULT_VIEW
): GeoProjection {
  let projection: GeoProjection;

  switch (id) {
    case "mercator": projection = geoMercator(); break;
    case "equirectangular": projection = geoEquirectangular(); break;
    case "naturalEarth": projection = geoNaturalEarth1(); break;
    case "robinson": projection = geoRobinson(); break;
    case "mollweide": projection = geoMollweide(); break;
    case "winkel3": projection = geoWinkel3(); break;
    case "equalEarth": projection = geoEqualEarth(); break;
    case "orthographic": projection = geoOrthographic(); break;
    case "armadillo": projection = geoArmadillo(); break;
    case "bonne": projection = geoBonne(); break;
    case "eckert4": projection = geoEckert4(); break;
    case "hammer": projection = geoHammer(); break;
    case "aitoff": projection = geoAitoff(); break;
    case "albers": projection = geoAlbers(); break;
    case "azimuthalEqualArea": projection = geoAzimuthalEqualArea(); break;
    case "transverseMercator": projection = geoTransverseMercator(); break;
    default: projection = geoMercator();
  }

  // Apply rotation for globe projections
  const [rx, ry] = view.rotation;
  if (rx !== 0 || ry !== 0) {
    projection.rotate([rx, ry, 0]);
  }

  // Fit to viewport
  const padding = Math.min(width, height) * 0.08;
  projection.fitExtent(
    [
      [padding, padding],
      [width - padding, height - padding],
    ],
    { type: "Sphere" } as unknown as GeoJSON.Feature
  );

  // Apply zoom via scale
  if (view.zoom !== 1) {
    const currentScale = projection.scale();
    projection.scale(currentScale * view.zoom);
  }

  // Apply pan via translate
  if (view.centerX !== 0 || view.centerY !== 0) {
    const currentTranslate = projection.translate();
    projection.translate([
      currentTranslate[0] + view.centerX,
      currentTranslate[1] + view.centerY,
    ]);
  }

  return projection;
}

/**
 * Returns graticule grid lines as GeoJSON
 */
export function getGraticule(): GeoJSON.FeatureCollection {
  return geoGraticule10() as unknown as GeoJSON.FeatureCollection;
}
