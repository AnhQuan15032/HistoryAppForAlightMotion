import { useState } from "react";
import L from "leaflet";
import { createBingTileLayer } from "../utils/bingMaps";

export type MapLayerType =
  // Antique / Historical Relief Series
  | "antique-relief"
  | "antique-topo"
  | "ocean-depths"
  // Bing Maps Series
  | "bing-aerial"
  | "bing-road"
  | "bing-hybrid"
  | "bing-dark"
  | "bing-light"
  // Standard Layers
  | "dark"
  | "light"
  | "voyager"
  | "satellite"
  | "physical"
  | "watercolor"
  | "osm"
  | "blank";

interface MapLayerControlProps {
  activeLayer: MapLayerType;
  onChange: (layer: MapLayerType) => void;
}

export interface LayerDefinition {
  id: MapLayerType;
  label: string;
  icon: string;
  description: string;
  category: "antique" | "bing" | "standard";
}

export const LAYERS: LayerDefinition[] = [
  // Antique / Historical Relief Series
  {
    id: "antique-relief",
    label: "Antique Shaded Relief",
    icon: "🏛️",
    description: "Warm historical parchment atlas with shaded terrain relief",
    category: "antique",
  },
  {
    id: "antique-topo",
    label: "Antique Topography",
    icon: "📜",
    description: "Vintage topographic contours, terrain elevation & ancient waterways",
    category: "antique",
  },
  {
    id: "ocean-depths",
    label: "Ocean Bathymetry",
    icon: "🌊",
    description: "Deep sea bathymetric contours & marine relief",
    category: "antique",
  },

  // Bing Maps Series
  {
    id: "bing-aerial",
    label: "Bing Maps Aerial",
    icon: "🛰️",
    description: "High-resolution Microsoft Bing satellite imagery",
    category: "bing",
  },
  {
    id: "bing-road",
    label: "Bing Maps Road",
    icon: "🗺️",
    description: "Microsoft Bing vector street & city map",
    category: "bing",
  },
  {
    id: "bing-hybrid",
    label: "Bing Maps Hybrid",
    icon: "🌐",
    description: "Bing satellite imagery with road network overlay",
    category: "bing",
  },
  {
    id: "bing-dark",
    label: "Bing Maps Dark",
    icon: "🌑",
    description: "Subtle dark Bing map style for vivid country borders",
    category: "bing",
  },
  {
    id: "bing-light",
    label: "Bing Maps Light",
    icon: "☀️",
    description: "Clean grayscale Bing map style",
    category: "bing",
  },

  // Standard Open Basemaps
  {
    id: "dark",
    label: "CARTO Dark",
    icon: "🌑",
    description: "Sleek dark theme, high contrast",
    category: "standard",
  },
  {
    id: "light",
    label: "CARTO Light",
    icon: "☀️",
    description: "Clean minimalist light basemap",
    category: "standard",
  },
  {
    id: "voyager",
    label: "CARTO Voyager",
    icon: "🧭",
    description: "Detailed warm explorer style",
    category: "standard",
  },
  {
    id: "satellite",
    label: "Esri Satellite",
    icon: "🛰️",
    description: "Realistic satellite imagery",
    category: "standard",
  },
  {
    id: "physical",
    label: "Esri Physical Topo",
    icon: "⛰️",
    description: "Mountains & terrain elevation",
    category: "standard",
  },
  {
    id: "watercolor",
    label: "Stamen Watercolor",
    icon: "🎨",
    description: "Artistic parchment watercolor style",
    category: "standard",
  },
  {
    id: "osm",
    label: "OpenStreetMap",
    icon: "📜",
    description: "Standard community geographic map",
    category: "standard",
  },
  {
    id: "blank",
    label: "Blank (No Tiles)",
    icon: "📄",
    description: "Solid background, only borders",
    category: "standard",
  },
];

export default function MapLayerControl({
  activeLayer,
  onChange,
}: MapLayerControlProps) {
  const getInitialTab = (): "antique" | "bing" | "standard" => {
    if (activeLayer.startsWith("antique") || activeLayer === "ocean-depths") return "antique";
    if (activeLayer.startsWith("bing")) return "bing";
    return "standard";
  };

  const [activeTab, setActiveTab] = useState<"antique" | "bing" | "standard">(getInitialTab);

  const filteredLayers = LAYERS.filter((l) => l.category === activeTab);

  return (
    <div className="flex flex-col gap-2 w-72 sm:w-96 max-w-full">
      {/* Category Tabs: Antique vs Bing Maps vs Standard */}
      <div className="flex rounded-xl bg-gray-950 p-1 border border-white/10 text-xs font-bold">
        <button
          onClick={() => setActiveTab("antique")}
          className={`flex-1 py-2 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === "antique"
              ? "bg-amber-500 text-gray-950 shadow-md font-bold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span>🏛️</span>
          <span>Antique</span>
        </button>
        <button
          onClick={() => setActiveTab("bing")}
          className={`flex-1 py-2 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === "bing"
              ? "bg-amber-500 text-gray-950 shadow-md font-bold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span>🛰️</span>
          <span>Bing Maps</span>
        </button>
        <button
          onClick={() => setActiveTab("standard")}
          className={`flex-1 py-2 px-1.5 rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
            activeTab === "standard"
              ? "bg-amber-500 text-gray-950 shadow-md font-bold"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          <span>🌐</span>
          <span>Standard</span>
        </button>
      </div>

      {/* Layer Buttons List */}
      <div className="flex flex-col gap-1.5 max-h-64 sm:max-h-72 overflow-y-auto custom-scrollbar p-0.5">
        {filteredLayers.map((layer) => {
          const isActive = activeLayer === layer.id;
          return (
            <button
              key={layer.id}
              onClick={() => onChange(layer.id)}
              title={layer.description}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all cursor-pointer min-h-[44px] ${
                isActive
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 ring-1 ring-amber-500/20 shadow-sm"
                  : "bg-white/5 text-gray-300 border border-transparent hover:bg-white/10 hover:text-white active:bg-white/15"
              }`}
            >
              <span className="text-lg shrink-0">{layer.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold leading-tight truncate">{layer.label}</p>
                  {isActive && <span className="text-[10px] text-amber-400 font-bold">Active</span>}
                </div>
                <p className="text-[10px] text-gray-400 truncate leading-tight mt-0.5">
                  {layer.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Creates Leaflet TileLayer instance for Antique, Bing Maps, or Standard Basemaps
 */
export function createMapTileLayer(layerType: MapLayerType): L.TileLayer | null {
  switch (layerType) {
    // Antique / Historical Shaded Relief
    case "antique-relief":
      return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri Relief</a>',
          maxZoom: 13,
        }
      );
    case "antique-topo":
      return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri Physical</a>',
          maxZoom: 8,
        }
      );
    case "ocean-depths":
      return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri Ocean</a>',
          maxZoom: 13,
        }
      );

    // Bing Maps QuadKey Layers
    case "bing-aerial":
      return createBingTileLayer("aerial");
    case "bing-road":
      return createBingTileLayer("road");
    case "bing-hybrid":
      return createBingTileLayer("hybrid");
    case "bing-dark":
      return createBingTileLayer("canvasDark");
    case "bing-light":
      return createBingTileLayer("canvasLight");

    // Standard Open Basemaps
    case "dark":
      return L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
          subdomains: "abcd",
        }
      );
    case "light":
      return L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
          subdomains: "abcd",
        }
      );
    case "voyager":
      return L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19,
          subdomains: "abcd",
        }
      );
    case "satellite":
      return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri Satellite</a>',
          maxZoom: 18,
        }
      );
    case "physical":
      return L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}",
        {
          attribution: '&copy; <a href="https://www.esri.com/">Esri Physical</a>',
          maxZoom: 8,
        }
      );
    case "watercolor":
      return L.tileLayer(
        "https://tiles.stadiamaps.com/tiles/stamen_watercolor/{z}/{x}/{y}.jpg",
        {
          attribution:
            '&copy; <a href="https://stamen.com/">Stamen</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          maxZoom: 16,
        }
      );
    case "osm":
      return L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      });
    case "blank":
      return null;
  }
}
