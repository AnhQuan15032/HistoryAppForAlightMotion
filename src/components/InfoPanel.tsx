import { getColorForName } from "../utils/colors";
import { isUnknownLand } from "../utils/countryFilter";

interface InfoPanelProps {
  feature: {
    properties?: {
      NAME?: string | null;
      SUBJECTO?: string | null;
      PARTOF?: string | null;
      BORDERPRECISION?: number | null;
    } | null;
  } | null;
  yearLabel: string;
  onClose: () => void;
  onOnlyShowCountry: (name: string | null) => void;
  onCapture: (name: string) => void;
  onlyShowCountry: string | null;
}

export default function InfoPanel({
  feature,
  yearLabel,
  onClose,
  onOnlyShowCountry,
  onCapture,
  onlyShowCountry,
}: InfoPanelProps) {
  if (!feature || !feature.properties) return null;

  const { NAME, SUBJECTO, PARTOF } = feature.properties;
  const displayName = NAME?.trim() || "";

  if (isUnknownLand(displayName) && isUnknownLand(SUBJECTO)) {
    return null;
  }

  const sovereignPower = SUBJECTO?.trim() || displayName;
  const color = getColorForName(sovereignPower);
  const isOnlyShown = onlyShowCountry === displayName;

  return (
    <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-[1000] w-[calc(100vw-24px)] sm:w-96 max-w-sm animate-slideIn">
      <div className="rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: color }} />

        <div className="p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md">
                {yearLabel}
              </span>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight truncate mt-1 font-serif">
                {displayName || "Unnamed Region"}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 active:bg-white/20 transition-colors cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
              title="Close Panel"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-2.5 space-y-2">
            {SUBJECTO && SUBJECTO !== displayName && (
              <div className="flex items-start gap-2 bg-white/[0.03] p-2 rounded-xl border border-white/5 text-xs">
                <span className="text-sm shrink-0">👑</span>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Sovereign Power / Empire</p>
                  <p className="font-semibold text-gray-100 truncate">{SUBJECTO}</p>
                </div>
              </div>
            )}

            {PARTOF && PARTOF !== displayName && (
              <div className="flex items-start gap-2 bg-white/[0.03] p-2 rounded-xl border border-white/5 text-xs">
                <span className="text-sm shrink-0">🏛️</span>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400 font-bold">Cultural Area / Federation</p>
                  <p className="font-semibold text-gray-100 truncate">{PARTOF}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-gray-400 px-0.5">
              <span className="w-3 h-[2px] bg-amber-400 inline-block rounded-full" />
              <span>Solid straight border</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-3.5 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-3 h-3 rounded-sm border border-white/20 shrink-0" style={{ backgroundColor: color }} />
              <span className="text-[11px] text-gray-400 truncate">
                {SUBJECTO && SUBJECTO !== displayName ? `Under ${SUBJECTO}` : "Independent"}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              {displayName && (
                <button
                  onClick={() => onCapture(displayName)}
                  title="Capture this country as PNG"
                  className="flex items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-xs font-bold bg-white/10 hover:bg-amber-500/20 text-gray-200 hover:text-amber-300 border border-white/15 transition-all shadow-sm cursor-pointer active:scale-95 min-h-[38px]"
                >
                  <span>📸</span>
                  <span>Capture</span>
                </button>
              )}

              {displayName && (
                <button
                  onClick={() => onOnlyShowCountry(isOnlyShown ? null : displayName)}
                  className={`flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold transition-all shadow-md cursor-pointer min-h-[38px] active:scale-95 ${
                    isOnlyShown
                      ? "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                      : "bg-gradient-to-r from-amber-500 to-amber-600 text-gray-950 hover:brightness-110"
                  }`}
                >
                  {isOnlyShown ? (
                    <><span>✕</span><span>Show All</span></>
                  ) : (
                    <><span>🎯</span><span>Isolate</span></>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
