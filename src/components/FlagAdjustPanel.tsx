import { useState, useCallback } from "react";
import type { ImageFitMode } from "../utils/geoCapture";

interface FlagAdjustPanelProps {
  // Current values
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  opacity: number;
  fitMode: string;
  // Setters
  onScaleChange: (v: number) => void;
  onOffsetXChange: (v: number) => void;
  onOffsetYChange: (v: number) => void;
  onRotationChange: (v: number) => void;
  onOpacityChange: (v: number) => void;
  onFitModeChange: (mode: ImageFitMode) => void;
  onResetAll: () => void;
  // State
  isVisible: boolean;
  onToggle: () => void;
}

interface SliderRowProps {
  label: string;
  icon: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
  onReset: () => void;
  defaultValue: number;
  presets?: { label: string; value: number }[];
}

function SliderRow({
  label,
  icon,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  onReset,
  defaultValue,
  presets,
}: SliderRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const isModified = Math.abs(value - defaultValue) > (step / 2);

  const handleNumericSubmit = () => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(Math.max(min, Math.min(max, parsed)));
    }
    setIsEditing(false);
  };

  return (
    <div className="space-y-1.5">
      {/* Label Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm shrink-0">{icon}</span>
          <span className="text-[11px] font-bold text-gray-300 truncate">{label}</span>
          {isModified && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Modified" />
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Value Display / Editable Input */}
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleNumericSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNumericSubmit();
                if (e.key === "Escape") setIsEditing(false);
              }}
              autoFocus
              className="w-16 rounded-lg bg-gray-800 border border-amber-500/50 py-0.5 px-1.5 text-[11px] font-mono text-amber-300 text-center focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          ) : (
            <button
              onClick={() => {
                setEditValue(String(value));
                setIsEditing(true);
              }}
              title="Click to type exact value"
              className="rounded-lg bg-white/5 border border-white/10 px-2 py-0.5 text-[11px] font-mono font-bold text-amber-300 hover:bg-white/10 hover:border-amber-500/30 cursor-pointer transition-all min-w-[52px] text-center"
            >
              {displayValue}
            </button>
          )}

          {/* Per-control Reset */}
          {isModified && (
            <button
              onClick={onReset}
              title={`Reset ${label} to default`}
              className="w-5 h-5 rounded-md text-gray-400 hover:text-amber-300 hover:bg-white/10 text-[10px] flex items-center justify-center cursor-pointer transition-all"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full cursor-pointer bg-gray-700 accent-amber-500"
        style={{
          background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${((value - min) / (max - min)) * 100}%, #374151 ${((value - min) / (max - min)) * 100}%, #374151 100%)`,
          WebkitAppearance: "none",
          appearance: "none",
        }}
      />

      {/* Quick Presets */}
      {presets && presets.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange(p.value)}
              className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-all cursor-pointer ${
                Math.abs(value - p.value) < (step / 2)
                  ? "bg-amber-500 text-gray-950 shadow-sm"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FlagAdjustPanel({
  scale,
  offsetX,
  offsetY,
  rotation,
  opacity,
  fitMode,
  onScaleChange,
  onOffsetXChange,
  onOffsetYChange,
  onRotationChange,
  onOpacityChange,
  onFitModeChange,
  onResetAll,
  isVisible,
  onToggle,
}: FlagAdjustPanelProps) {
  const [activeSection, setActiveSection] = useState<"position" | "transform" | "effects">("position");

  const isModified =
    scale !== 1.0 || offsetX !== 0 || offsetY !== 0 || rotation !== 0 || opacity !== 1.0;

  const nudge = useCallback(
    (axis: "x" | "y", direction: 1 | -1, amount: number) => {
      if (axis === "x") {
        onOffsetXChange(Math.max(-100, Math.min(100, offsetX + direction * amount)));
      } else {
        onOffsetYChange(Math.max(-100, Math.min(100, offsetY + direction * amount)));
      }
    },
    [offsetX, offsetY, onOffsetXChange, onOffsetYChange]
  );

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        title="Open Flag Adjustment Panel"
        className="absolute bottom-3 right-3 z-[600] flex items-center gap-1.5 rounded-xl bg-gray-900/90 backdrop-blur-md border border-amber-500/30 px-3 py-2 text-[11px] font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer shadow-lg transition-all active:scale-95"
      >
        <span>🎛️</span>
        <span>Adjust Flag</span>
        {isModified && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
      </button>
    );
  }

  return (
    <div className="absolute bottom-3 left-3 right-3 z-[600] rounded-2xl bg-gray-900/95 backdrop-blur-xl border border-white/15 shadow-2xl overflow-hidden animate-slideIn">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className="text-sm">🎛️</span>
          <h3 className="text-xs font-extrabold text-white">Flag Adjustment</h3>
          {isModified && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Modified
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isModified && (
            <button
              onClick={onResetAll}
              title="Reset all adjustments to default"
              className="px-2.5 py-1 rounded-lg bg-red-500/15 text-red-300 border border-red-500/25 text-[10px] font-bold hover:bg-red-500/25 cursor-pointer transition-all"
            >
              ↺ Reset All
            </button>
          )}
          <button
            onClick={onToggle}
            title="Collapse panel"
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 cursor-pointer transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 px-3 pt-2.5">
        {[
          { id: "position" as const, label: "📍 Position", icon: "📍" },
          { id: "transform" as const, label: "🔄 Transform", icon: "🔄" },
          { id: "effects" as const, label: "✨ Effects", icon: "✨" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex-1 py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
              activeSection === tab.id
                ? "bg-amber-500 text-gray-950 shadow-sm"
                : "bg-white/5 text-gray-400 hover:bg-white/10"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      <div className="p-4 space-y-4 max-h-[38vh] overflow-y-auto custom-scrollbar">
        {/* ============ POSITION SECTION ============ */}
        {activeSection === "position" && (
          <div className="space-y-4 animate-fadeIn">
            {/* Fit Mode */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                Fit Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "cover", label: "📐 Cover", desc: "Fill shape (maintain ratio)" },
                  { id: "contain", label: "📦 Contain", desc: "Fit inside shape" },
                  { id: "stretch", label: "↔️ Stretch", desc: "Stretch to exact bounds" },
                  { id: "manual", label: "🛠️ Manual", desc: "Full manual control" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => onFitModeChange(mode.id as ImageFitMode)}
                    title={mode.desc}
                    className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer text-center ${
                      fitMode === mode.id
                        ? "bg-amber-500 text-gray-950 shadow-sm"
                        : "bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Zoom/Scale */}
            <SliderRow
              label="Zoom / Scale"
              icon="🔍"
              value={scale}
              min={0.2}
              max={4.0}
              step={0.05}
              displayValue={`${Math.round(scale * 100)}%`}
              onChange={onScaleChange}
              onReset={() => onScaleChange(1.0)}
              defaultValue={1.0}
              presets={[
                { label: "50%", value: 0.5 },
                { label: "75%", value: 0.75 },
                { label: "100%", value: 1.0 },
                { label: "150%", value: 1.5 },
                { label: "200%", value: 2.0 },
                { label: "300%", value: 3.0 },
              ]}
            />

            {/* Horizontal Position */}
            <SliderRow
              label="Horizontal Position"
              icon="↔️"
              value={offsetX}
              min={-100}
              max={100}
              step={1}
              displayValue={`${offsetX > 0 ? "+" : ""}${offsetX}%`}
              onChange={onOffsetXChange}
              onReset={() => onOffsetXChange(0)}
              defaultValue={0}
              presets={[
                { label: "← Left", value: -50 },
                { label: "Center", value: 0 },
                { label: "Right →", value: 50 },
              ]}
            />

            {/* Vertical Position */}
            <SliderRow
              label="Vertical Position"
              icon="↕️"
              value={offsetY}
              min={-100}
              max={100}
              step={1}
              displayValue={`${offsetY > 0 ? "+" : ""}${offsetY}%`}
              onChange={onOffsetYChange}
              onReset={() => onOffsetYChange(0)}
              defaultValue={0}
              presets={[
                { label: "↑ Top", value: -50 },
                { label: "Center", value: 0 },
                { label: "↓ Bottom", value: 50 },
              ]}
            />

            {/* Nudge Controls */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[10px] font-bold text-gray-400">Fine Nudge:</span>
              <div className="flex items-center gap-1">
                <button onClick={() => nudge("x", -1, 1)} title="Nudge left"
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 text-xs font-bold cursor-pointer transition-all">←</button>
                <button onClick={() => nudge("y", -1, 1)} title="Nudge up"
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 text-xs font-bold cursor-pointer transition-all">↑</button>
                <button onClick={() => nudge("y", 1, 1)} title="Nudge down"
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 text-xs font-bold cursor-pointer transition-all">↓</button>
                <button onClick={() => nudge("x", 1, 1)} title="Nudge right"
                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-gray-300 text-xs font-bold cursor-pointer transition-all">→</button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
              <button
                onClick={() => { onOffsetXChange(0); onOffsetYChange(0); }}
                title="Center the image"
                className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-300 border border-white/10 text-[10px] font-bold cursor-pointer transition-all"
              >
                🎯 Center
              </button>
              <button
                onClick={() => { onScaleChange(1.0); onOffsetXChange(0); onOffsetYChange(0); onRotationChange(0); }}
                title="Reset position and zoom"
                className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-300 border border-white/10 text-[10px] font-bold cursor-pointer transition-all"
              >
                ↺ Fit
              </button>
            </div>
          </div>
        )}

        {/* ============ TRANSFORM SECTION ============ */}
        {activeSection === "transform" && (
          <div className="space-y-4 animate-fadeIn">
            {/* Rotation */}
            <SliderRow
              label="Rotation"
              icon="🔄"
              value={rotation}
              min={0}
              max={360}
              step={1}
              displayValue={`${rotation}°`}
              onChange={onRotationChange}
              onReset={() => onRotationChange(0)}
              defaultValue={0}
              presets={[
                { label: "0°", value: 0 },
                { label: "90°", value: 90 },
                { label: "180°", value: 180 },
                { label: "270°", value: 270 },
                { label: "45°", value: 45 },
                { label: "315°", value: 315 },
              ]}
            />

            {/* Opacity */}
            <SliderRow
              label="Image Opacity"
              icon="🎚️"
              value={opacity}
              min={0.05}
              max={1.0}
              step={0.05}
              displayValue={`${Math.round(opacity * 100)}%`}
              onChange={onOpacityChange}
              onReset={() => onOpacityChange(1.0)}
              defaultValue={1.0}
              presets={[
                { label: "25%", value: 0.25 },
                { label: "50%", value: 0.5 },
                { label: "75%", value: 0.75 },
                { label: "100%", value: 1.0 },
              ]}
            />

            {/* Visual Guide */}
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                💡 Canvas Interaction Tips
              </p>
              <ul className="text-[10px] text-gray-400 space-y-1">
                <li>• <strong className="text-gray-300">Drag</strong> on canvas to move image</li>
                <li>• <strong className="text-gray-300">Scroll</strong> on canvas to zoom in/out</li>
                <li>• <strong className="text-gray-300">Pinch</strong> (touch) to zoom</li>
                <li>• <strong className="text-gray-300">Click value</strong> to type exact number</li>
              </ul>
            </div>
          </div>
        )}

        {/* ============ EFFECTS SECTION ============ */}
        {activeSection === "effects" && (
          <div className="space-y-3 animate-fadeIn">
            <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 text-center">
              <p className="text-xs text-gray-400">
                Color tint, filters, and blend effects are available in the
                <strong className="text-amber-300"> Image/Flag Fill</strong> tab on the right panel.
              </p>
            </div>

            {/* Quick filter presets */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                Quick Filters
              </label>
              <p className="text-[10px] text-gray-500">
                Use the filter dropdown in the right panel to apply grayscale, sepia, vintage, or contrast effects.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
