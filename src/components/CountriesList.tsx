import { useMemo, useState } from "react";
import { getColorForName } from "../utils/colors";
import { getFeatureName, getFeatureSovereign } from "../utils/countryFilter";

interface CountriesListProps {
  geoJsonData: unknown | null;
  loading: boolean;
  yearLabel: string;
  selectedName: string | null;
  onlyShowCountry: string | null;
  onSelect: (name: string) => void;
  onOnlyShowCountry: (name: string | null) => void;
  onCapture: (name: string) => void;
}

export default function CountriesList({
  geoJsonData,
  loading,
  yearLabel,
  selectedName,
  onlyShowCountry,
  onSelect,
  onOnlyShowCountry,
  onCapture,
}: CountriesListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const countries = useMemo(() => {
    if (!geoJsonData) return [];
    const data = geoJsonData as {
      features?: Array<{ properties?: Record<string, unknown> | null }>;
    };
    if (!data.features) return [];

    const names = new Map<string, string>();
    data.features.forEach((f) => {
      const primaryName = getFeatureName(f?.properties);
      const sovereign = getFeatureSovereign(f?.properties) || primaryName;
      if (primaryName) names.set(primaryName, sovereign || primaryName);
    });

    return Array.from(names.entries())
      .map(([name, subjecto]) => ({ name, subjecto }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geoJsonData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return countries;
    const q = search.toLowerCase();
    return countries.filter(
      (c) => c.name.toLowerCase().includes(q) || c.subjecto.toLowerCase().includes(q)
    );
  }, [countries, search]);

  return (
    <div className="absolute top-3 right-3 sm:top-4 sm:right-14 z-[1000]">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 rounded-2xl backdrop-blur-xl border px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-all shadow-xl cursor-pointer min-h-[44px] ${
          onlyShowCountry
            ? "bg-amber-500/25 border-amber-500/40 text-amber-200 ring-2 ring-amber-500/20"
            : "bg-gray-900/90 border-white/10 text-gray-200 hover:bg-gray-800/90 hover:text-white"
        }`}
      >
        <span className="text-base">{loading ? "⏳" : onlyShowCountry ? "🎯" : "🌍"}</span>
        <span className="font-bold truncate max-w-[130px] sm:max-w-[200px]">
          {loading ? "Loading..." : onlyShowCountry ? `Only: ${onlyShowCountry}` : `${countries.length} Regions`}
        </span>
        <svg className={`w-3.5 h-3.5 transition-transform duration-200 shrink-0 ${isOpen ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="fixed inset-x-3 bottom-20 top-auto sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:mt-2 w-auto sm:w-96 rounded-3xl bg-gray-900/95 backdrop-blur-2xl border border-white/20 shadow-2xl overflow-hidden animate-slideIn z-[1500] max-h-[70vh] flex flex-col">
          <div className="p-3.5 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div>
                <p className="text-xs font-bold text-amber-300">🗺️ Known Regions in {yearLabel}</p>
                <p className="text-[10px] text-gray-400">
                  {loading ? "Fetching map entities..." : `${countries.length} historical entities recorded`}
                </p>
              </div>
              {onlyShowCountry && (
                <button onClick={() => onOnlyShowCountry(null)}
                  className="flex items-center gap-1 rounded-lg bg-red-500/20 border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/30 transition-colors cursor-pointer">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Show All
                </button>
              )}
            </div>

            <div className="mb-2">
              <select
                value={onlyShowCountry || ""}
                disabled={loading}
                onChange={(e) => onOnlyShowCountry(e.target.value === "" ? null : e.target.value)}
                className="w-full rounded-xl bg-gray-800/90 border border-white/15 py-2 px-3 text-xs text-amber-200 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer disabled:opacity-50 min-h-[40px]"
              >
                <option value="">🌐 Show All Countries & Regions</option>
                {countries.map((c) => (
                  <option key={c.name} value={c.name}>📌 Only show {c.name}</option>
                ))}
              </select>
            </div>

            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search country or empire..."
                className="w-full rounded-xl bg-white/5 border border-white/15 py-2 pl-9 pr-3 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500/60 min-h-[40px]" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.04] p-1">
            {loading ? (
              <div className="p-8 text-center text-xs text-amber-300 flex items-center justify-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                <span>Loading historical entities...</span>
              </div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-xs text-gray-400 text-center">
                {search ? "No matching regions found" : "No regions recorded for this period"}
              </p>
            ) : (
              filtered.map((country) => {
                const isOnlyShown = onlyShowCountry === country.name;
                const isSelected = selectedName === country.name;

                return (
                  <div key={country.name}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors min-h-[48px] ${
                      isOnlyShown ? "bg-amber-500/15" : isSelected ? "bg-white/10" : "hover:bg-white/5 active:bg-white/10"
                    }`}
                  >
                    <button
                      onClick={() => { onSelect(country.name); setIsOpen(false); }}
                      className="flex-1 flex items-center gap-2.5 text-left min-w-0 py-0.5 group cursor-pointer"
                    >
                      <div className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/20 shadow-sm"
                        style={{ backgroundColor: getColorForName(country.subjecto) }} />
                      <div className="min-w-0">
                        <p className={`text-xs font-bold truncate ${isOnlyShown ? "text-amber-200" : "text-gray-200 group-hover:text-white"}`}>
                          {country.name}
                        </p>
                        {country.subjecto !== country.name && (
                          <p className="text-[10px] text-gray-400 truncate">under {country.subjecto}</p>
                        )}
                      </div>
                    </button>

                    <button
                      onClick={() => { onCapture(country.name); setIsOpen(false); }}
                      title={`Capture ${country.name} land as PNG`}
                      className="shrink-0 p-2 rounded-xl text-gray-300 hover:text-amber-300 bg-white/5 active:bg-white/15 transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <span className="text-xs">📸</span>
                    </button>

                    <button
                      onClick={() => onOnlyShowCountry(isOnlyShown ? null : country.name)}
                      title={isOnlyShown ? "Show all countries again" : `Show only ${country.name}`}
                      className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer min-h-[36px] ${
                        isOnlyShown
                          ? "bg-amber-500 text-gray-950 shadow-sm"
                          : "bg-white/5 text-gray-300 hover:bg-amber-500/20 hover:text-amber-300 border border-white/10 active:bg-white/15"
                      }`}
                    >
                      {isOnlyShown ? <><span>✓</span><span>Isolated</span></> : <><span>🎯</span><span>Isolate</span></>}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-2.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[10px] text-gray-400">
            <span>📸 Camera icon captures region as PNG</span>
            <button onClick={() => setIsOpen(false)} className="text-amber-400 hover:underline font-bold cursor-pointer">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
