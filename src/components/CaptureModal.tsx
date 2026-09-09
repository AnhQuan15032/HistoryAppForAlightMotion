import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { getColorForName } from "../utils/colors";
import {
  getCountryGeometries,
  renderCountryToCanvas,
  ImageFitMode,
  ImageFilterEffect,
  MapProjection,
} from "../utils/geoCapture";
import { PRESET_TEXTURES, TexturePreset } from "../utils/presetTextures";
import { searchWikimediaFlags, fetchImageAsBlobUrl, WikiFlagResult } from "../utils/wikiFlags";
import FlagAdjustPanel from "./FlagAdjustPanel";
import SymbolPicker from "./SymbolPicker";
import { SymbolOptions, DEFAULT_SYMBOL_OPTIONS } from "../utils/symbolOverlays";

interface CaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  countryName: string | null;
  yearLabel: string;
  geoJsonData: unknown | null;
  selectedFeature?: unknown | null;
  initialImageFile?: File | null;
}

type FillType = "color" | "image";
type ImageSourceType = "wiki" | "upload" | "texture";

const PRESET_COLORS = [
  { name: "Parchment Gold", hex: "#D4AF37" },
  { name: "Imperial Crimson", hex: "#DC2626" },
  { name: "Royal Azure", hex: "#2563EB" },
  { name: "Emerald Realm", hex: "#059669" },
  { name: "Byzantine Violet", hex: "#7C3AED" },
  { name: "Terracotta Amber", hex: "#D97706" },
  { name: "Obsidian Slate", hex: "#334155" },
  { name: "Silver Frost", hex: "#E2E8F0" },
  { name: "Rose Coral", hex: "#E11D48" },
  { name: "Teal Cyan", hex: "#0D9488" },
  { name: "Pure White", hex: "#FFFFFF" },
  { name: "Pure Black", hex: "#000000" },
];

const TINT_BLEND_MODES: { label: string; mode: GlobalCompositeOperation; desc: string }[] = [
  { label: "Soft Light (Natural)", mode: "soft-light", desc: "Adds gentle tint while preserving image" },
  { label: "Overlay (Vibrant)", mode: "overlay", desc: "Boosts contrast and color vibrancy" },
  { label: "Colorize (Monochrome)", mode: "color", desc: "Recolors image with chosen tone" },
  { label: "Multiply (Antique)", mode: "multiply", desc: "Aged vintage paper stain" },
];

const FILTER_EFFECTS: { label: string; id: ImageFilterEffect }[] = [
  { label: "Original", id: "none" },
  { label: "Grayscale", id: "grayscale" },
  { label: "Sepia (Old Map)", id: "sepia" },
  { label: "Vintage Film", id: "vintage" },
  { label: "High Contrast", id: "high-contrast" },
  { label: "Inverted", id: "invert" },
];

const BACKGROUND_PRESETS = [
  { name: "Transparent", value: "transparent", icon: "🏁" },
  { name: "Dark Void", value: "#0B0F19", icon: "⬛" },
  { name: "Pure White", value: "#FFFFFF", icon: "⬜" },
  { name: "Ancient Parchment", value: "#F5E6C8", icon: "📜" },
  { name: "Deep Navy", value: "#0A192F", icon: "🌊" },
];

const RESOLUTION_OPTIONS = [
  { label: "1024 × 1024 (1K Square)", width: 1024, height: 1024 },
  { label: "2048 × 2048 (2K Crisp)", width: 2048, height: 2048 },
  { label: "4096 × 4096 (4K Ultra-Res)", width: 4096, height: 4096 },
  { label: "1920 × 1080 (16:9 Landscape)", width: 1920, height: 1080 },
];

const PROJECTION_OPTIONS: { id: MapProjection; label: string; desc: string }[] = [
  {
    id: "mercator",
    label: "🗺️ Web Mercator (Matches Map View)",
    desc: "100% exact projection used on the live map",
  },
  {
    id: "equirectangular",
    label: "📐 Equirectangular (Plate Carrée)",
    desc: "Direct linear Lat/Lng grid projection",
  },
  {
    id: "naturalEarth",
    label: "🌍 Natural Earth (Atlas Style)",
    desc: "Curved aesthetic global atlas projection",
  },
];

export default function CaptureModal({
  isOpen,
  onClose,
  countryName,
  yearLabel,
  geoJsonData,
  selectedFeature,
  initialImageFile,
}: CaptureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Active Country State (allows changing region inside Capture Studio)
  const [activeCountry, setActiveCountry] = useState<string>(countryName || "");

  useEffect(() => {
    if (countryName) {
      setActiveCountry(countryName);
    }
  }, [countryName]);

  // List of all regions in the active dataset
  const availableRegions = useMemo(() => {
    if (!geoJsonData) return [];
    const data = geoJsonData as {
      features?: Array<{ properties?: Record<string, unknown> | null }>;
    };
    if (!data.features || !Array.isArray(data.features)) return [];
    const names = new Set<string>();
    data.features.forEach((f) => {
      const p = f?.properties;
      if (!p) return;
      const n = (p.NAME ?? p.name ?? p.TITLE ?? p.title ?? p.SUBJECTO ?? p.subjecto ?? p.ADMIN ?? p.admin) as string | undefined;
      if (typeof n === "string" && n.trim().length > 0) {
        names.add(n.trim());
      }
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [geoJsonData]);

  // Default color from map sovereignty
  const defaultFillColor = useMemo(() => {
    return activeCountry ? getColorForName(activeCountry) : "#D4AF37";
  }, [activeCountry]);

  // Tab State: Solid Color vs Image Fill
  const [fillType, setFillType] = useState<FillType>("image");
  const [imageSource, setImageSource] = useState<ImageSourceType>("wiki");

  // Solid Color State
  const [fillColor, setFillColor] = useState<string>(defaultFillColor);
  const [fillOpacity, setFillOpacity] = useState<number>(0.95);

  // Image Fill State
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [uploadedImageName, setUploadedImageName] = useState<string | null>(null);
  const [loadedImageEl, setLoadedImageEl] = useState<HTMLImageElement | null>(null);
  const [imageFitMode, setImageFitMode] = useState<ImageFitMode>("cover");
  const [imageScale, setImageScale] = useState<number>(1.0);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [imageOpacity, setImageOpacity] = useState<number>(1.0);

  // Wikimedia Commons Flags Auto-Search State
  const [wikiFlags, setWikiFlags] = useState<WikiFlagResult[]>([]);
  const [wikiLoading, setWikiLoading] = useState<boolean>(false);
  const [wikiSearchQuery, setWikiSearchQuery] = useState<string>("");
  const [selectedWikiFlagId, setSelectedWikiFlagId] = useState<number | null>(null);

  // Combine with Base Color State (Color is UNDERNEATH image, never covering it)
  const [combineColorEnabled, setCombineColorEnabled] = useState<boolean>(true);
  const [baseLandColor, setBaseLandColor] = useState<string>(defaultFillColor);
  const [baseLandOpacity, setBaseLandOpacity] = useState<number>(1.0);
  const [tintEnabled, setTintEnabled] = useState<boolean>(false);
  const [tintColor, setTintColor] = useState<string>("#D4AF37");
  const [tintOpacity, setTintOpacity] = useState<number>(0.3);
  const [tintBlendMode, setTintBlendMode] = useState<GlobalCompositeOperation>("soft-light");
  const [filterEffect, setFilterEffect] = useState<ImageFilterEffect>("none");

  // Map Projection State — Default to Mercator (Leaflet map view)
  const [projection, setProjection] = useState<MapProjection>("mercator");

  // Borders & Background State
  const [borderColor, setBorderColor] = useState<string>("#FFFFFF");
  const [borderWidth, setBorderWidth] = useState<number>(0);
  const [backgroundColor, setBackgroundColor] = useState<string>("transparent");
  const [customBgColor, setCustomBgColor] = useState<string>("#1E293B");
  const [resolutionIndex, setResolutionIndex] = useState<number>(1); // Default to 2K (2048x2048)
  const [showTitle, setShowTitle] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isDraggingModalFile, setIsDraggingModalFile] = useState<boolean>(false);
  const [showFlagAdjustPanel, setShowFlagAdjustPanel] = useState<boolean>(false);
  const [symbols, setSymbols] = useState<SymbolOptions[]>([{ ...DEFAULT_SYMBOL_OPTIONS }]);
  const [showSymbolPicker, setShowSymbolPicker] = useState<boolean>(false);

  // Canvas Pan & Drag State
  const [isPanningCanvas, setIsPanningCanvas] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number } | null>(null);
  const touchDistanceRef = useRef<number | null>(null);

  // Automatic Wikimedia Flag Search on Country Open
  useEffect(() => {
    if (!isOpen || !countryName) return;

    setWikiLoading(true);
    setWikiSearchQuery(countryName);
    setSelectedWikiFlagId(null);

    searchWikimediaFlags(countryName)
      .then(async (flags) => {
        setWikiFlags(flags);
        setWikiLoading(false);

        // Auto-select the top matching flag if user doesn't already have an uploaded image
        if (flags.length > 0 && !initialImageFile && !uploadedImageSrc) {
          const topFlag = flags[0];
          setSelectedWikiFlagId(topFlag.id);
          const blobUrl = await fetchImageAsBlobUrl(topFlag.thumbUrl || topFlag.originalUrl);
          setUploadedImageSrc(blobUrl);
          setUploadedImageName(topFlag.cleanTitle);
          setFillType("image");
          setImageSource("wiki");
        }
      })
      .catch(() => {
        setWikiLoading(false);
      });
  }, [isOpen, countryName]);

  // Load initial file if provided
  useEffect(() => {
    if (initialImageFile && isOpen) {
      handleFileSelect(initialImageFile);
      setImageSource("upload");
    }
  }, [initialImageFile, isOpen]);

  // Sync default color when country changes
  useEffect(() => {
    if (countryName) {
      const c = getColorForName(countryName);
      setFillColor(c);
      setBaseLandColor(c);
    }
  }, [countryName]);

  // Load Image Element when uploadedImageSrc changes
  useEffect(() => {
    if (!uploadedImageSrc) {
      setLoadedImageEl(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setLoadedImageEl(img);
    };
    img.src = uploadedImageSrc;
  }, [uploadedImageSrc]);

  // Extract geometries strictly for the active country/region
  const polygons = useMemo(() => {
    if (!activeCountry || !geoJsonData) return [];
    return getCountryGeometries(geoJsonData, activeCountry, selectedFeature);
  }, [activeCountry, geoJsonData, selectedFeature]);

  // Render to canvas whenever options change
  useEffect(() => {
    if (!isOpen || !canvasRef.current || polygons.length === 0 || !activeCountry) return;

    const res = RESOLUTION_OPTIONS[resolutionIndex];
    renderCountryToCanvas(canvasRef.current, polygons, {
      width: res.width,
      height: res.height,
      paddingRatio: 0.12,
      fillColor,
      fillOpacity: fillType === "image" ? 0 : fillOpacity,
      borderColor,
      borderWidth,
      backgroundColor: backgroundColor === "custom" ? customBgColor : backgroundColor,
      showTitle,
      countryName: activeCountry,
      yearLabel,
      projection,
      imageFill:
        fillType === "image" && loadedImageEl
          ? {
              image: loadedImageEl,
              fitMode: imageFitMode,
              scale: imageScale,
              offsetX: imageOffsetX,
              offsetY: imageOffsetY,
              rotation: imageRotation,
              opacity: imageOpacity,
              colorCombine: {
                enabled: combineColorEnabled,
                baseColor: baseLandColor,
                baseColorOpacity: baseLandOpacity,
                tintEnabled,
                tintColor,
                tintOpacity,
                blendMode: tintBlendMode,
                filterEffect,
              },
            }
          : null,
      symbols: symbols.filter((s) => s.type !== "none"),
    });
  }, [
    isOpen,
    polygons,
    activeCountry,
    yearLabel,
    fillType,
    fillColor,
    fillOpacity,
    loadedImageEl,
    imageFitMode,
    imageScale,
    imageOffsetX,
    imageOffsetY,
    imageRotation,
    imageOpacity,
    combineColorEnabled,
    baseLandColor,
    baseLandOpacity,
    tintEnabled,
    tintColor,
    tintOpacity,
    tintBlendMode,
    filterEffect,
    projection,
    borderColor,
    borderWidth,
    backgroundColor,
    customBgColor,
    resolutionIndex,
    showTitle,
    symbols,
  ]);

  // Handle User Selecting a Wikimedia Flag
  const handleSelectWikiFlag = async (flag: WikiFlagResult) => {
    setSelectedWikiFlagId(flag.id);
    const blobUrl = await fetchImageAsBlobUrl(flag.thumbUrl || flag.originalUrl);
    setUploadedImageSrc(blobUrl);
    setUploadedImageName(flag.cleanTitle);
    setFillType("image");
    setImageScale(1.0);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setImageRotation(0);
  };

  // Handle Custom Wikimedia Flag Search
  const handleWikiSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!wikiSearchQuery.trim()) return;

    setWikiLoading(true);
    searchWikimediaFlags(countryName || "", wikiSearchQuery.trim())
      .then((flags) => {
        setWikiFlags(flags);
        setWikiLoading(false);
      })
      .catch(() => {
        setWikiLoading(false);
      });
  };

  // Quick Preset Search Category Tags
  const handleQuickCategorySearch = (tag: string) => {
    if (!countryName) return;
    let query = "";
    if (tag === "flags") query = `Flag of ${countryName}`;
    if (tag === "royal") query = `Royal Standard of ${countryName} OR Imperial standard of ${countryName}`;
    if (tag === "arms") query = `Coat of arms of ${countryName}`;
    if (tag === "naval") query = `Naval ensign of ${countryName} OR War flag of ${countryName}`;
    if (tag === "historical") query = `Historical flags of ${countryName}`;

    setWikiSearchQuery(query);
    setWikiLoading(true);
    searchWikimediaFlags(countryName, query)
      .then((flags) => {
        setWikiFlags(flags);
        setWikiLoading(false);
      })
      .catch(() => {
        setWikiLoading(false);
      });
  };

  // File Upload Handlers
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setUploadedImageSrc(result);
      setUploadedImageName(file.name);
      setFillType("image");
      setImageSource("upload");
      setSelectedWikiFlagId(null);
      setImageScale(1.0);
      setImageOffsetX(0);
      setImageOffsetY(0);
      setImageRotation(0);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelect(files[0]);
    }
  };

  // Drag & Drop Handlers on Modal
  const handleModalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingModalFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleModalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingModalFile) {
      setIsDraggingModalFile(true);
    }
  };

  const handleModalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingModalFile(false);
    }
  };

  // Clipboard Paste Handler (Ctrl+V / Cmd+V)
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelect(file);
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("paste", handlePaste);
    };
  }, [isOpen]);

  const handleSelectPresetTexture = (preset: TexturePreset) => {
    setUploadedImageSrc(preset.dataUrl);
    setUploadedImageName(preset.name);
    setFillType("image");
    setImageSource("texture");
    setSelectedWikiFlagId(null);
    setImageScale(1.0);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setImageRotation(0);
  };

  const handleRemoveImage = () => {
    setUploadedImageSrc(null);
    setUploadedImageName(null);
    setLoadedImageEl(null);
    setSelectedWikiFlagId(null);
    setFillType("color");
  };

  const handleResetImageTransforms = useCallback(() => {
    setImageScale(1.0);
    setImageOffsetX(0);
    setImageOffsetY(0);
    setImageRotation(0);
    setImageOpacity(1.0);
  }, []);

  // Quick Aesthetic Presets for styling flags without obscuring them
  const handleApplyAestheticPreset = (presetType: "antique" | "royal" | "marble" | "vibrant") => {
    setCombineColorEnabled(true);
    switch (presetType) {
      case "antique":
        setBaseLandColor("#D4AF37");
        setBaseLandOpacity(1.0);
        setTintEnabled(true);
        setTintColor("#D4AF37");
        setTintOpacity(0.3);
        setTintBlendMode("soft-light");
        setFilterEffect("sepia");
        break;
      case "royal":
        setBaseLandColor(defaultFillColor);
        setBaseLandOpacity(1.0);
        setTintEnabled(false);
        setFilterEffect("none");
        break;
      case "marble":
        setBaseLandColor("#E2E8F0");
        setBaseLandOpacity(1.0);
        setTintEnabled(true);
        setTintColor("#FFFFFF");
        setTintOpacity(0.25);
        setTintBlendMode("soft-light");
        setFilterEffect("grayscale");
        break;
      case "vibrant":
        setBaseLandColor(defaultFillColor);
        setBaseLandOpacity(1.0);
        setTintEnabled(true);
        setTintColor(defaultFillColor);
        setTintOpacity(0.35);
        setTintBlendMode("overlay");
        setFilterEffect("none");
        break;
    }
  };

  // Interactive Canvas Pan & Zoom Handlers
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (fillType !== "image" || !uploadedImageSrc) return;
    e.preventDefault();
    setIsPanningCanvas(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffsetX: imageOffsetX,
      initialOffsetY: imageOffsetY,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanningCanvas || !panStartRef.current || !canvasContainerRef.current) return;
    e.preventDefault();

    const rect = canvasContainerRef.current.getBoundingClientRect();
    const deltaX = e.clientX - panStartRef.current.x;
    const deltaY = e.clientY - panStartRef.current.y;

    const pctX = (deltaX / rect.width) * 150;
    const pctY = (deltaY / rect.height) * 150;

    const newOffsetX = Math.round(Math.max(-100, Math.min(100, panStartRef.current.initialOffsetX + pctX)));
    const newOffsetY = Math.round(Math.max(-100, Math.min(100, panStartRef.current.initialOffsetY + pctY)));

    setImageOffsetX(newOffsetX);
    setImageOffsetY(newOffsetY);
  };

  const handleCanvasMouseUp = () => {
    setIsPanningCanvas(false);
    panStartRef.current = null;
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (fillType !== "image" || !uploadedImageSrc) return;
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
    setImageScale((prev) => Math.round(Math.max(0.2, Math.min(4.0, prev + zoomDelta)) * 100) / 100);
  };

  // Touch Support
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (fillType !== "image" || !uploadedImageSrc) return;
    if (e.touches.length === 1) {
      setIsPanningCanvas(true);
      panStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        initialOffsetX: imageOffsetX,
        initialOffsetY: imageOffsetY,
      };
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchDistanceRef.current = dist;
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (fillType !== "image" || !uploadedImageSrc || !canvasContainerRef.current) return;
    if (e.touches.length === 1 && isPanningCanvas && panStartRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const deltaX = e.touches[0].clientX - panStartRef.current.x;
      const deltaY = e.touches[0].clientY - panStartRef.current.y;

      const pctX = (deltaX / rect.width) * 150;
      const pctY = (deltaY / rect.height) * 150;

      setImageOffsetX(Math.round(Math.max(-100, Math.min(100, panStartRef.current.initialOffsetX + pctX))));
      setImageOffsetY(Math.round(Math.max(-100, Math.min(100, panStartRef.current.initialOffsetY + pctY))));
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = newDist / touchDistanceRef.current;
      touchDistanceRef.current = newDist;
      setImageScale((prev) => Math.max(0.2, Math.min(4.0, prev * ratio)));
    }
  };

  const handleCanvasTouchEnd = () => {
    setIsPanningCanvas(false);
    panStartRef.current = null;
    touchDistanceRef.current = null;
  };

  if (!isOpen || !countryName) return null;

  // Handle Download PNG
  const handleDownload = () => {
    if (!canvasRef.current) return;
    setIsDownloading(true);

    try {
      const targetName = activeCountry || countryName || "land";
      const sanitizedName = targetName.replace(/[^a-zA-Z0-9_-]/g, "_");
      const sanitizedYear = yearLabel.replace(/[^a-zA-Z0-9_-]/g, "_");
      const filename = `${sanitizedName}_${sanitizedYear}_${projection}_land.png`;

      canvasRef.current.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setIsDownloading(false);
      }, "image/png");
    } catch {
      setIsDownloading(false);
    }
  };

  // Handle Copy to Clipboard
  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          handleDownload();
        }
      }, "image/png");
    } catch {
      handleDownload();
    }
  };

  return (
    <div
      onDrop={handleModalDrop}
      onDragOver={handleModalDragOver}
      onDragLeave={handleModalDragLeave}
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn font-sans"
    >
      {/* Full Modal Drag & Drop Glowing Overlay */}
      {isDraggingModalFile && (
        <div className="absolute inset-0 z-[2500] m-4 sm:m-8 rounded-3xl border-4 border-dashed border-amber-400 bg-amber-950/80 backdrop-blur-xl flex flex-col items-center justify-center gap-3 p-6 text-center shadow-2xl animate-pulse pointer-events-none">
          <span className="text-6xl animate-bounce">📥</span>
          <h3 className="text-2xl font-black text-amber-300">
            Drop Image to Fill {countryName}!
          </h3>
          <p className="text-sm font-semibold text-gray-200">
            Release to mask your image into the land boundaries of {countryName} ({yearLabel})
          </p>
        </div>
      )}

      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col rounded-3xl bg-gray-900 border border-white/15 shadow-2xl overflow-hidden text-gray-100 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 text-lg">
              📸
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Capture Land (PNG)
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 font-mono">
                  {yearLabel}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs text-gray-400">Region:</span>
                <select
                  value={activeCountry}
                  onChange={(e) => setActiveCountry(e.target.value)}
                  className="rounded-lg bg-gray-800 border border-white/15 py-0.5 px-2 text-xs text-amber-300 font-bold focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer max-w-[200px]"
                >
                  <option value={activeCountry}>📌 {activeCountry}</option>
                  {availableRegions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                  <option value="__ALL__">🌐 Full Dataset (All Regions)</option>
                </select>
              </div>
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

        {/* Content Body: Left Preview, Right Controls */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto custom-scrollbar">
          {/* Left Canvas Preview (7 cols on lg) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            <div
              ref={canvasContainerRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onWheel={handleCanvasWheel}
              onTouchStart={handleCanvasTouchStart}
              onTouchMove={handleCanvasTouchMove}
              onTouchEnd={handleCanvasTouchEnd}
              className={`relative w-full aspect-square max-w-[460px] rounded-2xl border border-white/15 flex items-center justify-center p-3 shadow-inner overflow-hidden bg-gray-950 select-none ${
                fillType === "image" && uploadedImageSrc
                  ? isPanningCanvas
                    ? "cursor-grabbing ring-2 ring-amber-400/50"
                    : "cursor-grab hover:border-amber-400/50"
                  : ""
              }`}
            >
              {/* Checkerboard Pattern for Transparent Canvas */}
              {backgroundColor === "transparent" && (
                <div
                  className="absolute inset-0 opacity-25 pointer-events-none"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #475569 25%, transparent 25%), linear-gradient(-45deg, #475569 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #475569 75%), linear-gradient(-45deg, transparent 75%, #475569 75%)",
                    backgroundSize: "20px 20px",
                    backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                  }}
                />
              )}

              {/* The Actual Canvas Element */}
              <canvas
                ref={canvasRef}
                className="relative max-h-full max-w-full object-contain rounded-lg drop-shadow-2xl pointer-events-none"
              />

              {/* Interactive Canvas Overlay Badge when Image is Loaded */}
              {fillType === "image" && uploadedImageSrc && (
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-gray-900/90 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-lg text-[10px] text-gray-300 shadow-md">
                  <span>🖐️</span>
                  <span>Drag to pan · Scroll to zoom</span>
                </div>
              )}

              {/* Base land color indicator */}
              {fillType === "image" && uploadedImageSrc && combineColorEnabled && (
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-gray-900/90 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-lg text-[10px] text-gray-300 shadow-md">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white/20"
                    style={{ backgroundColor: baseLandColor }}
                  />
                  <span>Land Base Color</span>
                </div>
              )}

              {/* Quick Reset Button in Preview */}
              {fillType === "image" && uploadedImageSrc && (imageOffsetX !== 0 || imageOffsetY !== 0 || imageScale !== 1.0) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetImageTransforms();
                  }}
                  className="absolute bottom-2.5 right-2.5 bg-gray-900/90 hover:bg-gray-800 backdrop-blur-md border border-white/20 px-2.5 py-1 rounded-lg text-[10px] font-bold text-amber-300 shadow-md transition-all cursor-pointer"
                >
                  Reset Alignment
                </button>
              )}
            </div>

            {/* Quick resolution / size / projection info */}
            <div className="mt-3 flex items-center justify-between w-full max-w-[460px] px-1 text-[11px] text-gray-400">
              <span>
                📐 {RESOLUTION_OPTIONS[resolutionIndex].width} × {RESOLUTION_OPTIONS[resolutionIndex].height}px
              </span>
              <span>
                {polygons.length} Land Polygon{polygons.length !== 1 ? "s" : ""}
              </span>
              <span className="text-amber-400 font-medium">
                {projection === "mercator" ? "🗺️ Web Mercator (Map View)" : projection === "naturalEarth" ? "🌍 Natural Earth" : "📐 Equirectangular"}
              </span>
            </div>

            {/* Flag Adjustment Panel (floating, overlays canvas area) */}
            {fillType === "image" && uploadedImageSrc && (
              <div className="relative w-full max-w-[460px]">
                <FlagAdjustPanel
                  scale={imageScale}
                  offsetX={imageOffsetX}
                  offsetY={imageOffsetY}
                  rotation={imageRotation}
                  opacity={imageOpacity}
                  fitMode={imageFitMode}
                  onScaleChange={setImageScale}
                  onOffsetXChange={setImageOffsetX}
                  onOffsetYChange={setImageOffsetY}
                  onRotationChange={setImageRotation}
                  onOpacityChange={setImageOpacity}
                  onFitModeChange={setImageFitMode}
                  onResetAll={handleResetImageTransforms}
                  isVisible={showFlagAdjustPanel}
                  onToggle={() => setShowFlagAdjustPanel(!showFlagAdjustPanel)}
                />
              </div>
            )}
          </div>

          {/* Right Controls Panel (5 cols on lg) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            {/* Fill Mode Switcher Tabs */}
            <div className="flex rounded-xl bg-gray-800/80 p-1 border border-white/10">
              <button
                onClick={() => setFillType("image")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  fillType === "image"
                    ? "bg-amber-500 text-gray-950 shadow-md"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>🌐</span>
                <span>Flag / Image Fill</span>
              </button>
              <button
                onClick={() => setFillType("color")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  fillType === "color"
                    ? "bg-amber-500 text-gray-950 shadow-md"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <span>🎨</span>
                <span>Solid Color Only</span>
              </button>
            </div>

            {/* SECTION 1A: Solid Color Fill Settings */}
            {fillType === "color" && (
              <div className="flex flex-col gap-3 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    🎨 Land Palette
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                      className="w-6 h-6 rounded-md cursor-pointer border border-white/20 bg-transparent"
                      title="Custom Color Picker"
                    />
                    <span className="font-mono text-[11px] text-gray-300 uppercase">{fillColor}</span>
                  </div>
                </div>

                {/* Preset Color Swatches */}
                <div className="grid grid-cols-6 gap-1.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.name}
                      onClick={() => setFillColor(c.hex)}
                      title={c.name}
                      className={`h-7 rounded-lg border transition-all cursor-pointer ${
                        fillColor.toLowerCase() === c.hex.toLowerCase()
                          ? "border-amber-400 ring-2 ring-amber-400/40 scale-105"
                          : "border-white/10 hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>

                {/* Fill Opacity */}
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <span>Fill Opacity</span>
                    <span className="font-mono text-amber-300">{Math.round(fillOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={fillOpacity}
                    onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-700 rounded-lg mt-1"
                  />
                </div>
              </div>
            )}

            {/* SECTION 1B: Custom Image / Flag Fill Settings */}
            {fillType === "image" && (
              <div className="flex flex-col gap-3 animate-fadeIn">
                {/* Sub-Tabs: Wikimedia Flags vs Custom Upload vs Presets */}
                <div className="flex rounded-lg bg-gray-950 p-1 border border-white/10 gap-1 text-[11px] font-bold">
                  <button
                    onClick={() => setImageSource("wiki")}
                    className={`flex-1 py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      imageSource === "wiki"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span>🌐</span>
                    <span>Wikimedia Flags</span>
                  </button>
                  <button
                    onClick={() => setImageSource("upload")}
                    className={`flex-1 py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      imageSource === "upload"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span>📤</span>
                    <span>Upload Image</span>
                  </button>
                  <button
                    onClick={() => setImageSource("texture")}
                    className={`flex-1 py-1.5 px-2 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      imageSource === "texture"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span>✨</span>
                    <span>Textures</span>
                  </button>
                </div>

                {/* TAB 1: Wikimedia Commons Auto Search & Gallery */}
                {imageSource === "wiki" && (
                  <div className="flex flex-col gap-2.5 bg-white/[0.02] p-3 rounded-2xl border border-white/10">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <span>🌐</span>
                        <span>Wikimedia Commons Flags</span>
                      </label>
                      {wikiLoading && (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1 animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                          Searching...
                        </span>
                      )}
                    </div>

                    {/* Search Form */}
                    <form onSubmit={handleWikiSearchSubmit} className="flex gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={wikiSearchQuery}
                          onChange={(e) => setWikiSearchQuery(e.target.value)}
                          placeholder={`Search flags for ${countryName}...`}
                          className="w-full rounded-lg bg-gray-800 border border-white/15 py-1.5 pl-3 pr-8 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        {wikiSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setWikiSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-xs shadow transition-all cursor-pointer shrink-0"
                      >
                        Search
                      </button>
                    </form>

                    {/* Quick Category Chips */}
                    <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 text-[10px]">
                      <button
                        onClick={() => handleQuickCategorySearch("flags")}
                        className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-200 border border-white/10 whitespace-nowrap cursor-pointer"
                      >
                        🚩 All Flags
                      </button>
                      <button
                        onClick={() => handleQuickCategorySearch("royal")}
                        className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-200 border border-white/10 whitespace-nowrap cursor-pointer"
                      >
                        👑 Royal Standards
                      </button>
                      <button
                        onClick={() => handleQuickCategorySearch("arms")}
                        className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-200 border border-white/10 whitespace-nowrap cursor-pointer"
                      >
                        🛡️ Coat of Arms
                      </button>
                      <button
                        onClick={() => handleQuickCategorySearch("naval")}
                        className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-200 border border-white/10 whitespace-nowrap cursor-pointer"
                      >
                        ⚔️ War Banners
                      </button>
                      <button
                        onClick={() => handleQuickCategorySearch("historical")}
                        className="px-2 py-0.5 rounded-full bg-white/5 hover:bg-amber-500/20 text-gray-300 hover:text-amber-200 border border-white/10 whitespace-nowrap cursor-pointer"
                      >
                        📜 Historical
                      </button>
                    </div>

                    {/* Flag Results Gallery */}
                    <div className="max-h-48 overflow-y-auto custom-scrollbar pr-1">
                      {wikiLoading ? (
                        <div className="grid grid-cols-3 gap-2 py-4">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div
                              key={i}
                              className="h-20 rounded-xl bg-gray-800 animate-pulse border border-white/5"
                            />
                          ))}
                        </div>
                      ) : wikiFlags.length === 0 ? (
                        <div className="py-6 text-center text-xs text-gray-400">
                          <p>No flags found for "{wikiSearchQuery}".</p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            Try searching with an alternative name or keyword above.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {wikiFlags.map((flag) => {
                            const isSelected =
                              selectedWikiFlagId === flag.id ||
                              uploadedImageName === flag.cleanTitle;
                            return (
                              <button
                                key={flag.id}
                                onClick={() => handleSelectWikiFlag(flag)}
                                title={`${flag.cleanTitle}${flag.date ? ` (${flag.date})` : ""}`}
                                className={`relative group rounded-xl p-1.5 flex flex-col items-center gap-1 text-left border transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-amber-500/25 border-amber-400 ring-2 ring-amber-400/40 shadow-lg scale-[1.02]"
                                    : "bg-gray-800/80 border-white/10 hover:border-amber-400/50 hover:bg-gray-800"
                                }`}
                              >
                                <div className="w-full h-14 rounded-lg bg-gray-950/80 flex items-center justify-center overflow-hidden border border-white/10">
                                  <img
                                    src={flag.thumbUrl}
                                    alt={flag.cleanTitle}
                                    loading="lazy"
                                    className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform"
                                  />
                                </div>

                                <p className="text-[10px] font-semibold text-gray-200 line-clamp-1 w-full text-center leading-tight">
                                  {flag.cleanTitle}
                                </p>

                                {isSelected && (
                                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-amber-400 text-gray-950 flex items-center justify-center text-[10px] font-black shadow">
                                    ✓
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: Upload Custom Image */}
                {imageSource === "upload" && (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    {!uploadedImageSrc ? (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-white/20 hover:border-amber-400/70 rounded-2xl p-4 text-center cursor-pointer transition-all bg-white/[0.02] hover:bg-amber-500/[0.04] text-gray-300 flex flex-col items-center justify-center gap-1.5 group"
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">📤</span>
                        <p className="text-xs font-bold text-gray-200 group-hover:text-amber-300">
                          Click to Upload Flag / Image or Drag & Drop
                        </p>
                        <p className="text-[10px] text-gray-400">
                          Supports PNG, JPG, SVG, WebP · or press <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[9px]">Ctrl+V</kbd> to paste
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/10">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={uploadedImageSrc}
                            alt="Thumbnail"
                            className="w-9 h-9 rounded-lg object-cover border border-white/20 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-gray-200 truncate">
                              {uploadedImageName || "Custom Image"}
                            </p>
                            <p className="text-[10px] text-amber-400">Image masked on land</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Replace image"
                            className="px-2 py-1 text-[11px] rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 font-medium transition-colors cursor-pointer"
                          >
                            Change
                          </button>
                          <button
                            onClick={handleRemoveImage}
                            title="Remove image"
                            className="p-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: Instant Texture Presets */}
                {imageSource === "texture" && (
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1.5">
                      ✨ Pick a Historical Texture Preset
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {PRESET_TEXTURES.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleSelectPresetTexture(preset)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                            uploadedImageSrc === preset.dataUrl
                              ? "bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm"
                              : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                          }`}
                        >
                          <span className="text-sm">{preset.icon}</span>
                          <span className="truncate text-[11px]">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 🌟 BASE LAND COLOR (Underneath image - never covers it!) */}
                {uploadedImageSrc && (
                  <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/10 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <span>🎨</span>
                        <span>Land Base Color (Underneath Flag)</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={baseLandColor}
                          onChange={(e) => setBaseLandColor(e.target.value)}
                          className="w-5 h-5 rounded cursor-pointer border border-white/20 bg-transparent"
                        />
                        <span className="font-mono text-[10px] text-amber-300 uppercase">{baseLandColor}</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-400 leading-tight">
                      Fills the country background underneath the image. If you scale down or move the flag, this color fills the rest of the country.
                    </p>

                    {/* Swatches for Base Land Color */}
                    <div className="grid grid-cols-6 gap-1">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c.name}
                          onClick={() => setBaseLandColor(c.hex)}
                          title={c.name}
                          className={`h-5 rounded-md border transition-all cursor-pointer ${
                            baseLandColor.toLowerCase() === c.hex.toLowerCase()
                              ? "border-amber-400 ring-2 ring-amber-400/40 scale-105"
                              : "border-white/10 hover:scale-105"
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>

                    {/* Quick Aesthetic Styles */}
                    <div className="pt-2 border-t border-white/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        ⚡ Quick Aesthetic Flag Styles
                      </span>
                      <div className="grid grid-cols-4 gap-1">
                        <button
                          onClick={() => handleApplyAestheticPreset("royal")}
                          className="py-1 px-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-[10px] font-medium text-amber-200 border border-white/10 transition-colors text-center cursor-pointer"
                          title="Original flag on Sovereign Land Color"
                        >
                          👑 Clean Royal
                        </button>
                        <button
                          onClick={() => handleApplyAestheticPreset("antique")}
                          className="py-1 px-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-[10px] font-medium text-amber-200 border border-white/10 transition-colors text-center cursor-pointer"
                          title="Antique Parchment Wash"
                        >
                          📜 Antique
                        </button>
                        <button
                          onClick={() => handleApplyAestheticPreset("marble")}
                          className="py-1 px-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-[10px] font-medium text-amber-200 border border-white/10 transition-colors text-center cursor-pointer"
                          title="Monochrome Marble Relief"
                        >
                          🏛️ Marble
                        </button>
                        <button
                          onClick={() => handleApplyAestheticPreset("vibrant")}
                          className="py-1 px-1.5 rounded-lg bg-white/5 hover:bg-amber-500/20 text-[10px] font-medium text-amber-200 border border-white/10 transition-colors text-center cursor-pointer"
                          title="Vibrant Contrast Overlay"
                        >
                          ✨ Vibrant
                        </button>
                      </div>
                    </div>

                    {/* Pre-filter (Grayscale, Sepia, etc.) */}
                    <div className="flex items-center justify-between text-[11px] text-gray-300 pt-1 border-t border-white/5">
                      <span>Image Color Tone:</span>
                      <select
                        value={filterEffect}
                        onChange={(e) => setFilterEffect(e.target.value as ImageFilterEffect)}
                        className="rounded-lg bg-gray-800 border border-white/15 py-1 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                      >
                        {FILTER_EFFECTS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Optional Subtle Tint (Never covers the image) */}
                    <div className="pt-1.5 border-t border-white/5 flex flex-col gap-1.5">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-[11px] text-gray-300 flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={tintEnabled}
                            onChange={(e) => setTintEnabled(e.target.checked)}
                            className="rounded accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          <span>Add Subtle Atmosphere Tint</span>
                        </span>
                        {tintEnabled && (
                          <input
                            type="color"
                            value={tintColor}
                            onChange={(e) => setTintColor(e.target.value)}
                            className="w-4 h-4 rounded cursor-pointer border border-white/20 bg-transparent"
                          />
                        )}
                      </label>

                      {tintEnabled && (
                        <div className="grid grid-cols-2 gap-2 mt-1 animate-fadeIn">
                          <div>
                            <span className="text-[10px] text-gray-400 block mb-0.5">Tint Blend</span>
                            <select
                              value={tintBlendMode}
                              onChange={(e) => setTintBlendMode(e.target.value as GlobalCompositeOperation)}
                              className="w-full rounded-lg bg-gray-800 border border-white/15 py-1 px-1.5 text-[10px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                            >
                              {TINT_BLEND_MODES.map((b) => (
                                <option key={b.mode} value={b.mode}>
                                  {b.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                              <span>Strength</span>
                              <span className="font-mono text-amber-300">{Math.round(tintOpacity * 100)}%</span>
                            </div>
                            <input
                              type="range"
                              min="0.05"
                              max="0.5"
                              step="0.05"
                              value={tintOpacity}
                              onChange={(e) => setTintOpacity(parseFloat(e.target.value))}
                              className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-700 rounded-lg mt-1"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Flag Adjustment Quick Reference (full panel is at bottom of canvas) */}
                {uploadedImageSrc && (
                  <div className="pt-2 border-t border-white/10">
                    <button
                      onClick={() => setShowFlagAdjustPanel(!showFlagAdjustPanel)}
                      className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/5 hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/30 text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🎛️</span>
                        <div>
                          <p className="text-xs font-bold text-gray-200 group-hover:text-amber-300 transition-colors">
                            Adjust Flag Position & Transform
                          </p>
                          <p className="text-[10px] text-gray-500">
                            Scale: {Math.round(imageScale * 100)}% · Offset: {imageOffsetX}%, {imageOffsetY}% · Rotation: {imageRotation}°
                          </p>
                        </div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 group-hover:text-amber-300 transition-transform ${showFlagAdjustPanel ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            )}

                {/* Symbol/Charge Overlay Picker */}
                <div className="pt-2 border-t border-white/10">
                  <SymbolPicker
                    symbols={symbols}
                    onChange={setSymbols}
                    isVisible={showSymbolPicker}
                    onToggle={() => setShowSymbolPicker(!showSymbolPicker)}
                    canvasRef={canvasRef}
                    hasImage={!!uploadedImageSrc}
                  />
                </div>

                {/* SECTION 2: Straight Border Controls */}
            <div className="pt-3 border-t border-white/10">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  📐 Border & Outline
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={borderColor}
                    onChange={(e) => setBorderColor(e.target.value)}
                    className="w-5 h-5 rounded-md cursor-pointer border border-white/20 bg-transparent"
                    title="Border Color"
                  />
                  <span className="font-mono text-[11px] text-gray-300 uppercase">{borderColor}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-300">
                <span>Thickness</span>
                <span className="font-mono text-amber-300">
                  {borderWidth === 0 ? "Borderless (0px)" : `${borderWidth}px`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={borderWidth}
                onChange={(e) => setBorderWidth(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-700 rounded-lg mt-1"
              />
            </div>

            {/* SECTION 3: Background Style */}
            <div className="pt-3 border-t border-white/10">
              <label className="text-xs font-bold uppercase tracking-wider text-amber-300 block mb-2">
                🖼️ Background
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {BACKGROUND_PRESETS.map((bg) => (
                  <button
                    key={bg.name}
                    onClick={() => setBackgroundColor(bg.value)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                      backgroundColor === bg.value
                        ? "bg-amber-500/20 border-amber-400 text-amber-200"
                        : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    <span>{bg.icon}</span>
                    <span className="truncate">{bg.name}</span>
                  </button>
                ))}
                <button
                  onClick={() => setBackgroundColor("custom")}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                    backgroundColor === "custom"
                      ? "bg-amber-500/20 border-amber-400 text-amber-200"
                      : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  <input
                    type="color"
                    value={customBgColor}
                    onChange={(e) => {
                      setCustomBgColor(e.target.value);
                      setBackgroundColor("custom");
                    }}
                    className="w-3.5 h-3.5 rounded cursor-pointer bg-transparent border-0 p-0"
                  />
                  <span>Custom</span>
                </button>
              </div>
            </div>

            {/* SECTION 4: Map Projection & Output Dimensions */}
            <div className="pt-3 border-t border-white/10 flex flex-col gap-3">
              {/* Map Projection Selector */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-amber-300 block mb-1">
                  🌐 Map Projection
                </label>
                <select
                  value={projection}
                  onChange={(e) => setProjection(e.target.value as MapProjection)}
                  className="w-full rounded-lg bg-gray-800 border border-white/15 py-1.5 px-2.5 text-xs text-amber-200 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  {PROJECTION_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-400 mt-1">
                  {PROJECTION_OPTIONS.find((p) => p.id === projection)?.desc}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-amber-300 block mb-1">
                  📐 Output Dimensions
                </label>
                <select
                  value={resolutionIndex}
                  onChange={(e) => setResolutionIndex(parseInt(e.target.value, 10))}
                  className="w-full rounded-lg bg-gray-800 border border-white/15 py-1.5 px-2.5 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                >
                  {RESOLUTION_OPTIONS.map((opt, idx) => (
                    <option key={opt.label} value={idx}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title toggle */}
              <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer mt-0.5">
                <input
                  type="checkbox"
                  checked={showTitle}
                  onChange={(e) => setShowTitle(e.target.checked)}
                  className="rounded accent-amber-500 w-4 h-4 cursor-pointer"
                />
                <span>Include text watermark ("{countryName} · {yearLabel}")</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <div className="text-xs text-gray-400 hidden sm:block">
            ✨ {fillType === "image" ? "Image on top of land base color" : "Transparent PNG land cutout"} ready for export
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={handleCopy}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-bold transition-all cursor-pointer"
            >
              <span>{copied ? "✅" : "📋"}</span>
              <span>{copied ? "Copied PNG!" : "Copy to Clipboard"}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-gray-950 text-xs font-extrabold shadow-lg shadow-amber-500/25 transition-all active:scale-95 cursor-pointer"
            >
              <span>📥</span>
              <span>{isDownloading ? "Generating..." : "Download PNG"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
