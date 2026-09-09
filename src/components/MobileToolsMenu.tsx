import { useState } from "react";

interface MobileToolsMenuProps {
  showLabels: boolean;
  onToggleLabels: () => void;
  onOpenLayers: () => void;
  onOpenProjections: () => void;
  onOpenLeaderboard: () => void;
  onOpenCache: () => void;
}

export default function MobileToolsMenu({
  showLabels,
  onToggleLabels,
  onOpenLayers,
  onOpenProjections,
  
  onOpenLeaderboard,
  onOpenCache,
}: MobileToolsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const tools = [
    {
      icon: "🌐",
      label: "Projections",
      action: () => { onOpenProjections(); setIsOpen(false); },
      active: false,
      highlight: true,
    },
    {
      icon: "🗺️",
      label: "Map Style",
      action: () => { onOpenLayers(); setIsOpen(false); },
      active: false,
    },
    {
      icon: "🏷️",
      label: showLabels ? "Labels ON" : "Labels OFF",
      action: onToggleLabels,
      active: showLabels,
    },
    {
      icon: "🏆",
      label: "Rankings",
      action: () => { onOpenLeaderboard(); setIsOpen(false); },
      active: false,
    },
    {
      icon: "📂",
      label: "Custom Data",
      action: () => { onOpenCache(); setIsOpen(false); },
      active: false,
    },
  ];

  return (
    <>
      {isOpen && (
        <div onClick={() => setIsOpen(false)} className="fixed inset-0 z-[1400] bg-black/40 backdrop-blur-sm animate-fadeIn" />
      )}

      <div className="absolute bottom-28 sm:bottom-36 left-3 sm:left-4 z-[1500]">
        {isOpen && (
          <div className="absolute bottom-14 left-0 rounded-3xl bg-gray-900/95 backdrop-blur-2xl border border-white/20 p-3 shadow-2xl animate-scaleUp w-[280px] sm:w-[320px]">
            <div className="flex items-center justify-between px-1 pb-2 mb-2 border-b border-white/10">
              <span className="text-xs font-extrabold text-amber-300 uppercase tracking-wider">⚙️ Tools</span>
              <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white p-1 rounded-lg bg-white/5 active:bg-white/15 cursor-pointer text-xs">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {tools.map((tool) => (
                <button key={tool.label} onClick={tool.action}
                  className={`flex flex-col items-center justify-center gap-1.5 p-2.5 rounded-2xl border transition-all cursor-pointer active:scale-95 min-h-[60px] ${
                    tool.highlight
                      ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-300 ring-1 ring-cyan-400/30"
                      : tool.active
                        ? "bg-amber-500/20 border-amber-400/40 text-amber-300 shadow-sm"
                        : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 active:bg-white/15"
                  }`}>
                  <span className="text-xl">{tool.icon}</span>
                  <span className="text-[10px] font-bold leading-tight text-center">{tool.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center justify-center w-12 h-12 rounded-2xl shadow-2xl transition-all cursor-pointer active:scale-90 ${
            isOpen ? "bg-amber-500 text-gray-950 rotate-45 shadow-amber-500/40" : "bg-gray-900/95 backdrop-blur-xl border border-white/20 text-amber-300 hover:bg-gray-800 shadow-black/50"
          }`} title="Open Tools Menu">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </>
  );
}
