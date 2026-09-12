import type { LayerShadowSpec } from "../utils/geoCapture";

interface ShadowControlsProps {
  /** null = shadow off */
  value: LayerShadowSpec | null;
  onChange: (v: LayerShadowSpec | null) => void;
}

export const DEFAULT_LAYER_SHADOW: LayerShadowSpec = {
  color: "#000000",
  opacity: 0.5,
  blur: 24,
  offsetX: 0,
  offsetY: 12,
};

const ROWS: {
  key: "opacity" | "blur" | "offsetX" | "offsetY";
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}[] = [
  { key: "opacity", label: "Strength", min: 0, max: 1, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "blur", label: "Blur", min: 0, max: 100, step: 1, fmt: (v) => `${v}px` },
  { key: "offsetX", label: "Offset X", min: -50, max: 50, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}px` },
  { key: "offsetY", label: "Offset Y", min: -50, max: 50, step: 1, fmt: (v) => `${v > 0 ? "+" : ""}${v}px` },
];

/**
 * Drop-shadow toggle + config for one layer (image or country).
 * value === null means "off"; enabling it starts from DEFAULT_LAYER_SHADOW.
 */
export default function ShadowControls({ value, onChange }: ShadowControlsProps) {
  const enabled = value !== null;
  const set = (patch: Partial<LayerShadowSpec>) =>
    onChange({ ...(value ?? DEFAULT_LAYER_SHADOW), ...patch });

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center justify-between text-[11px] text-gray-300 cursor-pointer">
        <span
          title="Drop shadow cast by this layer. Note: with the territory mask ON, the shadow only shows inside the mask — turn the mask off for a full drop shadow."
        >
          🌑 Drop Shadow
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? DEFAULT_LAYER_SHADOW : null)}
          className="rounded accent-amber-500 w-3.5 h-3.5 cursor-pointer"
        />
      </label>

      {enabled && (
        <div className="flex flex-col gap-1.5 animate-fadeIn rounded-xl bg-white/[0.03] border border-white/10 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-400">Color</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={value.color}
                onChange={(e) => set({ color: e.target.value })}
                className="w-5 h-5 rounded cursor-pointer border border-white/20 bg-transparent"
              />
              <span className="font-mono text-[10px] text-gray-400 uppercase">{value.color}</span>
            </div>
          </div>

          {ROWS.map((row) => (
            <div key={row.key}>
              <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>{row.label}</span>
                <span className="font-mono text-amber-300">{row.fmt(value[row.key])}</span>
              </div>
              <input
                type="range"
                min={row.min}
                max={row.max}
                step={row.step}
                value={value[row.key]}
                onChange={(e) => set({ [row.key]: parseFloat(e.target.value) } as Partial<LayerShadowSpec>)}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-700 rounded-lg"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
