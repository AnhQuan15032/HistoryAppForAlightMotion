import { useState, useEffect, useCallback } from "react";
import {
  SYMBOLS,
  SymbolOptions,
  SymbolType,
  SymbolPlacement,
  SymbolApplyMode,
  DEFAULT_SYMBOL_OPTIONS,
  extractColorPalette,
  findColorRegionCenters,
  samplePixelColor,
} from "../utils/symbolOverlays";

interface SymbolPickerProps {
  symbols: SymbolOptions[];
  onChange: (symbols: SymbolOptions[]) => void;
  isVisible: boolean;
  onToggle: () => void;
  /** Canvas ref for eyedropper and color sampling */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Whether an image/flag is loaded */
  hasImage: boolean;
}

const PLACEMENTS: { id: SymbolPlacement; label: string; icon: string }[] = [
  { id: "center", label: "Center", icon: "◉" },
  { id: "top-left", label: "Top Left", icon: "↖" },
  { id: "top-right", label: "Top Right", icon: "↗" },
  { id: "bottom-left", label: "Bottom Left", icon: "↙" },
  { id: "bottom-right", label: "Bottom Right", icon: "↘" },
];

const APPLY_MODES: { id: SymbolApplyMode; label: string; icon: string; desc: string }[] = [
  { id: "shape", label: "On Shape", icon: "🟫", desc: "Place symbol at a fixed position on the country shape" },
  { id: "color-region", label: "By Color", icon: "🎯", desc: "Place symbols only on regions matching a target color in the flag" },
  { id: "fill", label: "Full Fill", icon: "🪣", desc: "Use symbol as a repeating fill pattern across the entire shape" },
];

export default function SymbolPicker({
  symbols,
  onChange,
  isVisible,
  onToggle,
  canvasRef,
  hasImage,
}: SymbolPickerProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isEyedropperActive, setIsEyedropperActive] = useState(false);
  const [palette, setPalette] = useState<Array<{ hex: string; percentage: number }>>([]);
  const [detectedRegions, setDetectedRegions] = useState(0);

  const activeSymbol = symbols[selectedIdx] ?? DEFAULT_SYMBOL_OPTIONS;
  const hasSymbols = symbols.some((s) => s.type !== "none");

  const updateSymbol = (idx: number, updates: Partial<SymbolOptions>) => {
    const next = [...symbols];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  const addSymbol = () => {
    onChange([...symbols, { ...DEFAULT_SYMBOL_OPTIONS, type: "cross" }]);
    setSelectedIdx(symbols.length);
  };

  const removeSymbol = (idx: number) => {
    onChange(symbols.filter((_, i) => i !== idx));
    setSelectedIdx(Math.max(0, selectedIdx - 1));
  };

  // Extract palette from canvas when image loads
  const refreshPalette = useCallback(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const p = extractColorPalette(ctx, canvasRef.current.width, canvasRef.current.height, 8);
    setPalette(p);
  }, [canvasRef]);

  useEffect(() => {
    if (isVisible && hasImage) {
      refreshPalette();
    }
  }, [isVisible, hasImage, refreshPalette]);

  // Detect color regions when target color or tolerance changes
  useEffect(() => {
    if (!canvasRef.current || activeSymbol.applyMode !== "color-region" || activeSymbol.type === "none") {
      setDetectedRegions(0);
      return;
    }
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const regions = findColorRegionCenters(
      ctx,
      activeSymbol.targetColor,
      activeSymbol.colorTolerance,
      canvasRef.current.width,
      canvasRef.current.height,
      10
    );
    setDetectedRegions(regions.length);
  }, [activeSymbol.targetColor, activeSymbol.colorTolerance, activeSymbol.applyMode, activeSymbol.type, canvasRef]);

  // Eyedropper: click on canvas to pick color
  useEffect(() => {
    if (!isEyedropperActive || !canvasRef.current) return;
    const canvas = canvasRef.current;

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const hex = samplePixelColor(ctx, x, y);
      updateSymbol(selectedIdx, { targetColor: hex });
      setIsEyedropperActive(false);
    };

    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [isEyedropperActive, canvasRef, selectedIdx, symbols]);

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        title="Add symbols (crosses, stars, stripes, or apply by color)"
        className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/5 hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/30 text-left transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">✚</span>
          <div>
            <p className="text-xs font-bold text-gray-200 group-hover:text-amber-300 transition-colors">
              Symbols & Charges
            </p>
            <p className="text-[10px] text-gray-500">
              Place by shape, match by color, or fill with pattern
            </p>
          </div>
        </div>
        {hasSymbols && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {symbols.filter((s) => s.type !== "none").length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-gray-950/80 border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.02]">
        <span className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider">
          ✚ Symbols & Charges
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={addSymbol}
            title="Add another symbol layer"
            className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/25 text-[10px] font-bold cursor-pointer transition-all"
          >
            + Layer
          </button>
          <button
            onClick={onToggle}
            title="Collapse"
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Layer Tabs */}
      {symbols.length > 1 && (
        <div className="flex gap-1 px-2 pt-2 overflow-x-auto custom-scrollbar">
          {symbols.map((_, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setSelectedIdx(idx)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all ${
                  selectedIdx === idx
                    ? "bg-amber-500 text-gray-950"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
              >
                #{idx + 1}
              </button>
              <button
                onClick={() => removeSymbol(idx)}
                title="Remove layer"
                className="w-5 h-5 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 text-[10px] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 space-y-3 max-h-[45vh] overflow-y-auto custom-scrollbar">
        {/* Symbol Type Grid */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
            Symbol Type
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {SYMBOLS.filter((s) => s.id !== "none").map((sym) => (
              <button
                key={sym.id}
                onClick={() => updateSymbol(selectedIdx, { type: sym.id as SymbolType })}
                title={sym.label}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl border transition-all cursor-pointer min-h-[44px] ${
                  activeSymbol.type === sym.id
                    ? "bg-amber-500/20 border-amber-400/40 text-amber-200 shadow-sm"
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                }`}
              >
                <span className="text-base">{sym.icon}</span>
                <span className="text-[8px] font-bold text-center leading-none truncate w-full">{sym.label}</span>
              </button>
            ))}
          </div>
        </div>

        {activeSymbol.type !== "none" && (
          <>
            {/* Application Mode */}
            <div className="pt-2 border-t border-white/5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                Apply How?
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {APPLY_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => updateSymbol(selectedIdx, { applyMode: mode.id })}
                    title={mode.desc}
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl border transition-all cursor-pointer ${
                      activeSymbol.applyMode === mode.id
                        ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200 shadow-sm"
                        : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                    }`}
                  >
                    <span className="text-sm">{mode.icon}</span>
                    <span className="text-[9px] font-bold text-center leading-tight">{mode.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gray-500 mt-1 leading-tight">
                {APPLY_MODES.find((m) => m.id === activeSymbol.applyMode)?.desc}
              </p>
            </div>

            {/* Color-Region Controls */}
            {activeSymbol.applyMode === "color-region" && hasImage && (
              <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-2.5">
                <p className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
                  🎯 Color Match Settings
                </p>

                {/* Target Color */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-gray-400">Target Color</span>
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-6 h-6 rounded-lg border border-white/20"
                      style={{ backgroundColor: activeSymbol.targetColor }}
                    />
                    <input
                      type="color"
                      value={activeSymbol.targetColor}
                      onChange={(e) => updateSymbol(selectedIdx, { targetColor: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border border-white/20 bg-transparent"
                      title="Pick target color"
                    />
                    <span className="text-[10px] font-mono text-cyan-300">{activeSymbol.targetColor}</span>
                  </div>
                </div>

                {/* Eyedropper */}
                <button
                  onClick={() => setIsEyedropperActive(!isEyedropperActive)}
                  className={`w-full py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    isEyedropperActive
                      ? "bg-cyan-500 text-gray-950 border-cyan-400 animate-pulse"
                      : "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25"
                  }`}
                  title="Click to pick a color from the flag preview"
                >
                  💧 {isEyedropperActive ? "Click on the flag to pick color…" : "Pick Color from Flag"}
                </button>

                {/* Detected palette from image */}
                {palette.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-gray-400 mb-1">Detected Flag Colors:</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {palette.map((p) => (
                        <button
                          key={p.hex}
                          onClick={() => updateSymbol(selectedIdx, { targetColor: p.hex })}
                          title={`${p.hex} (${p.percentage}% of image)`}
                          className={`w-6 h-6 rounded-lg border-2 cursor-pointer transition-all ${
                            activeSymbol.targetColor.toLowerCase() === p.hex.toLowerCase()
                              ? "border-cyan-400 ring-2 ring-cyan-400/30 scale-110"
                              : "border-white/20 hover:scale-105"
                          }`}
                          style={{ backgroundColor: p.hex }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Tolerance */}
                <div>
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                    <span>Color Tolerance</span>
                    <span className="font-mono text-cyan-300 font-bold">{activeSymbol.colorTolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={activeSymbol.colorTolerance}
                    onChange={(e) => updateSymbol(selectedIdx, { colorTolerance: parseInt(e.target.value) })}
                    className="w-full h-1.5 rounded-full cursor-pointer bg-gray-700 accent-cyan-500"
                  />
                  <p className="text-[9px] text-gray-500 mt-0.5">
                    Higher = matches more shades of the target color
                  </p>
                </div>

                {/* Region count */}
                {detectedRegions > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-cyan-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>{detectedRegions} region{detectedRegions !== 1 ? "s" : ""} detected — symbols will be placed on each</span>
                  </div>
                )}
              </div>
            )}

            {/* Shape Mode Controls (position etc) */}
            {activeSymbol.applyMode === "shape" && (
              <div className="space-y-2.5 pt-2 border-t border-white/5">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                    Position on Shape
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {PLACEMENTS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => updateSymbol(selectedIdx, { placement: p.id })}
                        title={p.label}
                        className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                          activeSymbol.placement === p.id
                            ? "bg-amber-500 text-gray-950 shadow-sm"
                            : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10"
                        }`}
                      >
                        {p.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Fill Mode Controls */}
            {activeSymbol.applyMode === "fill" && (
              <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
                <p className="text-[10px] text-amber-300/80 leading-relaxed">
                  The symbol will be tiled as a repeating pattern to fill the entire country shape. Adjust size and spacing below.
                </p>
              </div>
            )}

            {/* Common Controls */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">
                  Size: {activeSymbol.size}%
                </label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={activeSymbol.size}
                  onChange={(e) => updateSymbol(selectedIdx, { size: parseInt(e.target.value) })}
                  className="w-full h-1.5 rounded-full cursor-pointer bg-gray-700 accent-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">
                  Thickness: {activeSymbol.thickness}
                </label>
                <input
                  type="range"
                  min={2}
                  max={50}
                  step={1}
                  value={activeSymbol.thickness}
                  onChange={(e) => updateSymbol(selectedIdx, { thickness: parseInt(e.target.value) })}
                  className="w-full h-1.5 rounded-full cursor-pointer bg-gray-700 accent-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">
                  Rotation: {activeSymbol.rotation}°
                </label>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={activeSymbol.rotation}
                  onChange={(e) => updateSymbol(selectedIdx, { rotation: parseInt(e.target.value) })}
                  className="w-full h-1.5 rounded-full cursor-pointer bg-gray-700 accent-amber-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">
                  Opacity: {Math.round(activeSymbol.opacity * 100)}%
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={activeSymbol.opacity}
                  onChange={(e) => updateSymbol(selectedIdx, { opacity: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-full cursor-pointer bg-gray-700 accent-amber-500"
                />
              </div>
            </div>

            {/* Symbol Color */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-gray-400">Symbol Color</span>
              <div className="flex items-center gap-1.5">
                <div
                  className="w-6 h-6 rounded-lg border border-white/20"
                  style={{ backgroundColor: activeSymbol.color }}
                />
                <input
                  type="color"
                  value={activeSymbol.color}
                  onChange={(e) => updateSymbol(selectedIdx, { color: e.target.value })}
                  className="w-6 h-6 rounded cursor-pointer border border-white/20 bg-transparent"
                />
                <span className="text-[10px] font-mono text-gray-400">{activeSymbol.color}</span>
              </div>
            </div>

            {/* Count (for stripes/checky) */}
            {(activeSymbol.type.includes("stripe") || activeSymbol.type === "checky") && (
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">
                  Count: {activeSymbol.count}
                </label>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={activeSymbol.count}
                  onChange={(e) => updateSymbol(selectedIdx, { count: parseInt(e.target.value) })}
                  className="w-full h-1.5 rounded-full cursor-pointer bg-gray-700 accent-amber-500"
                />
              </div>
            )}

            {/* Reset */}
            <button
              onClick={() => updateSymbol(selectedIdx, { ...DEFAULT_SYMBOL_OPTIONS })}
              className="w-full py-1.5 rounded-lg bg-white/5 hover:bg-red-500/15 text-gray-400 hover:text-red-300 border border-white/10 hover:border-red-500/25 text-[10px] font-bold cursor-pointer transition-all"
            >
              ↺ Reset This Layer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
