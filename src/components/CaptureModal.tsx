import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { getColorForName } from "../utils/colors";
import {
  getCountryGeometries,
  renderCountryToCanvas,
  ImageFitMode,
  ImageFilterEffect,
  MapProjection,
  type RenderLayer,
} from "../utils/geoCapture";
import {
  ImageAsset,
  createAssetFromFile,
  loadImageAssets,
  saveImageAssets,
  loadLayerStack,
  saveLayerStack,
} from "../utils/imageLibraryDb";
import {
  COUNTRY_LAYER_ID,
  createCountryLayer,
  createImageLayer,
  normalizeStack,
  type StudioLayer,
} from "../utils/studioLayers";
import { PRESET_TEXTURES, TexturePreset } from "../utils/presetTextures";
import {
  buildXmlDocument,
  yearFromLabel,
  XML_FORMAT_INFO,
  type XmlExportFormat,
  type XmlRenderLayer,
} from "../utils/xmlExport";
import { downloadBlob, formatBytes, imageSrcToDataUrl } from "../utils/fileDownload";
import { getFeatureSovereign } from "../utils/countryFilter";
import XmlBulkExportModal from "./XmlBulkExportModal";
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
  onOpenCacheManager?: () => void;
}

type FillType = "color" | "image";
type ImageSourceType = "wiki" | "upload" | "texture" | "library";

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

const BLEND_MODE_OPTIONS: { label: string; mode: GlobalCompositeOperation }[] = [
  { label: "Normal", mode: "source-over" },
  { label: "Multiply", mode: "multiply" },
  { label: "Screen", mode: "screen" },
  { label: "Overlay", mode: "overlay" },
  { label: "Darken", mode: "darken" },
  { label: "Lighten", mode: "lighten" },
  { label: "Color Dodge", mode: "color-dodge" },
  { label: "Color Burn", mode: "color-burn" },
  { label: "Hard Light", mode: "hard-light" },
  { label: "Soft Light", mode: "soft-light" },
  { label: "Difference", mode: "difference" },
  { label: "Exclusion", mode: "exclusion" },
];

const blendLabel = (mode?: GlobalCompositeOperation) =>
  BLEND_MODE_OPTIONS.find((b) => b.mode === mode)?.label ?? "Normal";

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
  onOpenCacheManager,
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

  // Solid Color State — also the COUNTRY LAYER fill in the layer stack
  const [fillColor, setFillColor] = useState<string>(defaultFillColor);
  const [fillOpacity, setFillOpacity] = useState<number>(0.95);

  // ── Layer stack (CapCut-style multi-image editor) — BOTTOM → TOP ──
  const [layers, setLayers] = useState<StudioLayer[]>(() => [createCountryLayer()]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(COUNTRY_LAYER_ID);
  /** True once the persisted stack (or default) has been loaded on open */
  const [stackReady, setStackReady] = useState<boolean>(false);
  /** Decoded image element cache: src → HTMLImageElement (shared by every layer) */
  const [layerImages, setLayerImages] = useState<Record<string, HTMLImageElement>>({});

  // Live mirrors for async callbacks (avoid stale closures)
  const layersRef = useRef<StudioLayer[]>([]);
  const selectedLayerIdRef = useRef<string | null>(null);
  const layerImagesRef = useRef<Record<string, HTMLImageElement>>({});
  /** Resolves when the on-open stack restore finishes (imports wait for it) */
  const stackReadyPromiseRef = useRef<Promise<void> | null>(null);
  /** Set when an automatic image (default asset / wiki auto-pick) is applied */
  const imageAutoAppliedRef = useRef<boolean>(false);
  /** True once the wiki auto-pick has fired for the current country */
  const wikiAutoAddedRef = useRef<boolean>(false);

  // ── Transform buffer for the SELECTED image layer (write-through) ──
  const [imageFitMode, setImageFitModeBase] = useState<ImageFitMode>("cover");
  const [imageScale, setImageScaleBase] = useState<number>(1.0);
  const [imageOffsetX, setImageOffsetXBase] = useState<number>(0);
  const [imageOffsetY, setImageOffsetYBase] = useState<number>(0);
  const [imageRotation, setImageRotationBase] = useState<number>(0);
  const [imageOpacity, setImageOpacityBase] = useState<number>(1.0);
  /** Blend mode of the SELECTED image layer */
  const [layerBlendMode, setLayerBlendModeBase] = useState<GlobalCompositeOperation>("source-over");

  // Wikimedia Commons Flags Auto-Search State
  const [wikiFlags, setWikiFlags] = useState<WikiFlagResult[]>([]);
  const [wikiLoading, setWikiLoading] = useState<boolean>(false);
  const [wikiSearchQuery, setWikiSearchQuery] = useState<string>("");
  const [selectedWikiFlagId, setSelectedWikiFlagId] = useState<number | null>(null);

  // Atmosphere Tint State (applied per masked image layer, never replaces it)
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

  // ---- Vector XML export state (shared by single-capture + bulk all-era bundle) ----
  const [xmlFormat, setXmlFormat] = useState<XmlExportFormat>(() => {
    if (typeof window === "undefined") return "svg";
    const saved = window.localStorage.getItem("am.capture.xmlFormat");
    return saved === "svg" || saved === "alight" || saved === "geometry" ? saved : "svg";
  });
  const [xmlEmbedFlag, setXmlEmbedFlag] = useState<boolean>(false);
  const [xmlIntroKeyframes, setXmlIntroKeyframes] = useState<boolean>(true);
  const [isDownloadingXml, setIsDownloadingXml] = useState<boolean>(false);
  const [xmlStatus, setXmlStatus] = useState<string | null>(null);
  const [showBulkXmlModal, setShowBulkXmlModal] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("am.capture.xmlFormat", xmlFormat);
    }
  }, [xmlFormat]);

  // ---- Image Library State (persisted in IndexedDB — survives reload / rejoin) ----
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState<boolean>(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [importingAssets, setImportingAssets] = useState<boolean>(false);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  /** Set when the library mutates after load → triggers a persist */
  const libraryDirtyRef = useRef<boolean>(false);

  // Keep the live mirrors in sync
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);
  useEffect(() => {
    selectedLayerIdRef.current = selectedLayerId;
  }, [selectedLayerId]);
  useEffect(() => {
    layerImagesRef.current = layerImages;
  }, [layerImages]);

  // ── Open: restore the persisted image library + layer stack ──
  // A saved stack always wins (it IS the user's last composition). Otherwise
  // build the default: country layer + masked image layer from the marked
  // default asset (when one exists). Imports wait on stackReadyPromiseRef so
  // they can never race the restore.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    setLibraryLoaded(false);
    setStackReady(false);
    setSelectedWikiFlagId(null);
    wikiAutoAddedRef.current = false;
    imageAutoAppliedRef.current = false;

    // Clean base state until the restore lands
    setLayers([createCountryLayer()]);
    setSelectedLayerId(COUNTRY_LAYER_ID);
    setImageFitModeBase("cover");
    setImageScaleBase(1.0);
    setImageOffsetXBase(0);
    setImageOffsetYBase(0);
    setImageRotationBase(0);
    setImageOpacityBase(1.0);
    setFilterEffect("none");
    setLayerBlendModeBase("source-over");

    const ready = (async () => {
      const [assets, stack] = await Promise.all([loadImageAssets(), loadLayerStack()]);
      if (cancelled) return;

      // Merge instead of replace: keep any asset imported while the load was in flight
      setImageAssets((prev) => {
        const loadedIds = new Set(assets.map((a) => a.id));
        return [...prev.filter((a) => !loadedIds.has(a.id)), ...assets];
      });
      setLibraryError(null);
      setLibraryLoaded(true);

      if (stack) {
        // Saved stack wins — restore it exactly, fill included
        setLayers(stack.layers);
        setSelectedLayerId(stack.selectedLayerId);
        setFillColor(stack.fillColor);
        setFillOpacity(stack.fillOpacity);

        const sel = stack.layers.find((l) => l.id === stack.selectedLayerId);
        if (sel && sel.kind === "image") {
          setImageFitModeBase(sel.fitMode ?? "cover");
          setImageScaleBase(sel.scale ?? 1);
          setImageOffsetXBase(sel.offsetX ?? 0);
          setImageOffsetYBase(sel.offsetY ?? 0);
          setImageRotationBase(sel.rotation ?? 0);
          setImageOpacityBase(sel.opacity ?? 1);
          setFilterEffect(sel.filterEffect ?? "none");
          setLayerBlendModeBase(sel.blendMode ?? "source-over");
        }
        imageAutoAppliedRef.current = false;
      } else {
        // One-time migration: honor the old "layer order" preference once
        let legacyBelow = false;
        try {
          legacyBelow = window.localStorage.getItem("am.capture.layerOrder") === "below";
          window.localStorage.removeItem("am.capture.layerOrder");
        } catch {
          /* ignore */
        }

        const defaultAsset = assets.find((a) => a.isDefault);
        if (defaultAsset) {
          const layer = createImageLayer(defaultAsset.dataUrl, defaultAsset.name, defaultAsset.id);
          layer.clipToLand = !legacyBelow;
          imageAutoAppliedRef.current = true;
          setLayers(normalizeStack([createCountryLayer(), layer]));
          setSelectedLayerId(layer.id);
          setFillType("image");
          setImageSource("library");
        }
      }

      setStackReady(true);
    })();

    // Imports / user actions wait on this before touching the stack
    stackReadyPromiseRef.current = ready.catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Persist the layer stack to IndexedDB (debounced — drags write every frame)
  useEffect(() => {
    if (!isOpen || !stackReady) return;
    const t = window.setTimeout(() => {
      void saveLayerStack({ layers, selectedLayerId, fillColor, fillOpacity }).catch(() => {
        setLibraryError(
          "⚠️ Couldn't save the layer stack to this device (storage full?) — layout kept for this session only"
        );
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [layers, selectedLayerId, fillColor, fillOpacity, isOpen, stackReady]);

  // Persist library changes to IndexedDB (one atomic put per change)
  useEffect(() => {
    if (!isOpen || !libraryLoaded || !libraryDirtyRef.current) return;
    libraryDirtyRef.current = false;
    void persistLibrary(imageAssets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageAssets, libraryLoaded, isOpen]);

  // Persist the whole library (one atomic IndexedDB put)
  const persistLibrary = async (assets: ImageAsset[]) => {
    try {
      await saveImageAssets(assets);
      setLibraryError(null);
    } catch {
      setLibraryError(
        "⚠️ Couldn't save the library to this device (storage full?) — images kept for this session only"
      );
    }
  };

  // ── Layer stack operations (CapCut-style editor) ──

  // Derived: the layer under the cursor and its image (selection = "current image")
  const selectedLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) ?? null,
    [layers, selectedLayerId]
  );
  const selectedImageLayer = selectedLayer?.kind === "image" ? selectedLayer : null;
  const hasImageLayer = layers.some((l) => l.kind === "image");
  const imageLayerCount = layers.filter((l) => l.kind === "image").length;

  // Derived replacements for the old single-image state
  const uploadedImageSrc = selectedImageLayer?.src ?? null;
  const uploadedImageName = selectedImageLayer?.name ?? null;

  /** Hydrate the transform buffer from a layer (or reset to defaults) */
  const hydrateBufferFromLayer = useCallback((layer: StudioLayer | null | undefined) => {
    if (layer && layer.kind === "image") {
      setImageFitModeBase(layer.fitMode ?? "cover");
      setImageScaleBase(layer.scale ?? 1);
      setImageOffsetXBase(layer.offsetX ?? 0);
      setImageOffsetYBase(layer.offsetY ?? 0);
      setImageRotationBase(layer.rotation ?? 0);
      setImageOpacityBase(layer.opacity ?? 1);
      setFilterEffect(layer.filterEffect ?? "none");
      setLayerBlendModeBase(layer.blendMode ?? "source-over");
    } else {
      setImageFitModeBase("cover");
      setImageScaleBase(1.0);
      setImageOffsetXBase(0);
      setImageOffsetYBase(0);
      setImageRotationBase(0);
      setImageOpacityBase(1.0);
      setFilterEffect("none");
      setLayerBlendModeBase("source-over");
    }
  }, []);

  /** Select a layer (by object or id) + hydrate the transform buffer */
  const selectLayer = useCallback(
    (layer: StudioLayer | string | null) => {
      const id = typeof layer === "string" || layer === null ? layer : layer.id;
      setSelectedLayerId(id);
      const found =
        layer && typeof layer === "object"
          ? layer
          : layersRef.current.find((l) => l.id === id) ?? null;
      hydrateBufferFromLayer(found);
    },
    [hydrateBufferFromLayer]
  );

  const removeLayer = useCallback((id: string) => {
    const prev = layersRef.current;
    const target = prev.find((l) => l.id === id);
    if (!target || target.kind === "country") return; // the country layer is not deletable
    const remaining = prev.filter((l) => l.id !== id);
    const images = remaining.filter((l) => l.kind === "image");
    setLayers(normalizeStack(remaining));
    if (selectedLayerIdRef.current === id) {
      // Fall back to the front-most remaining image, or the country layer
      selectLayer(images.length > 0 ? images[images.length - 1] : COUNTRY_LAYER_ID);
    }
  }, [selectLayer]);

  const moveLayer = useCallback((id: string, dir: -1 | 1) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(nextIdx, 0, item);
      return next;
    });
  }, []);

  const toggleLayerVisible = useCallback((id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }, []);

  const toggleLayerClip = useCallback((id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id && l.kind === "image" ? { ...l, clipToLand: !l.clipToLand } : l))
    );
  }, []);

  /** Write-through setters: edit the buffer AND the selected image layer in one step */
  type LayerFieldValue<K extends "fitMode" | "scale" | "offsetX" | "offsetY" | "rotation" | "opacity"> =
    Exclude<StudioLayer[K], undefined>;
  const makeFieldSetter = useCallback(
    <K extends "fitMode" | "scale" | "offsetX" | "offsetY" | "rotation" | "opacity">(key: K) =>
      (value: LayerFieldValue<K> | ((prev: LayerFieldValue<K>) => LayerFieldValue<K>)) => {
        setLayers((prev) =>
          prev.map((l) => {
            if (l.id !== selectedLayerIdRef.current || l.kind !== "image") return l;
            const current = (
              l[key] ?? (key === "fitMode" ? "cover" : key === "scale" || key === "opacity" ? 1 : 0)
            ) as LayerFieldValue<K>;
            const next =
              typeof value === "function"
                ? (value as (p: LayerFieldValue<K>) => LayerFieldValue<K>)(current)
                : value;
            return { ...l, [key]: next };
          })
        );
      },
    []
  );
  const setImageFitMode = useCallback(makeFieldSetter("fitMode"), [makeFieldSetter]);
  const setImageScale = useCallback(makeFieldSetter("scale"), [makeFieldSetter]);
  const setImageOffsetX = useCallback(makeFieldSetter("offsetX"), [makeFieldSetter]);
  const setImageOffsetY = useCallback(makeFieldSetter("offsetY"), [makeFieldSetter]);
  const setImageRotation = useCallback(makeFieldSetter("rotation"), [makeFieldSetter]);
  const setImageOpacity = useCallback(makeFieldSetter("opacity"), [makeFieldSetter]);

  /** Filter effect: buffer + selected image layer */
  const applyFilterEffect = useCallback((effect: ImageFilterEffect) => {
    setFilterEffect(effect);
    setLayers((prev) =>
      prev.map((l) =>
        l.id === selectedLayerIdRef.current && l.kind === "image" ? { ...l, filterEffect: effect } : l
      )
    );
  }, []);

  /** Blend mode: buffer + selected image layer */
  const applyLayerBlendMode = useCallback((mode: GlobalCompositeOperation) => {
    setLayerBlendModeBase(mode);
    setLayers((prev) =>
      prev.map((l) =>
        l.id === selectedLayerIdRef.current && l.kind === "image" ? { ...l, blendMode: mode } : l
      )
    );
  }, []);

  /** Blend mode of the COUNTRY layer (no buffer — the layer IS the source of truth) */
  const setCountryBlendMode = useCallback((mode: GlobalCompositeOperation) => {
    setLayers((prev) =>
      prev.map((l) => (l.kind === "country" ? { ...l, blendMode: mode } : l))
    );
  }, []);

  // Import one or many image files into the persisted library —
  // each one becomes a NEW image layer on top of the stack (multi-image, CapCut-style).
  const importFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f && f.type.startsWith("image/"));
    if (list.length === 0) return;

    // Never race the on-open stack restore
    if (stackReadyPromiseRef.current) {
      await stackReadyPromiseRef.current;
    }

    setImportingAssets(true);
    try {
      const created = await Promise.all(list.map((file) => createAssetFromFile(file)));
      const valid = created.filter((a): a is ImageAsset => a !== null);
      if (valid.length === 0) return;

      libraryDirtyRef.current = true;
      setImageAssets((prev) => [...valid, ...prev]);

      imageAutoAppliedRef.current = false;
      const newLayers = valid.map((a) => createImageLayer(a.dataUrl, a.name, a.id));
      setFillType("image");
      setImageSource("library");
      setSelectedWikiFlagId(null);
      setLayers((prev) => normalizeStack([...prev, ...newLayers]));
      selectLayer(newLayers[0]);
    } finally {
      setImportingAssets(false);
    }
  };

  // Mark one asset as THE default (tap again to unmark). Defaults auto-load on open.
  const handleToggleAssetDefault = (id: string) => {
    const target = imageAssets.find((a) => a.id === id);
    const makeDefault = !(target?.isDefault ?? false);
    libraryDirtyRef.current = true;
    setImageAssets((prev) =>
      prev.map((a) => ({ ...a, isDefault: makeDefault ? a.id === id : false }))
    );
  };

  const handleRemoveAsset = (id: string) => {
    libraryDirtyRef.current = true;
    setImageAssets((prev) => prev.filter((a) => a.id !== id));
  };

  // Add a library asset as a NEW image layer on top of the stack
  const handleUseAsset = (asset: ImageAsset) => {
    imageAutoAppliedRef.current = false;
    const newLayer = createImageLayer(asset.dataUrl, asset.name, asset.id);
    setFillType("image");
    setImageSource("library");
    setSelectedWikiFlagId(null);
    setLayers((prev) => normalizeStack([...prev, newLayer]));
    selectLayer(newLayer);
  };

  // Canvas Pan & Drag State
  const [isPanningCanvas, setIsPanningCanvas] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; initialOffsetX: number; initialOffsetY: number } | null>(null);
  const touchDistanceRef = useRef<number | null>(null);

  // Automatic Wikimedia Flag Search on Country Open (search only — the
  // auto-ADD decision happens after the layer stack is restored)
  useEffect(() => {
    if (!isOpen || !countryName) return;

    setWikiLoading(true);
    setWikiSearchQuery(countryName);
    setSelectedWikiFlagId(null);
    wikiAutoAddedRef.current = false;

    searchWikimediaFlags(countryName)
      .then((flags) => {
        setWikiFlags(flags);
        setWikiLoading(false);
      })
      .catch(() => {
        setWikiLoading(false);
      });
  }, [isOpen, countryName]);

  // Wiki auto-pick: add the top flag as the (first) image layer — but ONLY
  // once the stack is restored AND the stack still has no image layer at all
  // (a saved stack or a default/defaulted import always wins over auto-pick).
  useEffect(() => {
    if (!isOpen || !stackReady || !countryName || wikiAutoAddedRef.current) return;
    if (initialImageFile) return;
    if (layersRef.current.some((l) => l.kind === "image")) return;
    const topFlag = wikiFlags[0];
    if (!topFlag) return;

    let cancelled = false;
    (async () => {
      const blobUrl = await fetchImageAsBlobUrl(topFlag.thumbUrl || topFlag.originalUrl);
      if (cancelled) return;
      // Blob URLs die on reload — convert to a data URL so the layer persists
      const dataUrl = (await imageSrcToDataUrl(blobUrl)) || blobUrl;
      if (cancelled) return;
      // Double-check: a user action may have added an image layer meanwhile
      if (layersRef.current.some((l) => l.kind === "image")) return;

      const layer = createImageLayer(dataUrl, topFlag.cleanTitle);
      wikiAutoAddedRef.current = true;
      imageAutoAppliedRef.current = true;
      setLayers((prev) => normalizeStack([...prev, layer]));
      selectLayer(layer);
      setSelectedWikiFlagId(topFlag.id);
      setFillType("image");
      setImageSource("wiki");
    })().catch(() => {
      /* network hiccup — the gallery remains available for a manual pick */
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, stackReady, countryName, wikiFlags, initialImageFile, selectLayer]);

  // Load initial file if provided (imported straight into the persisted library)
  useEffect(() => {
    if (initialImageFile && isOpen) {
      void importFiles([initialImageFile]);
    }
  }, [initialImageFile, isOpen]);

  // Sync default color when country changes (country layer fill follows the region)
  useEffect(() => {
    if (countryName) {
      setFillColor(getColorForName(countryName));
    }
  }, [countryName]);

  // Decode every layer image src into a reusable element (cached by src)
  useEffect(() => {
    const seen = layerImagesRef.current;
    for (const layer of layers) {
      if (layer.kind !== "image" || !layer.src) continue;
      if (seen[layer.src]) continue;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setLayerImages((prev) => (prev[layer.src!] ? prev : { ...prev, [layer.src!]: img }));
      };
      img.src = layer.src;
    }
  }, [layers]);

  // Extract geometries strictly for the active country/region
  const polygons = useMemo(() => {
    if (!activeCountry || !geoJsonData) return [];
    return getCountryGeometries(geoJsonData, activeCountry, selectedFeature);
  }, [activeCountry, geoJsonData, selectedFeature]);

  // Sovereign / ruling power recorded in the exported XML metadata
  const activeSovereign = useMemo(() => {
    if (!selectedFeature || activeCountry !== countryName) return null;
    const props = (selectedFeature as { properties?: Record<string, unknown> | null })?.properties;
    return getFeatureSovereign(props ?? null);
  }, [selectedFeature, activeCountry, countryName]);

  // Render to canvas whenever options change
  useEffect(() => {
    if (!isOpen || !canvasRef.current || polygons.length === 0 || !activeCountry) return;

    const res = RESOLUTION_OPTIONS[resolutionIndex];

    // Build the BOTTOM → TOP render stack from the layer editor state.
    // In "Solid Color Only" mode the stack is ignored (plain territory fill).
    let renderLayers: RenderLayer[] | undefined;
    if (fillType === "image") {
      renderLayers = [];
      for (const layer of layers) {
        if (layer.kind === "country") {
          renderLayers.push({
            kind: "country",
            fillColor,
            fillOpacity: layer.visible ? fillOpacity : 0,
            blendMode: layer.blendMode ?? "source-over",
          });
          continue;
        }
        if (!layer.visible) continue;
        const el = layer.src ? layerImages[layer.src] : null;
        if (!el || !el.complete || el.naturalWidth <= 0) continue;
        renderLayers.push({
          kind: "image",
          image: el,
          fitMode: layer.fitMode ?? "cover",
          scale: layer.scale ?? 1,
          offsetX: layer.offsetX ?? 0,
          offsetY: layer.offsetY ?? 0,
          rotation: layer.rotation ?? 0,
          opacity: layer.opacity ?? 1,
          filterEffect: layer.filterEffect ?? "none",
          blendMode: layer.blendMode ?? "source-over",
          clipToLand: layer.clipToLand ?? true,
          // Atmosphere tint applies to MASKED layers (inside the territory clip)
          tint:
            tintEnabled && (layer.clipToLand ?? true)
              ? { color: tintColor, opacity: tintOpacity, blend: tintBlendMode }
              : null,
        });
      }
    }

    renderCountryToCanvas(canvasRef.current, polygons, {
      width: res.width,
      height: res.height,
      paddingRatio: 0.12,
      fillColor,
      fillOpacity,
      borderColor,
      borderWidth,
      backgroundColor: backgroundColor === "custom" ? customBgColor : backgroundColor,
      showTitle,
      countryName: activeCountry,
      yearLabel,
      projection,
      imageFill: null,
      layers: renderLayers,
      symbols: symbols.filter((s) => s.type !== "none"),
    });
  }, [
    isOpen,
    polygons,
    activeCountry,
    yearLabel,
    fillType,
    layers,
    layerImages,
    fillColor,
    fillOpacity,
    tintEnabled,
    tintColor,
    tintOpacity,
    tintBlendMode,
    projection,
    borderColor,
    borderWidth,
    backgroundColor,
    customBgColor,
    resolutionIndex,
    showTitle,
    symbols,
  ]);

  // Handle User Selecting a Wikimedia Flag —
  // replaces the selected image layer in place, or adds a new top layer
  const handleSelectWikiFlag = async (flag: WikiFlagResult) => {
    if (stackReadyPromiseRef.current) {
      await stackReadyPromiseRef.current;
    }
    imageAutoAppliedRef.current = false;
    setSelectedWikiFlagId(flag.id);
    setFillType("image");
    setImageSource("wiki");
    const blobUrl = await fetchImageAsBlobUrl(flag.thumbUrl || flag.originalUrl);
    // Blob URLs die on reload — convert to a data URL so the layer persists
    const dataUrl = (await imageSrcToDataUrl(blobUrl)) || blobUrl;

    const current = layersRef.current.find((l) => l.id === selectedLayerIdRef.current);
    if (current && current.kind === "image") {
      setLayers((prev) =>
        prev.map((l) =>
          l.id === current.id
            ? {
                ...l,
                src: dataUrl,
                name: flag.cleanTitle,
                assetId: undefined,
                scale: 1,
                offsetX: 0,
                offsetY: 0,
                rotation: 0,
              }
            : l
        )
      );
      setImageScaleBase(1.0);
      setImageOffsetXBase(0);
      setImageOffsetYBase(0);
      setImageRotationBase(0);
    } else {
      const newLayer = createImageLayer(dataUrl, flag.cleanTitle);
      setLayers((prev) => normalizeStack([...prev, newLayer]));
      selectLayer(newLayer);
    }
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

  // File Upload Handlers — everything goes through the persisted library
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    void importFiles([file]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void importFiles(files);
    }
    // Allow re-selecting the same file(s) immediately after
    e.target.value = "";
  };

  // Drag & Drop Handlers on Modal (drop many images at once → all imported)
  const handleModalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingModalFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void importFiles(Array.from(e.dataTransfer.files));
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
    if (stackReadyPromiseRef.current) {
      void stackReadyPromiseRef.current.then(() => applyPresetTexture(preset));
      return;
    }
    applyPresetTexture(preset);
  };

  // Shared: a texture replaces the selected image layer, else becomes a new top layer
  const applyPresetTexture = (preset: TexturePreset) => {
    imageAutoAppliedRef.current = false;
    setFillType("image");
    setImageSource("texture");
    setSelectedWikiFlagId(null);

    const current = layersRef.current.find((l) => l.id === selectedLayerIdRef.current);
    if (current && current.kind === "image") {
      setLayers((prev) =>
        prev.map((l) =>
          l.id === current.id
            ? {
                ...l,
                src: preset.dataUrl,
                name: preset.name,
                assetId: undefined,
                scale: 1,
                offsetX: 0,
                offsetY: 0,
                rotation: 0,
              }
            : l
        )
      );
      setImageScaleBase(1.0);
      setImageOffsetXBase(0);
      setImageOffsetYBase(0);
      setImageRotationBase(0);
    } else {
      const newLayer = createImageLayer(preset.dataUrl, preset.name);
      setLayers((prev) => normalizeStack([...prev, newLayer]));
      selectLayer(newLayer);
    }
  };

  const handleRemoveImage = () => {
    const sel = selectedLayerIdRef.current;
    if (!sel) return;
    removeLayer(sel);
    setSelectedWikiFlagId(null);
  };

  const handleResetImageTransforms = useCallback(() => {
    setImageScaleBase(1.0);
    setImageOffsetXBase(0);
    setImageOffsetYBase(0);
    setImageRotationBase(0);
    setImageOpacityBase(1.0);
    setLayers((prev) =>
      prev.map((l) =>
        l.id === selectedLayerIdRef.current && l.kind === "image"
          ? { ...l, scale: 1, offsetX: 0, offsetY: 0, rotation: 0, opacity: 1 }
          : l
      )
    );
  }, []);

  // Quick Aesthetic Presets — sets the country layer fill + atmosphere tint,
  // and applies the matching filter to EVERY image layer (consistent stack look)
  const handleApplyAestheticPreset = (presetType: "antique" | "royal" | "marble" | "vibrant") => {
    let presetFilter: ImageFilterEffect | null = null;
    switch (presetType) {
      case "antique":
        setFillColor("#D4AF37");
        setTintEnabled(true);
        setTintColor("#D4AF37");
        setTintOpacity(0.3);
        setTintBlendMode("soft-light");
        presetFilter = "sepia";
        break;
      case "royal":
        setFillColor(defaultFillColor);
        setTintEnabled(false);
        presetFilter = "none";
        break;
      case "marble":
        setFillColor("#E2E8F0");
        setTintEnabled(true);
        setTintColor("#FFFFFF");
        setTintOpacity(0.25);
        setTintBlendMode("soft-light");
        presetFilter = "grayscale";
        break;
      case "vibrant":
        setFillColor(defaultFillColor);
        setTintEnabled(true);
        setTintColor(defaultFillColor);
        setTintOpacity(0.35);
        setTintBlendMode("overlay");
        presetFilter = "none";
        break;
    }
    if (presetFilter) {
      setFilterEffect(presetFilter);
      setLayers((prev) =>
        prev.map((l) => (l.kind === "image" ? { ...l, filterEffect: presetFilter } : l))
      );
    }
  };

  // Interactive Canvas Pan & Zoom Handlers (operate on the selected image layer)
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (fillType !== "image" || !selectedImageLayer) return;
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
    if (fillType !== "image" || !selectedImageLayer) return;
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 0.08 : -0.08;
    setImageScale((prev) => Math.round(Math.max(0.2, Math.min(4.0, prev + zoomDelta)) * 100) / 100);
  };

  // Touch Support
  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (fillType !== "image" || !selectedImageLayer) return;
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
    if (fillType !== "image" || !selectedImageLayer || !canvasContainerRef.current) return;
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

  // Build the vector XML document for the active shape, using the exact same
  // projection + fit math as the canvas preview, then download it.
  const handleDownloadXml = async () => {
    if (!activeCountry || polygons.length === 0) {
      setXmlStatus("No land geometry available for this region");
      return;
    }

    setIsDownloadingXml(true);
    setXmlStatus(null);

    try {
      const res = RESOLUTION_OPTIONS[resolutionIndex];

      // Multi-layer stack, BOTTOM → TOP: every visible image layer + the country.
      let embedLayers: XmlRenderLayer[] | undefined;
      let skippedEmbeds = 0;

      if (xmlFormat === "svg" && xmlEmbedFlag && fillType === "image" && hasImageLayer) {
        embedLayers = [];
        for (const layer of layers) {
          if (layer.kind === "country") {
            embedLayers.push({ kind: "country", blendMode: layer.blendMode });
            continue;
          }
          if (!layer.visible || !layer.src) continue;
          const dataUrl = layer.src.startsWith("data:")
            ? layer.src
            : await imageSrcToDataUrl(layer.src);
          if (!dataUrl) {
            skippedEmbeds += 1;
            continue;
          }
          embedLayers.push({
            kind: "image",
            dataUrl,
            naturalWidth: layerImages[layer.src]?.naturalWidth || 600,
            naturalHeight: layerImages[layer.src]?.naturalHeight || 400,
            fitMode: layer.fitMode ?? "cover",
            scale: layer.scale ?? 1,
            offsetX: layer.offsetX ?? 0,
            offsetY: layer.offsetY ?? 0,
            rotation: layer.rotation ?? 0,
            opacity: layer.opacity ?? 1,
            filterEffect: layer.filterEffect,
            blendMode: layer.blendMode,
            clipToLand: layer.clipToLand ?? true,
            tint:
              tintEnabled && (layer.clipToLand ?? true)
                ? { color: tintColor, opacity: tintOpacity, blend: tintBlendMode }
                : null,
          });
        }
        // The country layer is always part of the vector stack (fill may be 0%)
        if (!embedLayers.some((l) => l.kind === "country")) {
          embedLayers.push({ kind: "country" });
        }
      }

      const built = buildXmlDocument({
        format: xmlFormat,
        countryName: activeCountry,
        sovereign: activeSovereign,
        yearLabel,
        year: yearFromLabel(yearLabel),
        polygons,
        projection,
        width: res.width,
        height: res.height,
        paddingRatio: 0.12,
        showTitle,
        fillColor,
        fillOpacity,
        borderColor,
        borderWidth,
        backgroundColor: backgroundColor === "custom" ? customBgColor : backgroundColor,
        includeIntroKeyframes: xmlIntroKeyframes,
        image: null,
        layers: embedLayers,
        symbols: symbols.filter((s) => s.type !== "none").map((s) => s.type),
      });

      if (!built) {
        setXmlStatus("Could not project this region's geometry — try another projection");
        setIsDownloadingXml(false);
        return;
      }

      downloadBlob(new Blob([built.xml], { type: built.mimeType }), built.filename);
      setXmlStatus(
        `${
          skippedEmbeds > 0
            ? `⚠️ ${skippedEmbeds} image layer(s) could not be embedded (cross-origin) — `
            : ""
        }Saved ${built.filename} · ${formatBytes(
          built.bytes
        )} · ${built.stats.points} vertices in ${built.stats.parts} polygon part${
          built.stats.parts !== 1 ? "s" : ""
        }`
      );
      window.setTimeout(() => setXmlStatus(null), 9000);
    } catch {
      setXmlStatus("XML export failed for this region");
    } finally {
      setIsDownloadingXml(false);
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
      {/* Global multi-image picker — shared by the Layers "＋ Add" button and the Upload tab */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Full Modal Drag & Drop Glowing Overlay */}
      {isDraggingModalFile && (
        <div className="absolute inset-0 z-[2500] m-4 sm:m-8 rounded-3xl border-4 border-dashed border-amber-400 bg-amber-950/80 backdrop-blur-xl flex flex-col items-center justify-center gap-3 p-6 text-center shadow-2xl animate-pulse pointer-events-none">
          <span className="text-6xl animate-bounce">📥</span>
          <h3 className="text-2xl font-black text-amber-300">
            Drop Image(s) to Fill {countryName}!
          </h3>
          <p className="text-sm font-semibold text-gray-200">
            Release to add to your Library & mask into the land boundaries of {countryName} ({yearLabel})
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
                  Capture Studio
                  <span className="ml-1.5 text-[10px] font-mono font-bold text-amber-400/90 align-middle">PNG · VECTOR XML</span>
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
                fillType === "image" && selectedImageLayer
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
              {fillType === "image" && selectedImageLayer && (
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-gray-900/90 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-lg text-[10px] text-gray-300 shadow-md">
                  <span>🖐️</span>
                  <span>Drag to pan · Scroll to zoom</span>
                </div>
              )}

              {/* Selected layer chip (front of the stack = what you're editing) */}
              {fillType === "image" && selectedImageLayer && (
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-gray-900/90 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-lg text-[10px] text-gray-300 shadow-md max-w-[60%]">
                  <span>🎯</span>
                  <span className="truncate font-semibold text-amber-300">{selectedImageLayer.name}</span>
                  <span className="text-gray-500">editing</span>
                </div>
              )}

              {/* Quick Reset Button in Preview */}
              {fillType === "image" && selectedImageLayer && (imageOffsetX !== 0 || imageOffsetY !== 0 || imageScale !== 1.0) && (
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

            {/* Flag Adjustment Panel (floating, overlays canvas area) — for the SELECTED image layer */}
            {fillType === "image" && selectedImageLayer && (
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
                {/* Sub-Tabs: Wikimedia Flags vs Custom Upload vs Presets vs Library */}
                <div className="flex rounded-lg bg-gray-950 p-1 border border-white/10 gap-1 text-[11px] font-bold">
                  <button
                    onClick={() => setImageSource("wiki")}
                    className={`flex-1 py-1.5 px-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
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
                    className={`flex-1 py-1.5 px-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      imageSource === "upload"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span>📤</span>
                    <span>Upload</span>
                  </button>
                  <button
                    onClick={() => setImageSource("texture")}
                    className={`flex-1 py-1.5 px-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      imageSource === "texture"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span>✨</span>
                    <span>Textures</span>
                  </button>
                  <button
                    onClick={() => setImageSource("library")}
                    className={`flex-1 py-1.5 px-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 relative ${
                      imageSource === "library"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    <span>📚</span>
                    <span>Library</span>
                    {imageAssets.length > 0 && (
                      <span className="absolute -top-1.5 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-amber-400 text-gray-950 text-[9px] font-black flex items-center justify-center shadow">
                        {imageAssets.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* ── LAYER EDITOR (CapCut-style) — frontmost layer first ── */}
                <div className="rounded-2xl bg-gray-950/90 border border-white/10 overflow-hidden shadow-lg">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-white/[0.04]">
                    <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <span>🗂️</span>
                      <span>Layers</span>
                      <span className="text-[9px] font-mono font-normal text-gray-500">
                        {imageLayerCount} image{imageLayerCount !== 1 ? "s" : ""} · 1 country
                      </span>
                    </span>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importingAssets}
                      title="Add image(s) as new layers on top"
                      className="px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 text-[10px] font-black transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                    >
                      ＋ Add
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto custom-scrollbar">
                    {[...layers].reverse().map((layer) => {
                      const idx = layers.findIndex((l) => l.id === layer.id);
                      const isSelected = layer.id === selectedLayerId;
                      const atTop = idx === layers.length - 1;
                      const atBottom = idx === 0;
                      return (
                        <div
                          key={layer.id}
                          onClick={() => selectLayer(layer)}
                          className={`flex items-center gap-1.5 px-2 py-1.5 border-l-2 cursor-pointer transition-all ${
                            isSelected
                              ? "border-amber-400 bg-amber-400/15"
                              : "border-transparent hover:bg-white/5"
                          } ${layer.visible ? "" : "opacity-45"}`}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLayerVisible(layer.id);
                            }}
                            title={layer.visible ? "Hide layer" : "Show layer"}
                            className="w-5 shrink-0 text-[11px] leading-none cursor-pointer"
                          >
                            {layer.visible ? "👁" : "🚫"}
                          </button>

                          <div className="w-8 h-8 rounded-md overflow-hidden border border-white/15 bg-gray-900 shrink-0 flex items-center justify-center">
                            {layer.kind === "image" && layer.src ? (
                              <img
                                src={layer.src}
                                alt={layer.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span
                                className="text-[10px] px-0.5"
                                style={{ backgroundColor: fillColor }}
                              >
                                🏔
                              </span>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-[11px] font-bold truncate leading-tight ${
                                isSelected ? "text-amber-200" : "text-gray-200"
                              }`}
                            >
                              {layer.kind === "country"
                                ? `🏔 ${activeCountry || "Country"}`
                                : layer.name}
                            </p>
                            <p className="text-[9px] text-gray-500 leading-tight truncate flex items-center gap-1">
                              {layer.blendMode && layer.blendMode !== "source-over" && (
                                <span
                                  title={`Blend mode: ${blendLabel(layer.blendMode)}`}
                                  className="shrink-0 px-1 rounded bg-purple-400/20 text-purple-300 font-bold text-[8px] leading-tight"
                                >
                                  {blendLabel(layer.blendMode)}
                                </span>
                              )}
                              <span className="truncate">
                                {layer.kind === "country"
                                  ? "Territory · border always on top"
                                  : layer.clipToLand
                                    ? "✂️ Masked to territory"
                                    : "Full layer (no mask)"}
                              </span>
                            </p>
                          </div>

                          {layer.kind === "image" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLayerClip(layer.id);
                              }}
                              title={
                                layer.clipToLand
                                  ? "Mask ON — turn OFF for a full, unclipped image layer"
                                  : "Mask OFF — turn ON to clip this layer to the territory"
                              }
                              className={`shrink-0 px-1 h-5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                                layer.clipToLand
                                  ? "bg-amber-400/25 text-amber-300"
                                  : "bg-white/10 text-gray-500 hover:text-gray-300"
                              }`}
                            >
                              ✂️
                            </button>
                          )}

                          <div className="flex flex-col shrink-0 -my-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveLayer(layer.id, 1);
                              }}
                              disabled={atTop}
                              title="Bring forward (closer to viewer)"
                              className="text-[8px] leading-[7px] text-gray-500 hover:text-amber-300 disabled:opacity-30 cursor-pointer disabled:cursor-default px-0.5"
                            >
                              ▲
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveLayer(layer.id, -1);
                              }}
                              disabled={atBottom}
                              title="Send backward (further from viewer)"
                              className="text-[8px] leading-[7px] text-gray-500 hover:text-amber-300 disabled:opacity-30 cursor-pointer disabled:cursor-default px-0.5"
                            >
                              ▼
                            </button>
                          </div>

                          {layer.kind === "image" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeLayer(layer.id);
                              }}
                              title="Delete layer"
                              className="shrink-0 w-5 h-5 rounded-md text-[10px] text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                            >
                              ✕
                            </button>
                          ) : (
                            <span className="w-5 shrink-0" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Inline expansion — properties of the selected COUNTRY layer */}
                  {selectedLayer?.kind === "country" && (
                    <div className="px-3 py-2.5 border-t border-white/10 bg-amber-400/[0.04] flex flex-col gap-1.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                          🏔 Country Fill
                        </span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={fillColor}
                            onChange={(e) => setFillColor(e.target.value)}
                            className="w-5 h-5 rounded cursor-pointer border border-white/20 bg-transparent"
                          />
                          <span className="font-mono text-[10px] text-gray-400 uppercase">{fillColor}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>Fill Opacity (0% = images show everywhere)</span>
                        <span className="font-mono text-amber-300">{Math.round(fillOpacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={fillOpacity}
                        onChange={(e) => setFillOpacity(parseFloat(e.target.value))}
                        className="w-full accent-amber-500 cursor-pointer h-1.5 bg-gray-700 rounded-lg"
                      />

                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>Blend Mode (vs layers beneath)</span>
                        <select
                          value={selectedLayer?.blendMode ?? "source-over"}
                          onChange={(e) => setCountryBlendMode(e.target.value as GlobalCompositeOperation)}
                          className="rounded-lg bg-gray-800 border border-white/15 py-0.5 px-1.5 text-[10px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                        >
                          {BLEND_MODE_OPTIONS.map((b) => (
                            <option key={b.mode} value={b.mode}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <p className="text-[9px] text-gray-500 leading-snug">
                        💡 Drag the 🏔 row ▲▼ to paint the territory OVER or UNDER your images.
                        The border outline always draws on top, so the outline stays crisp.
                      </p>
                    </div>
                  )}
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

                {/* TAB 2: Upload Custom Images — every import becomes a NEW LAYER on top */}
                {imageSource === "upload" && (
                  <div className="flex flex-col gap-2">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-white/20 hover:border-amber-400/70 rounded-2xl p-4 text-center cursor-pointer transition-all bg-white/[0.02] hover:bg-amber-500/[0.04] text-gray-300 flex flex-col items-center justify-center gap-1.5 group"
                    >
                      <span className="text-3xl group-hover:scale-110 transition-transform">📤</span>
                      <p className="text-xs font-bold text-gray-200 group-hover:text-amber-300">
                        Click to Add Image(s) as Layers or Drag & Drop
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Add as many as you want — each one becomes its own layer in the stack above
                        · saved to your Library · <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[9px]">Ctrl+V</kbd> pastes too
                      </p>
                    </div>

                    {/* The currently selected image layer (from any source) */}
                    {uploadedImageSrc && (
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
                            <p className="text-[10px] text-amber-400">
                              {selectedImageLayer?.clipToLand
                                ? "✂️ Masked to territory layer"
                                : "Full layer (no mask)"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Add more image layers"
                            className="px-2 py-1 text-[11px] rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 font-medium transition-colors cursor-pointer"
                          >
                            ＋ More
                          </button>
                          <button
                            onClick={handleRemoveImage}
                            title="Delete this layer"
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

                {/* TAB 4: Image Library — persisted across reloads, import many at once */}
                {imageSource === "library" && (
                  <div className="flex flex-col gap-2.5 bg-white/[0.02] p-3 rounded-2xl border border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <span>📚</span>
                        <span>Image Library</span>
                        <span className="text-[10px] font-mono font-normal text-gray-500">
                          ({imageAssets.length})
                        </span>
                      </label>
                      <button
                        onClick={() => libraryInputRef.current?.click()}
                        disabled={importingAssets}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold text-[11px] shadow transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait shrink-0"
                      >
                        {importingAssets ? "Importing…" : "➕ Import Images"}
                      </button>
                    </div>

                    <input
                      ref={libraryInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileInputChange}
                      className="hidden"
                    />

                    <p className="text-[10px] text-gray-400 leading-snug">
                      Import as many images as you want — they're saved on this device, so they're
                      still here when you reload or join back. Tap ⭐ to mark a <b>default</b>: it
                      auto-loads whenever the Capture Studio opens.
                    </p>

                    {libraryError && (
                      <p className="text-[10px] text-amber-400 leading-snug">{libraryError}</p>
                    )}

                    {!libraryLoaded ? (
                      <div className="py-5 text-center text-xs text-gray-400 flex flex-col items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                        <span>Loading your library…</span>
                      </div>
                    ) : imageAssets.length === 0 ? (
                      <div className="py-5 text-center text-xs text-gray-400">
                        <p className="text-2xl mb-1.5">🗃️</p>
                        <p>No saved images yet.</p>
                        <p className="text-[10px] text-gray-500 mt-1">
                          Import images above (or drag & drop onto this window) — they'll stay here
                          forever on this device.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                        {imageAssets.map((asset) => {
                          const isActive = uploadedImageSrc === asset.dataUrl;
                          return (
                            <div
                              key={asset.id}
                              className={`relative rounded-xl p-1.5 flex flex-col items-center gap-1 border transition-all ${
                                isActive
                                  ? "bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/40 shadow-lg"
                                  : "bg-gray-800/80 border-white/10 hover:border-amber-400/50"
                              }`}
                            >
                              <button
                                onClick={() => handleUseAsset(asset)}
                                title={`Use "${asset.name}" as the active image`}
                                className="w-full h-14 rounded-lg bg-gray-950/80 flex items-center justify-center overflow-hidden border border-white/10 cursor-pointer"
                              >
                                <img
                                  src={asset.dataUrl}
                                  alt={asset.name}
                                  loading="lazy"
                                  className="max-h-full max-w-full object-contain"
                                />
                              </button>

                              <p
                                className={`text-[9px] font-semibold line-clamp-1 w-full text-center leading-tight ${
                                  isActive ? "text-amber-200" : "text-gray-300"
                                }`}
                              >
                                {asset.isDefault ? "★ " : ""}
                                {asset.name}
                              </p>

                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleToggleAssetDefault(asset.id)}
                                  title={asset.isDefault ? "Unmark as default" : "Set as default (auto-loads on open)"}
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                                    asset.isDefault
                                      ? "bg-amber-400/30 text-amber-300"
                                      : "bg-white/10 text-gray-400 hover:text-amber-300"
                                  }`}
                                >
                                  {asset.isDefault ? "★ Default" : "☆"}
                                </button>
                                <button
                                  onClick={() => handleUseAsset(asset)}
                                  title="Use this image"
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold transition-colors cursor-pointer ${
                                    isActive
                                      ? "bg-amber-400 text-gray-950"
                                      : "bg-white/10 text-gray-300 hover:bg-amber-500/30"
                                  }`}
                                >
                                  {isActive ? "✓" : "Use"}
                                </button>
                                <button
                                  onClick={() => handleRemoveAsset(asset.id)}
                                  title="Remove from library"
                                  className="px-1.5 py-0.5 rounded-md text-[10px] bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 🌟 ATMOSPHERE & TINT (applies to every MASKED image layer) */}
                {hasImageLayer && (
                  <div className="bg-white/[0.03] p-3 rounded-2xl border border-white/10 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                        <span>🎨</span>
                        <span>Atmosphere & Tint</span>
                      </span>
                    </div>

                    <p className="text-[10px] text-gray-400 leading-tight">
                      A subtle wash over every <b>masked</b> image layer (inside the territory clip) —
                      it never replaces the images. Select the 🏔 row in Layers for the territory fill.
                    </p>

                    {/* Quick Aesthetic Styles */}
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                        ⚡ Quick Aesthetic Styles
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

                    {/* Optional Subtle Tint (Never replaces the image) */}
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

                {/* Blend mode + color tone — apply to the SELECTED image layer */}
                {selectedImageLayer && (
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-white/5">
                    <div className="flex items-center justify-between text-[11px] text-gray-300">
                      <span>Blend Mode (vs layers beneath):</span>
                      <select
                        value={layerBlendMode}
                        onChange={(e) => applyLayerBlendMode(e.target.value as GlobalCompositeOperation)}
                        className="rounded-lg bg-gray-800 border border-white/15 py-1 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                      >
                        {BLEND_MODE_OPTIONS.map((b) => (
                          <option key={b.mode} value={b.mode}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-gray-300">
                      <span>Color Tone ({selectedImageLayer.name}):</span>
                      <select
                        value={filterEffect}
                        onChange={(e) => applyFilterEffect(e.target.value as ImageFilterEffect)}
                        className="rounded-lg bg-gray-800 border border-white/15 py-1 px-2 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                      >
                        {FILTER_EFFECTS.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.label}
                          </option>
                        ))}
                      </select>
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
                    hasImage={hasImageLayer}
                  />
                </div>

                {/* SECTION 1C: Vector XML Export (SVG / AM preset / raw geometry) */}
                <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      🧬 Vector XML Export
                    </label>
                    <span className="text-[10px] font-mono text-gray-500">
                      {RESOLUTION_OPTIONS[resolutionIndex].width}×{RESOLUTION_OPTIONS[resolutionIndex].height} · {projection}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(XML_FORMAT_INFO) as XmlExportFormat[]).map((id) => {
                      const info = XML_FORMAT_INFO[id];
                      const active = xmlFormat === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setXmlFormat(id)}
                          title={info.desc}
                          className={`flex flex-col items-center gap-0.5 px-1.5 py-2 rounded-xl border transition-all cursor-pointer ${
                            active
                              ? "bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm"
                              : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10"
                          }`}
                        >
                          <span className="text-sm leading-none">{info.icon}</span>
                          <span className="text-[10px] font-bold leading-tight text-center">{info.label}</span>
                          <span className="text-[9px] font-mono text-gray-500 leading-none">.{info.ext}</span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-gray-400 leading-snug">{XML_FORMAT_INFO[xmlFormat].desc}</p>
                  <p className="text-[10px] text-amber-400/90 leading-snug">
                    💡 {XML_FORMAT_INFO[xmlFormat].bestFor}
                  </p>
                  {xmlFormat === "alight" && (
                    <p className="text-[9px] text-gray-500 leading-snug">
                      Unofficial community-style layout — Alight Motion's own project schema is not public, so
                      treat the path data as the source of truth.
                    </p>
                  )}

                  {xmlFormat === "svg" && fillType === "image" && hasImageLayer && (
                    <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={xmlEmbedFlag}
                        onChange={(e) => setXmlEmbedFlag(e.target.checked)}
                        className="rounded accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Embed image layers inside the SVG (masked layers clipped to the land · bigger file)</span>
                    </label>
                  )}

                  {xmlFormat === "alight" && (
                    <label className="flex items-center gap-2 text-[11px] text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={xmlIntroKeyframes}
                        onChange={(e) => setXmlIntroKeyframes(e.target.checked)}
                        className="rounded accent-amber-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Add scale + fade intro keyframes</span>
                    </label>
                  )}

                  {xmlStatus && (
                    <p className="text-[10px] text-emerald-300 leading-snug break-words animate-fadeIn">{xmlStatus}</p>
                  )}

                  <button
                    onClick={handleDownloadXml}
                    disabled={isDownloadingXml || polygons.length === 0}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-400 hover:to-sky-500 text-gray-950 text-[11px] font-extrabold shadow-lg shadow-cyan-500/20 transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>🧬</span>
                    <span>{isDownloadingXml ? "Building XML…" : `Download ${XML_FORMAT_INFO[xmlFormat].label} as XML`}</span>
                  </button>

                  <button
                    onClick={() => setShowBulkXmlModal(true)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer group text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-gray-200 group-hover:text-emerald-200">
                        🌍 Download ALL XML — every country × every era
                      </p>
                      <p className="text-[9px] text-gray-500">
                        Cache-first ZIP · folder per country · no network requests
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-300 shrink-0">OPEN</span>
                  </button>
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
            ✨ {fillType === "image"
              ? `${imageLayerCount} image layer${imageLayerCount !== 1 ? "s" : ""} + country layer stack`
              : "Transparent PNG land cutout"}{" "}
            · 📚 {imageAssets.length} saved image{imageAssets.length !== 1 ? "s" : ""} ·{" "}
            {XML_FORMAT_INFO[xmlFormat].label} export ready ({polygons.length} polygon
            {polygons.length !== 1 ? "s" : ""})
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
              onClick={handleDownloadXml}
              disabled={isDownloadingXml || polygons.length === 0}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-cyan-400/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>🧬</span>
              <span>{isDownloadingXml ? "Building XML..." : `Download ${XML_FORMAT_INFO[xmlFormat].label} XML`}</span>
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

      <XmlBulkExportModal
        isOpen={showBulkXmlModal}
        onClose={() => setShowBulkXmlModal(false)}
        initialFormat={xmlFormat}
        projection={projection}
        width={RESOLUTION_OPTIONS[resolutionIndex].width}
        height={RESOLUTION_OPTIONS[resolutionIndex].height}
        onOpenCacheManager={() => {
          setShowBulkXmlModal(false);
          onOpenCacheManager?.();
        }}
      />
    </div>
  );
}
