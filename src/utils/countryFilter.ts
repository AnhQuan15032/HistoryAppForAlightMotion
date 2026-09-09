/**
 * Checks whether a name represents unknown / unclaimed / placeholder land
 */
export function isUnknownLand(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim().toLowerCase();
  if (trimmed.length === 0) return true;

  // Strict unknown / unclaimed patterns only
  const unknownPatterns = [
    "unknown",
    "unknown land",
    "unclaimed",
    "unclaimed land",
    "undetermined",
    "terra incognita",
    "unoccupied",
    "unmapped",
    "ocean",
    "sea",
    "void",
    "empty",
    "none",
    "null",
    "undefined",
    "n/a",
  ];

  if (unknownPatterns.includes(trimmed)) return true;

  // Check if it's only whitespace or punctuation
  if (/^[\s\-_.,/\\#?!]+$/.test(name)) return true;

  return false;
}

/**
 * Resolves the display/canonical name of a feature across diverse GeoJSON property schemas
 * Supports custom imported GeoJSON files from Natural Earth, QGIS, Census, Wikipedia, etc.
 */
export function getFeatureName(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null;

  const candidateFields = [
    "NAME",
    "name",
    "NAME_EN",
    "name_en",
    "TITLE",
    "title",
    "SUBJECTO",
    "subjecto",
    "PARTOF",
    "partof",
    "ADMIN",
    "admin",
    "COUNTRY",
    "country",
    "CNTRY_NAME",
    "SOVEREIGNT",
    "sovereignt",
    "FORMAL_EN",
    "formal_en",
    "ABBREVN",
    "abbrevn",
    "LABEL",
    "label",
    "prov_name",
    "reg_name",
    "STATE",
    "state",
    "region",
    "REGION",
    "province",
    "PROVINCE",
  ];

  for (const field of candidateFields) {
    const val = properties[field];
    if (typeof val === "string" && val.trim().length > 0 && !isUnknownLand(val)) {
      return val.trim();
    }
  }

  // Fallback: search any non-id string field
  for (const [key, val] of Object.entries(properties)) {
    if (
      typeof val === "string" &&
      val.trim().length > 0 &&
      !key.toLowerCase().includes("id") &&
      !key.toLowerCase().includes("code") &&
      !key.toLowerCase().includes("color") &&
      !isUnknownLand(val)
    ) {
      return val.trim();
    }
  }

  return null;
}

/**
 * Resolves the sovereign / ruling power name of a feature
 */
export function getFeatureSovereign(properties: Record<string, unknown> | null | undefined): string | null {
  if (!properties) return null;

  const candidateFields = [
    "SUBJECTO",
    "subjecto",
    "PARTOF",
    "partof",
    "SOVEREIGNT",
    "sovereignt",
    "ADMIN",
    "admin",
    "NAME",
    "name",
  ];

  for (const field of candidateFields) {
    const val = properties[field];
    if (typeof val === "string" && val.trim().length > 0 && !isUnknownLand(val)) {
      return val.trim();
    }
  }

  return getFeatureName(properties);
}

/**
 * Checks if a GeoJSON feature is valid historical land
 */
export function isValidFeature(feature: {
  properties?: Record<string, unknown> | null;
  geometry?: GeoJSON.Geometry | null;
} | null | undefined): boolean {
  if (!feature) return false;

  // Verify geometry exists
  if (!feature.geometry || !feature.geometry.type) {
    return false;
  }

  // Check coordinates exist and are non-empty
  const geom = feature.geometry as { coordinates?: unknown; geometries?: unknown };
  if (feature.geometry.type === "GeometryCollection") {
    if (!geom.geometries || !Array.isArray(geom.geometries) || geom.geometries.length === 0) {
      return false;
    }
  } else {
    if (!geom.coordinates || !Array.isArray(geom.coordinates) || geom.coordinates.length === 0) {
      return false;
    }
  }

  // Must have a resolvable non-unknown name
  const name = getFeatureName(feature.properties);
  if (!name) {
    return false;
  }

  return true;
}

/**
 * Checks if a feature matches the specific country filter (case-insensitive and trimmed)
 */
export function matchesCountryFilter(
  feature: {
    properties?: Record<string, unknown> | null;
  } | null | undefined,
  countryName: string | null
): boolean {
  if (!countryName || countryName.trim().length === 0) return true;
  if (!feature || !feature.properties) return false;

  const target = countryName.trim().toLowerCase();
  const p = feature.properties;

  const name = getFeatureName(p)?.toLowerCase();
  const subjecto = getFeatureSovereign(p)?.toLowerCase();
  const rawPartOf = p.PARTOF ?? p.partof;
  const partOf = typeof rawPartOf === "string" ? rawPartOf.trim().toLowerCase() : "";

  return name === target || subjecto === target || partOf === target;
}
