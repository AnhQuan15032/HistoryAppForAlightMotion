import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import { getColorForName } from "../utils/colors";
import { isValidFeature, matchesCountryFilter, getFeatureName } from "../utils/countryFilter";
import { MapLayerType, createMapTileLayer } from "./MapLayerControl";
import { ProjectionId } from "../utils/mapProjections";
import ProjectionMap from "./ProjectionMap";

interface HistoryMapProps {
  geoJsonData: unknown | null;
  loading: boolean;
  onFeatureSelect: (feature: unknown | null) => void;
  selectedFeatureName: string | null;
  onlyShowCountry: string | null;
  mapLayer: MapLayerType;
  showLabels?: boolean;
  projectionId?: ProjectionId;
  onCountryLabelClick?: (name: string) => void;
}

export default function HistoryMap({
  geoJsonData,
  loading,
  onFeatureSelect,
  selectedFeatureName,
  onlyShowCountry,
  mapLayer,
  showLabels = true,
  projectionId = "mercator",
  onCountryLabelClick,
}: HistoryMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  const isMercator = projectionId === "mercator";

  const isDarkBackground =
    mapLayer !== "light" && mapLayer !== "watercolor" && mapLayer !== "bing-light" && mapLayer !== "antique-relief";

  // Initialize Leaflet map (only for Mercator)
  useEffect(() => {
    if (!isMercator) return;
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [30, 15],
      zoom: 3,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
      preferCanvas: true,
      renderer: L.canvas({ padding: 0.5, tolerance: 10 }),
      fadeAnimation: true,
      zoomAnimation: true,
      markerZoomAnimation: false,
    });

    if (!map.getPane("historicalBordersPane")) {
      const customPane = map.createPane("historicalBordersPane");
      customPane.style.zIndex = "550";
      customPane.style.pointerEvents = "auto";
    }

    // Labels pane (integrated into map)
    if (!map.getPane("historicalLabelsPane")) {
      const labelsPane = map.createPane("historicalLabelsPane");
      labelsPane.style.zIndex = "560";
    }

    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;
    setMapInstance(map);

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.invalidateSize({ debounceMoveend: true });
      }
    };
    window.addEventListener("resize", handleResize, { passive: true });
    setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize({ debounceMoveend: true });
    }, 100);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapInstance(null);
      }
    };
  }, [isMercator]);

  // Cleanup Leaflet when switching to non-Mercator
  useEffect(() => {
    if (!isMercator && mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
      geoJsonLayerRef.current = null;
      tileLayerRef.current = null;
      setMapInstance(null);
    }
  }, [isMercator]);

  // Update tile layer
  useEffect(() => {
    if (!isMercator || !mapRef.current) return;
    const map = mapRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const tile = createMapTileLayer(mapLayer);
    if (tile) {
      tile.options.updateWhenIdle = true;
      tile.options.updateWhenZooming = false;
      tile.options.keepBuffer = 2;
      tile.addTo(map);
      tileLayerRef.current = tile;
      if (geoJsonLayerRef.current) geoJsonLayerRef.current.bringToFront();
    }
  }, [mapLayer, isMercator]);

  // Polygon styling
  const getStyle = useCallback(
    (feature: unknown): L.PathOptions => {
      const f = feature as {
        properties?: { NAME?: string; SUBJECTO?: string; PARTOF?: string };
      };
      const name = f.properties?.SUBJECTO || f.properties?.NAME || "Unknown";
      const featureName = f.properties?.NAME || "";
      const color = getColorForName(name);
      const isSelected = featureName === selectedFeatureName;
      const isLightMap =
        mapLayer === "light" || mapLayer === "watercolor" || mapLayer === "bing-light" || mapLayer === "antique-relief";

      return {
        stroke: true,
        color: isSelected ? "#ffffff" : isLightMap ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.75)",
        weight: isSelected ? 3.0 : 1.5,
        opacity: 1,
        fill: true,
        fillColor: color,
        fillOpacity: isSelected ? 0.85 : 0.55,
        dashArray: undefined,
        lineCap: "square",
        lineJoin: "miter",
        pane: "historicalBordersPane",
      };
    },
    [selectedFeatureName, mapLayer]
  );

  const filterFeature = useCallback(
    (feature: GeoJSON.Feature): boolean => {
      if (!isValidFeature(feature)) return false;
      if (onlyShowCountry) return matchesCountryFilter(feature, onlyShowCountry);
      return true;
    },
    [onlyShowCountry]
  );

  // Update GeoJSON layer
  useEffect(() => {
    if (!isMercator) return;
    const map = mapRef.current;
    if (!map) return;

    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.clearLayers();
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    if (!geoJsonData) return;

    try {
      const layer = L.geoJSON(geoJsonData as GeoJSON.GeoJsonObject, {
        style: getStyle,
        filter: filterFeature,
        pane: "historicalBordersPane",
        onEachFeature: (feature, featLayer) => {
          const featureName = feature.properties?.NAME || "Unknown";
          const subjecto = feature.properties?.SUBJECTO;
          const partOf = feature.properties?.PARTOF;

          let tooltipContent = `<div class="font-sans"><div class="font-bold text-amber-300 text-sm">${featureName}</div>`;
          if (subjecto && subjecto !== featureName)
            tooltipContent += `<div class="text-xs text-gray-300 mt-0.5"><span class="text-gray-400">Under:</span> ${subjecto}</div>`;
          if (partOf)
            tooltipContent += `<div class="text-xs text-gray-300 mt-0.5"><span class="text-gray-400">Part of:</span> ${partOf}</div>`;
          tooltipContent += `</div>`;

          featLayer.bindTooltip(tooltipContent, {
            sticky: true,
            className: "history-tooltip",
            direction: "top",
            offset: [0, -10],
          });

          featLayer.on("click", () => onFeatureSelect(feature));
          featLayer.on("mouseover", (e: L.LeafletMouseEvent) => {
            const target = e.target as L.Path;
            target.setStyle({ fillOpacity: 0.85, weight: 3, color: "#ffffff" });
            target.bringToFront();
          });
          featLayer.on("mouseout", (e: L.LeafletMouseEvent) => {
            const target = e.target as L.Path;
            if (featureName !== selectedFeatureName) {
              geoJsonLayerRef.current?.resetStyle(target);
            }
          });
        },
      });

      layer.addTo(map);
      geoJsonLayerRef.current = layer;

      if (onlyShowCountry) {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 8, duration: 0.7 });
        }
      } else if ((geoJsonData as { type?: string }).type === "FeatureCollection") {
        const bounds = layer.getBounds();
        if (bounds.isValid() && bounds.getNorth() - bounds.getSouth() < 140) {
          map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 7, duration: 0.7 });
        }
      }
    } catch (err) {
      console.error("Error rendering GeoJSON layer:", err);
    }
  }, [geoJsonData, isMercator, getStyle, filterFeature, onFeatureSelect, selectedFeatureName, onlyShowCountry]);

  // Re-style on selection change
  useEffect(() => {
    if (isMercator && geoJsonLayerRef.current) {
      geoJsonLayerRef.current.setStyle(getStyle as (feature: unknown) => L.PathOptions);
    }
  }, [selectedFeatureName, mapLayer, isMercator, getStyle]);

  // For Mercator: render labels as part of map using canvas
  const MercatorLabels = useMemo(() => {
    if (!isMercator || !mapInstance || !showLabels) return null;

    return (
      <MercatorCanvasLabels
        map={mapInstance}
        geoJsonData={geoJsonData}
        selectedFeatureName={selectedFeatureName}
        onlyShowCountry={onlyShowCountry}
        isDark={isDarkBackground}
      />
    );
  }, [isMercator, mapInstance, showLabels, geoJsonData, selectedFeatureName, onlyShowCountry, isDarkBackground, onCountryLabelClick]);

  // Zoom to selection for Mercator
  const zoomToSelection = useCallback(() => {
    if (!isMercator || !mapRef.current || !selectedFeatureName || !geoJsonData) return;

    const data = geoJsonData as {
      features?: Array<{
        properties?: Record<string, unknown> | null;
        geometry?: GeoJSON.Geometry;
      }>;
    };

    const feature = data.features?.find(
      (f) => getFeatureName(f.properties) === selectedFeatureName
    );
    if (!feature?.geometry) return;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    const walk = (coords: unknown) => {
      if (Array.isArray(coords)) {
        if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
          const [lng, lat] = coords as [number, number];
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        } else {
          coords.forEach(walk);
        }
      }
    };
    if (feature.geometry.type === "Polygon") walk((feature.geometry as GeoJSON.Polygon).coordinates);
    else if (feature.geometry.type === "MultiPolygon") walk((feature.geometry as GeoJSON.MultiPolygon).coordinates);
    if (minLng === Infinity) return;

    mapRef.current.flyToBounds(
      [[minLat, minLng], [maxLat, maxLng]],
      { padding: [60, 60], duration: 1.0 }
    );
  }, [isMercator, geoJsonData, selectedFeatureName]);

  return (
    <div className="relative h-full w-full">
      {/* Leaflet container (Mercator only) */}
      {isMercator && (
        <>
          <div ref={containerRef} className="h-full w-full" />
          {MercatorLabels}

          {/* Zoom to Selection (Mercator) */}
          {selectedFeatureName && (
            <button
              onClick={zoomToSelection}
              title={`Zoom to ${selectedFeatureName}`}
              className="absolute top-20 right-4 z-[600] w-10 h-10 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/40 text-amber-300 text-sm font-bold flex items-center justify-center cursor-pointer hover:bg-amber-500/30 active:scale-95 shadow-lg transition-all"
            >
              🎯
            </button>
          )}
        </>
      )}

      {/* ProjectionMap (non-Mercator projections + 3D globe) */}
      {!isMercator && (
        <ProjectionMap
          geoJsonData={geoJsonData}
          projectionId={projectionId}
          showLabels={showLabels}
          selectedFeatureName={selectedFeatureName}
          onlyShowCountry={onlyShowCountry}
          onFeatureSelect={onFeatureSelect}
          isDarkBackground={isDarkBackground}
        />
      )}

      {loading && (
        <div className="absolute top-4 left-1/2 z-[1000] -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-full bg-gray-900/90 px-5 py-2.5 shadow-xl backdrop-blur-md border border-white/10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            <span className="text-sm font-medium text-amber-200">Loading historical map…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline component for Mercator canvas labels (integrated into map, not overlay)
import { useMemo } from "react";
import { extractCountryLabelPlacements } from "../utils/polygonLabel";

function MercatorCanvasLabels({
  map,
  geoJsonData,
  selectedFeatureName,
  onlyShowCountry,
  isDark,
}: {
  map: L.Map;
  geoJsonData: unknown | null;
  selectedFeatureName: string | null;
  onlyShowCountry: string | null;
  isDark: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const placementsRef = useRef<ReturnType<typeof extractCountryLabelPlacements>>([]);
  const rafRef = useRef<number | null>(null);
  const lastGeoRef = useRef<unknown | null>(null);
  void paneRef;

  useEffect(() => {
    if (geoJsonData !== lastGeoRef.current) {
      lastGeoRef.current = geoJsonData;
      placementsRef.current = geoJsonData ? extractCountryLabelPlacements(geoJsonData) : [];
    }
  }, [geoJsonData]);

  useEffect(() => {
    const pane = map.getPane("historicalLabelsPane");
    if (!pane) return;
    paneRef.current = pane;

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    return () => {
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvasRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map]);

  useEffect(() => {
    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const mapSize = map.getSize();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = mapSize.x * dpr;
      canvas.height = mapSize.y * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, mapSize.x, mapSize.y);

      const placements = placementsRef.current;
      if (placements.length === 0) return;

      const zoom = map.getZoom();
      const mapCenterLng = map.getCenter().lng;

      const wrapLng = (lng: number): number => {
        let diff = (lng - mapCenterLng) % 360;
        if (diff < -180) diff += 360;
        if (diff > 180) diff -= 360;
        return mapCenterLng + diff;
      };

      placements.forEach((p) => {
        if (onlyShowCountry) {
          const target = onlyShowCountry.trim().toLowerCase();
          if (p.name.toLowerCase() !== target && p.sovereign.toLowerCase() !== target) return;
        }

        const wrappedLng = wrapLng(p.centerLng);
        const pt = map.latLngToContainerPoint([p.centerLat, wrappedLng]);
        if (pt.x < -100 || pt.x > mapSize.x + 100 || pt.y < -80 || pt.y > mapSize.y + 80) return;

        const pixelLength = Math.abs(
          map.latLngToContainerPoint([p.startLat, wrapLng(p.startLng)]).x -
          map.latLngToContainerPoint([p.endLat, wrapLng(p.endLng)]).x
        );
        const charCount = Math.max(3, p.name.length);
        const areaFactor = Math.min(2.2, Math.max(0.85, Math.log10(p.areaSqDeg + 1) * 0.95));
        const targetFontSize = (pixelLength * 0.78) / (charCount * 0.6);
        const maxFont = Math.min(90, 20 + zoom * 10);
        const minFont = Math.max(9, 6.5 + zoom * 0.9);
        const fontSize = Math.round(Math.min(maxFont, Math.max(minFont, targetFontSize * areaFactor)));

        if (fontSize < 9) return;
        if (zoom <= 3 && p.areaSqDeg < 1.2 && pixelLength < 40) return;
        if (zoom === 4 && p.areaSqDeg < 0.2 && pixelLength < 30) return;
        if (pixelLength < charCount * 4 && zoom < 6) return;

        const isSelected = p.name === selectedFeatureName;
        const displayTitle = p.name.toUpperCase();

        ctx.save();
        ctx.translate(pt.x, pt.y);
        if (p.angleDeg !== 0) ctx.rotate((p.angleDeg * Math.PI) / 180);

        ctx.font = `bold ${fontSize}px "Times New Roman", Times, "Liberation Serif", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        try {
          if ("letterSpacing" in ctx) {
            (ctx as unknown as { letterSpacing: string }).letterSpacing = fontSize > 16 ? "0.18em" : "0.12em";
          }
        } catch { /* ignore */ }

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = isDark ? "rgba(5,8,15,0.92)" : "rgba(255,255,255,0.92)";
        ctx.lineWidth = Math.max(2.5, fontSize * 0.2);
        ctx.strokeText(displayTitle, 0, 0);

        ctx.fillStyle = isSelected ? "#fbbf24" : isDark ? "#f8fafc" : "#0f172a";
        ctx.fillText(displayTitle, 0, 0);
        ctx.restore();
      });
    };

    const trigger = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(render);
    };

    trigger();
    map.on("move zoom viewreset resize zoomend moveend", trigger);
    return () => {
      map.off("move zoom viewreset resize zoomend moveend", trigger);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map, selectedFeatureName, onlyShowCountry, isDark]);

  return null;
}
