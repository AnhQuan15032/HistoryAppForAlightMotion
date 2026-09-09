import { useState, useCallback, useMemo, useEffect } from "react";
import HistoryMap from "./components/HistoryMap";
import Timeline from "./components/Timeline";
import InfoPanel from "./components/InfoPanel";
import CountriesList from "./components/CountriesList";
import CaptureModal from "./components/CaptureModal";
import CacheManagerModal from "./components/CacheManagerModal";
import EmpireLeaderboardModal from "./components/EmpireLeaderboardModal";
import MobileToolsMenu from "./components/MobileToolsMenu";
import MapLayerControl, { MapLayerType, LAYERS } from "./components/MapLayerControl";
import { useGeoJsonData } from "./hooks/useGeoJsonData";
import { YEARS } from "./data/years";
import { getFeatureName } from "./utils/countryFilter";
import { getCacheStats, CacheStats } from "./utils/geoCacheDb";
import { ProjectionId, PROJECTIONS } from "./utils/mapProjections";

const DEFAULT_INDEX = YEARS.findIndex((y) => y.year === 1492);

export default function App() {
  const [yearIndex, setYearIndex] = useState(DEFAULT_INDEX >= 0 ? DEFAULT_INDEX : 33);
  const [selectedFeature, setSelectedFeature] = useState<unknown | null>(null);
  const [selectedFeatureName, setSelectedFeatureName] = useState<string | null>(null);
  const [onlyShowCountry, setOnlyShowCountry] = useState<string | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayerType>("antique-relief");
  const [projectionId, setProjectionId] = useState<ProjectionId>("mercator");
  const [showLabels, setShowLabels] = useState<boolean>(true);

  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showProjectionPanel, setShowProjectionPanel] = useState(false);
  const [showCacheModal, setShowCacheModal] = useState(false);
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);

  const [customDataset, setCustomDataset] = useState<GeoJSON.FeatureCollection | null>(null);
  const [customDatasetTitle, setCustomDatasetTitle] = useState<string | null>(null);
  const [captureTargetCountry, setCaptureTargetCountry] = useState<string | null>(null);
  const [droppedImageFile, setDroppedImageFile] = useState<File | null>(null);
  const [isAppDraggingFile, setIsAppDraggingFile] = useState<boolean>(false);

  const [cacheStats, setCacheStats] = useState<CacheStats>({
    totalEras: YEARS.length, cachedEras: 0, percent: 0, cachedKeys: [], isComplete: false,
  });

  const { data, loading, error } = useGeoJsonData(yearIndex);
  const currentEntry = YEARS[yearIndex];
  const activeGeoJsonData = customDataset || data;
  const activeEraLabel = customDatasetTitle || currentEntry.label;

  useEffect(() => {
    getCacheStats().then(setCacheStats);
    const interval = setInterval(() => getCacheStats().then(setCacheStats), 6000);
    return () => clearInterval(interval);
  }, []);

  const availableCountries = useMemo(() => {
    if (!activeGeoJsonData) return [];
    const geoData = activeGeoJsonData as {
      features?: Array<{ properties?: Record<string, unknown> | null }>;
    };
    if (!geoData.features) return [];
    const names = new Set<string>();
    geoData.features.forEach((f) => {
      const name = getFeatureName(f?.properties);
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [activeGeoJsonData]);

  const handleFeatureSelect = useCallback((feature: unknown | null) => {
    if (feature) {
      setSelectedFeature(feature);
      const f = feature as { properties?: Record<string, unknown> };
      setSelectedFeatureName(getFeatureName(f.properties) || null);
    } else {
      setSelectedFeature(null);
      setSelectedFeatureName(null);
    }
  }, []);

  const handleCountrySelect = useCallback((name: string) => {
    if (!activeGeoJsonData) return;
    const geoData = activeGeoJsonData as {
      features?: Array<{ properties?: Record<string, unknown> }>;
    };
    const feature = geoData.features?.find((f) => getFeatureName(f.properties) === name);
    if (feature) handleFeatureSelect(feature);
  }, [activeGeoJsonData, handleFeatureSelect]);

  const handleYearChange = useCallback((index: number) => {
    setYearIndex(index);
    setCustomDataset(null);
    setCustomDatasetTitle(null);
    setSelectedFeature(null);
    setSelectedFeatureName(null);
  }, []);

  const handleOnlyShowCountry = useCallback((name: string | null) => {
    setOnlyShowCountry(name);
    if (name) { setSelectedFeature(null); setSelectedFeatureName(null); }
  }, []);

  const handleOpenCapture = useCallback((name: string, initialFile?: File) => {
    setCaptureTargetCountry(name);
    setDroppedImageFile(initialFile || null);
  }, []);

  const handleLoadCustomDataset = useCallback(
    (dataset: GeoJSON.FeatureCollection, name: string) => {
      setCustomDataset(dataset);
      setCustomDatasetTitle(name);
      setSelectedFeature(null);
      setSelectedFeatureName(null);
    }, []
  );

  const handleClearCustomDataset = useCallback(() => {
    setCustomDataset(null);
    setCustomDatasetTitle(null);
    setSelectedFeature(null);
    setSelectedFeatureName(null);
  }, []);

  const handleAppDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!captureTargetCountry && !showCacheModal && !showLeaderboardModal && e.dataTransfer.types.includes("Files")) {
      setIsAppDraggingFile(true);
    }
  };

  const handleAppDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget === e.target) setIsAppDraggingFile(false);
  };

  const handleAppDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsAppDraggingFile(false);
    if (captureTargetCountry || showCacheModal) return;
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const file = files[0];
      if (file.type.startsWith("image/")) {
        const target = selectedFeatureName || onlyShowCountry || (availableCountries[0] || null);
        if (target) handleOpenCapture(target, file);
      } else if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
        file.text().then((txt) => {
          try {
            const parsed = JSON.parse(txt) as GeoJSON.FeatureCollection;
            if (parsed.type === "FeatureCollection") {
              handleLoadCustomDataset(parsed, file.name.replace(/\.geojson|\.json/i, ""));
            }
          } catch { /* ignore */ }
        });
      }
    }
  };

  const currentLayerObj = LAYERS.find((l) => l.id === mapLayer);
  const currentProjection = PROJECTIONS.find((p) => p.id === projectionId);
  const isMercator = projectionId === "mercator";

  return (
    <div
      onDragOver={handleAppDragOver}
      onDragLeave={handleAppDragLeave}
      onDrop={handleAppDrop}
      className="relative h-screen w-screen overflow-hidden bg-gray-950 select-none font-sans"
    >
      {isAppDraggingFile && !captureTargetCountry && (
        <div className="absolute inset-0 z-[3000] m-4 sm:m-8 rounded-3xl border-4 border-dashed border-amber-400 bg-gray-950/85 backdrop-blur-xl flex flex-col items-center justify-center gap-3 p-6 text-center shadow-2xl animate-fadeIn pointer-events-none">
          <span className="text-6xl animate-bounce">📄</span>
          <h3 className="text-2xl font-black text-amber-300">Drop Image or GeoJSON!</h3>
          <p className="text-sm font-semibold text-gray-200">
            {selectedFeatureName ? `Masking into: ${selectedFeatureName}` : "Loads as custom dataset or opens capture studio"}
          </p>
        </div>
      )}

      <HistoryMap
        geoJsonData={activeGeoJsonData}
        loading={loading && !customDataset}
        onFeatureSelect={handleFeatureSelect}
        selectedFeatureName={selectedFeatureName}
        onlyShowCountry={onlyShowCountry}
        mapLayer={mapLayer}
        showLabels={showLabels}
        projectionId={projectionId}
        onCountryLabelClick={handleCountrySelect}
      />

      {error && !loading && !customDataset && (
        <div className="absolute top-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[1500] animate-slideIn">
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-red-950/95 border border-red-500/40 backdrop-blur-md px-3.5 py-2.5 text-xs font-semibold text-red-200 shadow-xl">
            <div className="flex items-center gap-2 truncate"><span>⚠️</span><span className="truncate">{error}</span></div>
            <button onClick={() => setYearIndex((p) => p)} className="px-2.5 py-1 rounded-xl bg-red-800 hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer shrink-0">Retry</button>
          </div>
        </div>
      )}

      {customDatasetTitle && (
        <div className="absolute top-3 left-3 sm:top-4 sm:left-1/2 sm:-translate-x-1/2 z-[1000] animate-slideIn">
          <div className="flex items-center gap-2 sm:gap-3 rounded-2xl bg-gray-900/95 border border-amber-400/50 backdrop-blur-2xl px-3.5 py-2 shadow-2xl ring-2 ring-amber-500/20">
            <span className="text-base shrink-0">📂</span>
            <div className="min-w-0">
              <span className="text-[9px] uppercase font-extrabold text-amber-400 tracking-wider">
                {onlyShowCountry || selectedFeatureName ? "Selected Region" : "Custom Dataset"}
              </span>
              <p className="text-xs font-black text-white truncate max-w-[130px] sm:max-w-[220px]">
                {onlyShowCountry || selectedFeatureName || customDatasetTitle}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {selectedFeatureName && !onlyShowCountry && (
                <button onClick={() => handleOnlyShowCountry(selectedFeatureName)} title={`Focus on ${selectedFeatureName}`}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold cursor-pointer transition-all active:scale-95 flex items-center gap-1">
                  <span>🎯</span><span className="hidden sm:inline">Focus</span>
                </button>
              )}
              {onlyShowCountry && (
                <button onClick={() => handleOnlyShowCountry(null)} title="Show all"
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold cursor-pointer transition-all flex items-center gap-1">
                  <span>✕</span><span className="hidden sm:inline">All</span>
                </button>
              )}
              <button onClick={() => handleOpenCapture(onlyShowCountry || selectedFeatureName || customDatasetTitle)}
                title="Capture as PNG"
                className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 text-[11px] font-black cursor-pointer transition-all active:scale-95 shadow flex items-center gap-1">
                <span>📸</span><span className="hidden sm:inline">Capture</span>
              </button>
              <button onClick={handleClearCustomDataset} title="Exit custom dataset"
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold cursor-pointer transition-colors">Exit</button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-[1000] flex flex-col gap-2 max-w-[calc(100vw-110px)] sm:max-w-md">
        {!selectedFeature && (
          <div className="rounded-2xl bg-gray-900/90 backdrop-blur-xl border border-white/10 p-2.5 sm:p-3.5 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl sm:text-2xl shrink-0">🗺️</span>
                <div className="min-w-0">
                  <h1 className="text-xs sm:text-base font-extrabold text-white tracking-tight flex items-center gap-1.5 truncate">
                    <span>History Map</span>
                    <span className="hidden sm:inline text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Atlas</span>
                  </h1>
                  <p className="text-[10px] text-gray-400 truncate hidden sm:block">
                    123,000 BC — 2010 AD · {currentProjection?.label}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setShowLeaderboardModal(true)} title="Superpowers Rankings"
                  className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-200 border border-white/10 transition-all cursor-pointer shadow-sm min-h-[34px]">
                  <span>🏆</span><span className="hidden md:inline text-[11px]">Rankings</span>
                </button>
                <button onClick={() => setShowCacheModal(true)} title="Cache & Custom Data"
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm min-h-[34px] ${cacheStats.isComplete ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-200 border border-white/10"}`}>
                  <span>{cacheStats.isComplete ? "💾" : "📥"}</span>
                  <span className="font-mono text-[11px]">{cacheStats.cachedEras}/{cacheStats.totalEras}</span>
                </button>
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-1.5">
              <label className="text-[10px] sm:text-[11px] font-bold text-amber-300 shrink-0 flex items-center gap-1">
                <span>🎯</span><span className="hidden sm:inline">Country:</span>
              </label>
              <select value={onlyShowCountry || ""} disabled={loading && !customDataset}
                onChange={(e) => handleOnlyShowCountry(e.target.value === "" ? null : e.target.value)}
                className="flex-1 rounded-xl bg-gray-800 border border-white/15 py-1.5 px-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer min-w-0 disabled:opacity-50 min-h-[36px]">
                <option value="">{loading && !customDataset ? "⏳ Loading..." : "🌐 All Countries"}</option>
                {availableCountries.map((c) => <option key={c} value={c}>📌 {c}</option>)}
              </select>
              {onlyShowCountry && (
                <button onClick={() => handleOnlyShowCountry(null)} title="Reset"
                  className="text-xs px-2.5 py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 font-bold transition-colors cursor-pointer min-h-[36px] shrink-0">✕</button>
              )}
            </div>
          </div>
        )}
      </div>

      {onlyShowCountry && !customDatasetTitle && (
        <div className="absolute top-3 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-[1000] animate-slideIn">
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-gray-900/95 border border-amber-500/40 backdrop-blur-xl px-3 py-2 shadow-2xl ring-2 ring-amber-500/20">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">🎯</span>
              <div className="min-w-0">
                <p className="text-[9px] uppercase font-bold tracking-wider text-amber-400 leading-none">Isolated View</p>
                <p className="text-xs font-extrabold text-white truncate max-w-[120px] sm:max-w-[220px]">{onlyShowCountry}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => handleOpenCapture(onlyShowCountry)}
                className="flex items-center gap-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 font-bold px-2.5 py-1.5 text-xs shadow-md transition-all cursor-pointer min-h-[34px]">
                <span>📸</span><span>Capture</span>
              </button>
              <button onClick={() => handleOnlyShowCountry(null)}
                className="flex items-center gap-1 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 font-bold px-2.5 py-1.5 text-xs transition-all cursor-pointer min-h-[34px]">
                <span>✕</span><span>All</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <InfoPanel
        feature={selectedFeature as { properties?: { NAME?: string | null; SUBJECTO?: string | null; PARTOF?: string | null; BORDERPRECISION?: number | null } | null } | null}
        yearLabel={activeEraLabel}
        onClose={() => { setSelectedFeature(null); setSelectedFeatureName(null); }}
        onOnlyShowCountry={handleOnlyShowCountry}
        onCapture={handleOpenCapture}
        onlyShowCountry={onlyShowCountry}
      />

      <CountriesList
        geoJsonData={activeGeoJsonData}
        loading={loading && !customDataset}
        yearLabel={activeEraLabel}
        selectedName={selectedFeatureName}
        onlyShowCountry={onlyShowCountry}
        onSelect={handleCountrySelect}
        onOnlyShowCountry={handleOnlyShowCountry}
        onCapture={handleOpenCapture}
      />

      <div className="sm:hidden">
        <MobileToolsMenu
          showLabels={showLabels}
          onToggleLabels={() => setShowLabels(!showLabels)}
          onOpenLayers={() => setShowLayerPanel(true)}
          onOpenProjections={() => setShowProjectionPanel(true)}
          onOpenLeaderboard={() => setShowLeaderboardModal(true)}
          onOpenCache={() => setShowCacheModal(true)}
        />
      </div>

      <div className="hidden sm:flex absolute bottom-36 left-4 z-[1000] items-center gap-2 flex-wrap">
        <div className="relative">
          <button onClick={() => setShowProjectionPanel(!showProjectionPanel)}
            className={`flex items-center gap-2 rounded-2xl backdrop-blur-xl border px-3.5 py-2.5 text-xs font-bold shadow-2xl transition-all cursor-pointer min-h-[40px] ${
              showProjectionPanel ? "bg-cyan-500/25 border-cyan-400/40 text-cyan-300 ring-2 ring-cyan-500/20" : "bg-gray-900/90 border-white/15 text-gray-200 hover:bg-gray-800"
            }`} title="Switch Map Projection">
            <span className="text-base shrink-0">{currentProjection?.icon || "🌐"}</span>
            <span className="font-bold">{currentProjection?.label || "Mercator"}</span>
          </button>

          {showProjectionPanel && (
            <div className="absolute bottom-12 left-0 mb-2 rounded-3xl bg-gray-900/95 backdrop-blur-2xl border border-white/20 p-3 shadow-2xl animate-slideIn z-[1500] max-h-[60vh] overflow-y-auto w-72">
              <div className="px-2 py-1 border-b border-white/10 mb-2 flex items-center justify-between">
                <span className="text-xs uppercase font-extrabold tracking-wider text-cyan-400">🌐 Projections ({PROJECTIONS.length})</span>
                <button onClick={() => setShowProjectionPanel(false)} className="text-gray-400 hover:text-white p-1 rounded-lg bg-white/5 cursor-pointer">✕</button>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {PROJECTIONS.map((p) => (
                  <button key={p.id} onClick={() => { setProjectionId(p.id); setShowProjectionPanel(false); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all cursor-pointer min-h-[42px] ${
                      projectionId === p.id ? "bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 shadow-sm" : "bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10"
                    }`}>
                    <span className="text-base shrink-0">{p.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{p.label}</p>
                      {p.isGlobe && <p className="text-[9px] text-cyan-400">3D / Globe view</p>}
                    </div>
                    {projectionId === p.id && <span className="text-[10px] text-cyan-400 font-bold">Active</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {isMercator && (
          <div className="relative">
            <button onClick={() => setShowLayerPanel(!showLayerPanel)}
              className={`flex items-center gap-2 rounded-2xl backdrop-blur-xl border px-3.5 py-2.5 text-xs font-bold shadow-2xl transition-all cursor-pointer min-h-[40px] ${
                showLayerPanel ? "bg-amber-500/25 border-amber-500/40 text-amber-300 ring-2 ring-amber-500/20" : "bg-gray-900/90 border-white/15 text-gray-200 hover:bg-gray-800"
              }`} title="Switch Map Styles">
              <span className="text-base shrink-0">{currentLayerObj?.icon || "🗺️"}</span>
              <span className="font-bold">{currentLayerObj?.label || "Map Style"}</span>
            </button>

            {showLayerPanel && (
              <div className="absolute bottom-12 left-0 mb-2 rounded-3xl bg-gray-900/95 backdrop-blur-2xl border border-white/20 p-3 shadow-2xl animate-slideIn z-[1500] max-h-[60vh] overflow-y-auto">
                <div className="px-2 py-1 border-b border-white/10 mb-2 flex items-center justify-between">
                  <span className="text-xs uppercase font-extrabold tracking-wider text-amber-400">🗺️ Map Styles ({LAYERS.length})</span>
                  <button onClick={() => setShowLayerPanel(false)} className="text-gray-400 hover:text-white p-1 rounded-lg bg-white/5 cursor-pointer">✕</button>
                </div>
                <MapLayerControl activeLayer={mapLayer} onChange={(layer) => { setMapLayer(layer); setShowLayerPanel(false); }} />
              </div>
            )}
          </div>
        )}

        <button onClick={() => setShowLabels(!showLabels)}
          className={`flex items-center gap-1.5 rounded-2xl backdrop-blur-xl border px-3 py-2.5 text-xs font-bold shadow-2xl transition-all cursor-pointer min-h-[40px] ${
            showLabels ? "bg-amber-500/20 border-amber-500/40 text-amber-300" : "bg-gray-900/90 border-white/15 text-gray-400 hover:text-gray-200"
          }`}>
          <span>🏷️</span><span className="font-bold">Labels: {showLabels ? "ON" : "OFF"}</span>
        </button>
      </div>

      {showProjectionPanel && (
        <div className="fixed inset-0 z-[1500] sm:hidden">
          <div onClick={() => setShowProjectionPanel(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] rounded-t-3xl bg-gray-900/98 backdrop-blur-2xl border-t border-white/20 p-4 shadow-2xl animate-slideIn overflow-y-auto">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase font-extrabold tracking-wider text-cyan-400">🌐 Map Projections ({PROJECTIONS.length})</span>
              <button onClick={() => setShowProjectionPanel(false)} className="text-gray-400 hover:text-white p-1.5 rounded-xl bg-white/5 cursor-pointer text-xs font-bold">Done</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PROJECTIONS.map((p) => (
                <button key={p.id} onClick={() => { setProjectionId(p.id); setShowProjectionPanel(false); }}
                  className={`flex flex-col items-center justify-center gap-1 p-3 rounded-2xl border transition-all cursor-pointer min-h-[64px] ${
                    projectionId === p.id ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200 shadow-sm" : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                  }`}>
                  <span className="text-xl">{p.icon}</span>
                  <span className="text-[10px] font-bold text-center leading-tight">{p.label}</span>
                  {p.isGlobe && <span className="text-[8px] text-cyan-400">3D</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showLayerPanel && isMercator && (
        <div className="fixed inset-0 z-[1500] sm:hidden">
          <div onClick={() => setShowLayerPanel(false)} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] rounded-t-3xl bg-gray-900/98 backdrop-blur-2xl border-t border-white/20 p-4 shadow-2xl animate-slideIn overflow-y-auto">
            <div className="w-10 h-1 bg-white/30 rounded-full mx-auto mb-3" />
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase font-extrabold tracking-wider text-amber-400">🗺️ Map Styles ({LAYERS.length})</span>
              <button onClick={() => setShowLayerPanel(false)} className="text-gray-400 hover:text-white p-1.5 rounded-xl bg-white/5 cursor-pointer text-xs font-bold">Done</button>
            </div>
            <MapLayerControl activeLayer={mapLayer} onChange={(layer) => { setMapLayer(layer); setShowLayerPanel(false); }} />
          </div>
        </div>
      )}

      <Timeline yearIndex={yearIndex} onChange={handleYearChange} />

      <CaptureModal
        isOpen={captureTargetCountry !== null}
        onClose={() => { setCaptureTargetCountry(null); setDroppedImageFile(null); }}
        countryName={captureTargetCountry}
        yearLabel={activeEraLabel}
        geoJsonData={activeGeoJsonData}
        selectedFeature={selectedFeature}
        initialImageFile={droppedImageFile}
        onOpenCacheManager={() => { setCaptureTargetCountry(null); setShowCacheModal(true); }}
      />

      <CacheManagerModal
        isOpen={showCacheModal}
        onClose={() => setShowCacheModal(false)}
        currentYearIndex={yearIndex}
        onSelectYear={handleYearChange}
        onLoadCustomDataset={handleLoadCustomDataset}
      />

      <EmpireLeaderboardModal
        isOpen={showLeaderboardModal}
        onClose={() => setShowLeaderboardModal(false)}
        yearLabel={activeEraLabel}
        geoJsonData={activeGeoJsonData}
        onSelectEmpire={handleCountrySelect}
        selectedEmpireName={selectedFeatureName}
      />
    </div>
  );
}
