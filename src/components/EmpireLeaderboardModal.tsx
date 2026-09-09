import { useMemo } from "react";
import { getColorForName } from "../utils/colors";
import { getFeatureName, getFeatureSovereign } from "../utils/countryFilter";

interface EmpireLeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  yearLabel: string;
  geoJsonData: unknown | null;
  onSelectEmpire: (name: string) => void;
  selectedEmpireName: string | null;
}

export interface RankedEmpire {
  rank: number;
  name: string;
  sovereign: string;
  polygonCount: number;
  areaSqDeg: number;
  estAreaMillionKm2: number;
  percentOfTotal: number;
}

function getRingArea(ring: GeoJSON.Position[]): number {
  if (!ring || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}

export default function EmpireLeaderboardModal({
  isOpen,
  onClose,
  yearLabel,
  geoJsonData,
  onSelectEmpire,
  selectedEmpireName,
}: EmpireLeaderboardModalProps) {
  const rankedEmpires = useMemo(() => {
    if (!geoJsonData) return [];
    const data = geoJsonData as {
      features?: Array<{
        properties?: Record<string, unknown> | null;
        geometry?: GeoJSON.Geometry | null;
      }>;
    };
    if (!data.features) return [];

    const empireMap = new Map<
      string,
      {
        sovereign: string;
        totalArea: number;
        polygonCount: number;
      }
    >();

    data.features.forEach((f) => {
      if (!f || !f.geometry || !f.properties) return;
      const primaryName = getFeatureName(f.properties);
      if (!primaryName) return;

      const sovereign = getFeatureSovereign(f.properties) || primaryName;
      // Group by sovereign realm/empire
      const groupKey = sovereign;

      let featureArea = 0;
      let count = 0;

      if (f.geometry.type === "Polygon") {
        const polyCoords = (f.geometry as GeoJSON.Polygon).coordinates;
        if (polyCoords && polyCoords.length > 0) {
          featureArea += getRingArea(polyCoords[0]);
          count++;
        }
      } else if (f.geometry.type === "MultiPolygon") {
        const multiCoords = (f.geometry as GeoJSON.MultiPolygon).coordinates;
        if (multiCoords) {
          multiCoords.forEach((poly) => {
            if (poly && poly.length > 0) {
              featureArea += getRingArea(poly[0]);
              count++;
            }
          });
        }
      }

      if (!empireMap.has(groupKey)) {
        empireMap.set(groupKey, {
          sovereign,
          totalArea: 0,
          polygonCount: 0,
        });
      }

      const entry = empireMap.get(groupKey)!;
      entry.totalArea += featureArea;
      entry.polygonCount += count;
    });

    const entries = Array.from(empireMap.entries()).map(([name, val]) => ({
      name,
      sovereign: val.sovereign,
      polygonCount: val.polygonCount,
      areaSqDeg: val.totalArea,
      // 1 sq degree at equator is approx 12,300 km^2. Average global approximation:
      estAreaMillionKm2: Math.round((val.totalArea * 0.0105) * 100) / 100,
    }));

    // Sort by area descending
    entries.sort((a, b) => b.areaSqDeg - a.areaSqDeg);

    const totalWorldArea = entries.reduce((sum, e) => sum + e.areaSqDeg, 0) || 1;

    return entries.slice(0, 20).map((e, idx) => ({
      rank: idx + 1,
      name: e.name,
      sovereign: e.sovereign,
      polygonCount: e.polygonCount,
      areaSqDeg: e.areaSqDeg,
      estAreaMillionKm2: e.estAreaMillionKm2,
      percentOfTotal: Math.round((e.areaSqDeg / totalWorldArea) * 1000) / 10,
    }));
  }, [geoJsonData]);

  if (!isOpen) return null;

  const topEmpire = rankedEmpires[0];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-fadeIn font-sans">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-3xl bg-gray-900 border border-white/15 shadow-2xl overflow-hidden text-gray-100 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-lg">
              🏆
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Superpowers of the Era (Leaderboard)</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono">
                  {yearLabel}
                </span>
              </h2>
              <p className="text-xs text-gray-400">
                Largest empires and realms ranked by estimated geographic land area
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">
          {/* Top Superpower Spotlight */}
          {topEmpire && (
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-transparent border border-amber-500/30 p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-400">
                  <span>👑</span>
                  <span>#1 Hegemon of {yearLabel}</span>
                </span>
                <h3 className="text-xl sm:text-2xl font-extrabold text-white font-serif">
                  {topEmpire.name}
                </h3>
                <p className="text-xs text-gray-300">
                  Controls approximately <strong className="text-amber-300">{topEmpire.estAreaMillionKm2} million km²</strong> ({topEmpire.percentOfTotal}% of mapped territory)
                </p>
              </div>

              <button
                onClick={() => {
                  onSelectEmpire(topEmpire.name);
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer shrink-0"
              >
                Inspect Realm →
              </button>
            </div>
          )}

          {/* Ranked Table */}
          <div className="rounded-2xl bg-gray-950 border border-white/10 overflow-hidden">
            <div className="p-3 bg-white/[0.02] border-b border-white/10 flex items-center justify-between text-xs font-bold text-gray-400">
              <span>Empire / Realm</span>
              <div className="flex items-center gap-6">
                <span className="hidden sm:inline">Territory Share</span>
                <span>Land Area</span>
                <span>Action</span>
              </div>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {rankedEmpires.map((emp) => {
                const color = getColorForName(emp.name);
                const isSelected = emp.name === selectedEmpireName;

                return (
                  <div
                    key={emp.name}
                    className={`p-3 sm:px-4 flex items-center justify-between gap-3 transition-colors ${
                      isSelected ? "bg-amber-500/15" : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                          emp.rank === 1
                            ? "bg-amber-500 text-gray-950 font-extrabold"
                            : emp.rank === 2
                              ? "bg-slate-300 text-gray-950 font-bold"
                              : emp.rank === 3
                                ? "bg-amber-800 text-white font-bold"
                                : "bg-white/10 text-gray-400"
                        }`}
                      >
                        {emp.rank}
                      </span>

                      <div
                        className="w-3 h-3 rounded-sm shrink-0 border border-white/20"
                        style={{ backgroundColor: color }}
                      />

                      <span className="text-xs sm:text-sm font-bold text-white truncate font-serif">
                        {emp.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                      {/* Percent Bar */}
                      <div className="hidden sm:flex items-center gap-2 w-28">
                        <div className="h-2 flex-1 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full"
                            style={{ width: `${Math.min(100, emp.percentOfTotal * 2)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-gray-400 w-9 text-right">
                          {emp.percentOfTotal}%
                        </span>
                      </div>

                      {/* Estimated Area */}
                      <span className="font-mono text-xs font-bold text-amber-300 w-16 text-right">
                        {emp.estAreaMillionKm2 > 0 ? `${emp.estAreaMillionKm2}M` : "<0.1M"} <span className="text-[10px] text-gray-400 font-normal">km²</span>
                      </span>

                      {/* Zoom to Button */}
                      <button
                        onClick={() => {
                          onSelectEmpire(emp.name);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-amber-500/20 hover:border-amber-500/30 text-gray-200 hover:text-amber-300 text-xs font-bold border border-white/15 transition-all cursor-pointer"
                      >
                        View →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02] text-xs text-gray-400">
          <span>Rankings calculated from geometric polygon surface area</span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
