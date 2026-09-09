import { useState, useRef, useEffect, useCallback } from "react";
import { YEARS, ERA_DESCRIPTIONS } from "../data/years";

interface TimelineProps {
  yearIndex: number;
  onChange: (index: number) => void;
}

export default function Timeline({ yearIndex, onChange }: TimelineProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showEraInfo, setShowEraInfo] = useState(false);
  const currentEntry = YEARS[yearIndex];

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      if (yearIndex >= YEARS.length - 1) {
        onChange(0);
      }
      play();
    }
  }, [isPlaying, yearIndex, onChange, play, pause]);

  // Use a ref for the current yearIndex so playback advances accurately
  const yearIndexRef = useRef(yearIndex);
  yearIndexRef.current = yearIndex;

  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      const current = yearIndexRef.current;
      if (current >= YEARS.length - 1) {
        setIsPlaying(false);
      } else {
        onChange(current + 1);
      }
    }, 2200);

    return () => clearInterval(timer);
  }, [isPlaying, onChange]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    onChange(idx);
  };

  const stepBack = () => {
    if (yearIndex > 0) onChange(yearIndex - 1);
  };

  const stepForward = () => {
    if (yearIndex < YEARS.length - 1) onChange(yearIndex + 1);
  };

  const eraDescription =
    ERA_DESCRIPTIONS[currentEntry.year] || "Explore the world as it was in this era.";

  const getEraCategory = (year: number) => {
    if (year < -10000) return "prehistory";
    if (year < -3000) return "neolithic";
    if (year < -500) return "bronze-iron";
    if (year < 500) return "classical";
    if (year < 1500) return "medieval";
    if (year < 1800) return "early-modern";
    return "modern";
  };

  const eraCategory = getEraCategory(currentEntry.year);
  const eraCategoryLabels: Record<string, string> = {
    prehistory: "🦴 Prehistory",
    neolithic: "🌾 Neolithic Era",
    "bronze-iron": "⚔️ Bronze & Iron Ages",
    classical: "🏛️ Classical Antiquity",
    medieval: "🏰 Medieval Period",
    "early-modern": "🚢 Early Modern Period",
    modern: "🏭 Modern Era",
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] select-none">
      {/* Era Info Mobile Card */}
      {showEraInfo && (
        <div className="mx-3 mb-2 rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-white/15 p-3.5 sm:p-4 shadow-2xl max-w-2xl sm:mx-auto animate-slideIn">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                {eraCategoryLabels[eraCategory]}
              </span>
              <p className="text-xs sm:text-sm text-gray-200 leading-relaxed">{eraDescription}</p>
            </div>
            <button
              onClick={() => setShowEraInfo(false)}
              className="shrink-0 text-gray-400 hover:text-white p-1.5 rounded-lg bg-white/5 active:bg-white/15 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Timeline Navigation Bar */}
      <div className="bg-gradient-to-t from-gray-950 via-gray-900/98 to-gray-900/90 backdrop-blur-xl border-t border-white/10 shadow-2xl pb-safe">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3">
          {/* Top Controls Row */}
          <div className="flex items-center justify-between mb-2 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-xl sm:text-3xl font-extrabold text-white tracking-tight font-mono shrink-0">
                {currentEntry.label}
              </h2>
              <button
                onClick={() => setShowEraInfo(!showEraInfo)}
                className="flex items-center gap-1 rounded-full bg-white/10 active:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300 transition-colors cursor-pointer"
              >
                <span className="text-xs">ℹ️</span>
                <span className="hidden sm:inline">About Era</span>
              </button>
            </div>

            {/* Play & Step Buttons with touch targets */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={stepBack}
                disabled={yearIndex === 0}
                className="p-2 sm:p-2.5 rounded-xl text-gray-300 hover:text-white bg-white/5 active:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
                title="Previous era"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <button
                onClick={togglePlay}
                className="group flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-2xl bg-amber-500 text-gray-950 hover:bg-amber-400 shadow-lg shadow-amber-500/25 transition-all active:scale-95 cursor-pointer font-bold shrink-0"
                title={isPlaying ? "Pause" : "Play through history"}
              >
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={stepForward}
                disabled={yearIndex >= YEARS.length - 1}
                className="p-2 sm:p-2.5 rounded-xl text-gray-300 hover:text-white bg-white/5 active:bg-white/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
                title="Next era"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Slider with generous touch area */}
          <div className="relative py-1">
            <input
              type="range"
              min={0}
              max={YEARS.length - 1}
              value={yearIndex}
              onChange={handleSliderChange}
              className="timeline-slider w-full cursor-pointer h-2.5 rounded-lg"
            />

            {/* Quick Era Markers */}
            <div className="flex justify-between mt-1 px-1 overflow-x-auto custom-scrollbar gap-1 text-[10px] font-mono text-gray-400">
              {[
                { idx: 0, label: "123k BC" },
                { idx: Math.floor(YEARS.length * 0.15), label: YEARS[Math.floor(YEARS.length * 0.15)]?.label },
                { idx: Math.floor(YEARS.length * 0.35), label: YEARS[Math.floor(YEARS.length * 0.35)]?.label },
                { idx: Math.floor(YEARS.length * 0.55), label: YEARS[Math.floor(YEARS.length * 0.55)]?.label },
                { idx: Math.floor(YEARS.length * 0.75), label: YEARS[Math.floor(YEARS.length * 0.75)]?.label },
                { idx: YEARS.length - 1, label: "2010 AD" },
              ].map((marker, i) => (
                <button
                  key={i}
                  onClick={() => onChange(marker.idx)}
                  className="hover:text-amber-400 active:text-amber-300 transition-colors cursor-pointer py-0.5 whitespace-nowrap"
                >
                  {marker.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
