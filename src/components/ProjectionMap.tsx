import { useEffect, useRef, useState, useCallback } from "react";
import { geoPath } from "d3-geo";
import {
  createProjection,
  ProjectionId,
  getGraticule,
  ViewTransform,
  DEFAULT_VIEW,
  PROJECTIONS,
} from "../utils/mapProjections";
import { getColorForName, hexToRgba } from "../utils/colors";
import {
  getFeatureName,
  getFeatureSovereign,
  matchesCountryFilter,
} from "../utils/countryFilter";
import { extractCountryLabelPlacements } from "../utils/polygonLabel";

interface ProjectionMapProps {
  geoJsonData: unknown | null;
  projectionId: ProjectionId;
  showLabels: boolean;
  selectedFeatureName: string | null;
  onlyShowCountry: string | null;
  onFeatureSelect: (feature: unknown | null) => void;
  isDarkBackground: boolean;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 16;
const ZOOM_PRESETS = [1, 2, 4, 8, 16];

// Easing function for smooth transitions
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export default function ProjectionMap({
  geoJsonData,
  projectionId,
  showLabels,
  selectedFeatureName,
  onlyShowCountry,
  onFeatureSelect,
  isDarkBackground,
}: ProjectionMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [didDrag, setDidDrag] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Current view state
  const viewRef = useRef<ViewTransform>({ ...DEFAULT_VIEW });

  // Animation state
  const animRef = useRef<{
    from: ViewTransform;
    to: ViewTransform;
    startTime: number;
    duration: number;
  } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Drag state
  const dragStartRef = useRef<{
    x: number;
    y: number;
    view: ViewTransform;
  } | null>(null);

  // Momentum state
  const velocityRef = useRef<{ x: number; y: number; time: number }>({
    x: 0,
    y: 0,
    time: 0,
  });

  // Touch/pinch state
  const pinchStartRef = useRef<{
    dist: number;
    zoom: number;
    centerX: number;
    centerY: number;
    touchPoint: { x: number; y: number };
  } | null>(null);

  // Control auto-hide timer
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const placementsCacheRef = useRef<ReturnType<typeof extractCountryLabelPlacements>>([]);
  const lastGeoRef = useRef<unknown | null>(null);

  const projectionInfo = PROJECTIONS.find((p) => p.id === projectionId);
  const isGlobe = projectionInfo?.isGlobe ?? false;

  // ============ Container Size Tracking ============
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Reset view when projection changes
  useEffect(() => {
    viewRef.current = { ...DEFAULT_VIEW };
    setZoomLevel(1);
    stopAnimation();
  }, [projectionId]);

  // Cache label placements
  useEffect(() => {
    if (geoJsonData !== lastGeoRef.current) {
      lastGeoRef.current = geoJsonData;
      placementsCacheRef.current = geoJsonData
        ? extractCountryLabelPlacements(geoJsonData)
        : [];
    }
  }, [geoJsonData]);

  // ============ Render ============
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const proj = createProjection(projectionId, size.w, size.h, viewRef.current);
    const path = geoPath(proj, ctx);
    const zoom = viewRef.current.zoom;

    // 1. Ocean/sphere background
    ctx.beginPath();
    path({ type: "Sphere" } as never);
    ctx.fillStyle = isDarkBackground ? "#0f1a2e" : "#dbeafe";
    ctx.fill();
    ctx.strokeStyle = isDarkBackground ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1.5 / Math.sqrt(zoom);
    ctx.stroke();

    // 2. Graticule
    const graticule = getGraticule();
    ctx.beginPath();
    path(graticule as never);
    ctx.strokeStyle = isDarkBackground
      ? `rgba(255,255,255,${Math.min(0.12, 0.04 * zoom)})`
      : `rgba(0,0,50,${Math.min(0.15, 0.05 * zoom)})`;
    ctx.lineWidth = 0.5 / Math.sqrt(zoom);
    ctx.stroke();

    if (!geoJsonData) return;

    const data = geoJsonData as {
      features?: Array<{
        properties?: Record<string, unknown> | null;
        geometry?: GeoJSON.Geometry;
      }>;
    };
    if (!data.features) return;

    // 3. Country polygons
    const borderWeight = Math.max(0.4, 1.2 / Math.sqrt(zoom));
    data.features.forEach((f) => {
      if (!f.geometry) return;
      if (onlyShowCountry && !matchesCountryFilter(f as never, onlyShowCountry)) return;

      const name = getFeatureName(f.properties) || "";
      const sovereign = getFeatureSovereign(f.properties) || name;
      const color = getColorForName(sovereign);
      const isSelected = name === selectedFeatureName;

      ctx.beginPath();
      path(f as never);
      ctx.fillStyle = hexToRgba(color, isSelected ? 0.85 : 0.65);
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#ffffff" : isDarkBackground
        ? "rgba(255,255,255,0.6)"
        : "rgba(15,23,42,0.6)";
      ctx.lineWidth = isSelected ? borderWeight * 2.5 : borderWeight;
      ctx.stroke();
    });

    // 4. Labels
    if (showLabels) {
      const placements = placementsCacheRef.current;

      placements.forEach((p) => {
        if (onlyShowCountry) {
          const target = onlyShowCountry.trim().toLowerCase();
          if (p.name.toLowerCase() !== target && p.sovereign.toLowerCase() !== target) return;
        }

        // Hide small labels when zoomed out
        if (zoom < 1.5 && p.areaSqDeg < 5) return;
        if (zoom < 2.5 && p.areaSqDeg < 1) return;

        const isSelected = p.name === selectedFeatureName;
        const pt = proj([p.centerLng, p.centerLat]);
        if (!pt) return;

        const [x, y] = pt;
        if (x < -80 || x > size.w + 80 || y < -80 || y > size.h + 80) return;

        const areaFactor = Math.min(2.0, Math.max(0.8, Math.log10(p.areaSqDeg + 1) * 0.9));
        const charCount = Math.max(3, p.name.length);
        const baseSize = Math.min(32, Math.max(8, (size.w / charCount) * 0.22 * areaFactor));
        const fontSize = Math.round(baseSize * Math.min(zoom, 3));

        if (fontSize < 7) return;

        const displayTitle = p.name.toUpperCase();
        ctx.save();
        ctx.font = `bold ${fontSize}px "Times New Roman", Times, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (!isGlobe && p.angleDeg !== 0 && zoom < 3) {
          ctx.translate(x, y);
          ctx.rotate((p.angleDeg * Math.PI) / 180);
          ctx.translate(-x, -y);
        }

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = isDarkBackground ? "rgba(5,8,15,0.92)" : "rgba(255,255,255,0.92)";
        ctx.lineWidth = Math.max(1.5, fontSize * 0.18);
        ctx.strokeText(displayTitle, x, y);

        ctx.fillStyle = isSelected ? "#fbbf24" : isDarkBackground ? "#f8fafc" : "#0f172a";
        ctx.fillText(displayTitle, x, y);
        ctx.restore();
      });
    }
  }, [geoJsonData, projectionId, size.w, size.h, showLabels, selectedFeatureName, onlyShowCountry, isDarkBackground, isGlobe]);

  // Render on state changes
  useEffect(() => {
    render();
  }, [render, zoomLevel]);

  // ============ Smooth Animation Engine ============
  const stopAnimation = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    animRef.current = null;
    setIsAnimating(false);
  }, []);

  const animateTo = useCallback((target: Partial<ViewTransform>, duration = 400) => {
    stopAnimation();

    const from: ViewTransform = {
      zoom: viewRef.current.zoom,
      centerX: viewRef.current.centerX,
      centerY: viewRef.current.centerY,
      rotation: [...viewRef.current.rotation] as [number, number, number],
    };

    const to: ViewTransform = {
      zoom: target.zoom ?? from.zoom,
      centerX: target.centerX ?? from.centerX,
      centerY: target.centerY ?? from.centerY,
      rotation: target.rotation ?? from.rotation,
    };

    if (from.zoom === to.zoom && from.centerX === to.centerX && from.centerY === to.centerY &&
        from.rotation[0] === to.rotation[0] && from.rotation[1] === to.rotation[1]) {
      return;
    }

    animRef.current = { from, to, startTime: performance.now(), duration };
    setIsAnimating(true);

    const step = (now: number) => {
      if (!animRef.current) return;

      const { from: f, to: t, startTime, duration: dur } = animRef.current;
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / dur);
      const eased = easeOutCubic(progress);

      viewRef.current.zoom = lerp(f.zoom, t.zoom, eased);
      viewRef.current.centerX = lerp(f.centerX, t.centerX, eased);
      viewRef.current.centerY = lerp(f.centerY, t.centerY, eased);
      viewRef.current.rotation = [
        lerp(f.rotation[0], t.rotation[0], eased),
        lerp(f.rotation[1], t.rotation[1], eased),
        0,
      ];

      setZoomLevel(viewRef.current.zoom);
      render();

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        stopAnimation();
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, [render, stopAnimation]);

  // ============ Auto-Rotate Globe ============
  useEffect(() => {
    if (!isGlobe || isDragging || isAnimating) return;

    let lastTime = 0;
    const animate = (time: number) => {
      if (time - lastTime > 40) {
        viewRef.current.rotation[0] = (viewRef.current.rotation[0] + 0.15) % 360;
        render();
        lastTime = time;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isGlobe, isDragging, isAnimating, render]);

  // ============ Control Auto-Hide ============
  const scheduleHideControls = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    scheduleHideControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [scheduleHideControls]);

  // ============ Wheel Zoom (with smooth animation) ============
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      scheduleHideControls();
      stopAnimation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const oldZoom = viewRef.current.zoom;
      const factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZoom * factor));

      if (newZoom === oldZoom) return;

      const scaleRatio = newZoom / oldZoom;
      viewRef.current.centerX = mouseX - (mouseX - viewRef.current.centerX) * scaleRatio;
      viewRef.current.centerY = mouseY - (mouseY - viewRef.current.centerY) * scaleRatio;
      viewRef.current.zoom = newZoom;

      setZoomLevel(newZoom);
      render();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [render, scheduleHideControls, stopAnimation]);

  // ============ Mouse Drag (pan/rotate) ============
  const handleMouseDown = (e: React.MouseEvent) => {
    stopAnimation();
    setIsDragging(true);
    setDidDrag(false);
    scheduleHideControls();
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      view: { ...viewRef.current, rotation: [...viewRef.current.rotation] as [number, number, number] },
    };
    velocityRef.current = { x: 0, y: 0, time: performance.now() };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      setDidDrag(true);
    }

    // Track velocity for momentum
    const now = performance.now();
    const dt = now - velocityRef.current.time;
    if (dt > 0) {
      velocityRef.current = {
        x: ((e.clientX - (dragStartRef.current.x + dx)) / dt) * 16,
        y: ((e.clientY - (dragStartRef.current.y + dy)) / dt) * 16,
        time: now,
      };
    }

    if (isGlobe) {
      viewRef.current.rotation = [
        dragStartRef.current.view.rotation[0] + dx * 0.35,
        Math.max(-90, Math.min(90, dragStartRef.current.view.rotation[1] - dy * 0.35)),
        0,
      ];
    } else {
      viewRef.current.centerX = dragStartRef.current.view.centerX + dx;
      viewRef.current.centerY = dragStartRef.current.view.centerY + dy;
    }

    render();
  };

  const handleMouseUp = () => {
    if (isDragging && !isGlobe && didDrag) {
      // Apply momentum on release
      const vx = velocityRef.current.x;
      const vy = velocityRef.current.y;

      if (Math.abs(vx) > 0.5 || Math.abs(vy) > 0.5) {
        animateTo({
          centerX: viewRef.current.centerX + vx * 8,
          centerY: viewRef.current.centerY + vy * 8,
        }, 600);
      }
    }

    setIsDragging(false);
    dragStartRef.current = null;
  };

  // ============ Touch Support (pan + pinch zoom) ============
  const handleTouchStart = (e: React.TouchEvent) => {
    stopAnimation();
    scheduleHideControls();

    if (e.touches.length === 1) {
      setIsDragging(true);
      setDidDrag(false);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        view: { ...viewRef.current, rotation: [...viewRef.current.rotation] as [number, number, number] },
      };
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const rect = containerRef.current?.getBoundingClientRect();
      const midX = (touch1.clientX + touch2.clientX) / 2 - (rect?.left ?? 0) - (rect?.width ?? 0) / 2;
      const midY = (touch1.clientY + touch2.clientY) / 2 - (rect?.top ?? 0) - (rect?.height ?? 0) / 2;

      pinchStartRef.current = {
        dist,
        zoom: viewRef.current.zoom,
        centerX: viewRef.current.centerX,
        centerY: viewRef.current.centerY,
        touchPoint: { x: midX, y: midY },
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 1 && isDragging && dragStartRef.current) {
      const dx = e.touches[0].clientX - dragStartRef.current.x;
      const dy = e.touches[0].clientY - dragStartRef.current.y;

      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        setDidDrag(true);
      }

      if (isGlobe) {
        viewRef.current.rotation = [
          dragStartRef.current.view.rotation[0] + dx * 0.4,
          Math.max(-90, Math.min(90, dragStartRef.current.view.rotation[1] - dy * 0.4)),
          0,
        ];
      } else {
        viewRef.current.centerX = dragStartRef.current.view.centerX + dx;
        viewRef.current.centerY = dragStartRef.current.view.centerY + dy;
      }
      render();
    } else if (e.touches.length === 2 && pinchStartRef.current) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const rect = containerRef.current?.getBoundingClientRect();
      const midX = (touch1.clientX + touch2.clientX) / 2 - (rect?.left ?? 0) - (rect?.width ?? 0) / 2;
      const midY = (touch1.clientY + touch2.clientY) / 2 - (rect?.top ?? 0) - (rect?.height ?? 0) / 2;

      const pinch = pinchStartRef.current;
      const scaleRatio = dist / pinch.dist;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.zoom * scaleRatio));

      // Zoom toward pinch center
      const zoomRatio = newZoom / pinch.zoom;
      viewRef.current.centerX = pinch.touchPoint.x - (pinch.touchPoint.x - pinch.centerX) * zoomRatio + (midX - pinch.touchPoint.x);
      viewRef.current.centerY = pinch.touchPoint.y - (pinch.touchPoint.y - pinch.centerY) * zoomRatio + (midY - pinch.touchPoint.y);
      viewRef.current.zoom = newZoom;

      setZoomLevel(newZoom);
      render();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setIsDragging(false);
      dragStartRef.current = null;
      pinchStartRef.current = null;
    } else if (e.touches.length === 1) {
      pinchStartRef.current = null;
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        view: { ...viewRef.current, rotation: [...viewRef.current.rotation] as [number, number, number] },
      };
    }
  };

  // ============ Click to Select ============
  const handleClick = (e: React.MouseEvent) => {
    if (didDrag || !geoJsonData || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const proj = createProjection(projectionId, size.w, size.h, viewRef.current);
    const data = geoJsonData as {
      features?: Array<{
        properties?: Record<string, unknown> | null;
        geometry?: GeoJSON.Geometry;
      }>;
    };
    if (!data.features) return;

    let closestDist = Infinity;
    let closestFeature: unknown = null;

    data.features.forEach((f) => {
      if (!f.geometry) return;
      if (onlyShowCountry && !matchesCountryFilter(f as never, onlyShowCountry)) return;
      if (!getFeatureName(f.properties)) return;

      const bounds = getGeometryBounds(f.geometry);
      if (!bounds) return;

      const centerLng = (bounds[0][0] + bounds[1][0]) / 2;
      const centerLat = (bounds[0][1] + bounds[1][1]) / 2;
      const pt = proj([centerLng, centerLat]);
      if (!pt) return;

      const dist = Math.hypot(pt[0] - clickX, pt[1] - clickY);
      if (dist < closestDist) {
        closestDist = dist;
        closestFeature = f;
      }
    });

    const hitRadius = Math.max(50, 90 / Math.sqrt(viewRef.current.zoom));
    if (closestFeature && closestDist < hitRadius) {
      onFeatureSelect(closestFeature);
    } else {
      onFeatureSelect(null);
    }
  };

  // ============ Keyboard Shortcuts ============
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      const panSpeed = 60;
      let handled = true;

      switch (e.key) {
        case "+":
        case "=":
          animateTo({ zoom: Math.min(MAX_ZOOM, viewRef.current.zoom * 1.6) });
          break;
        case "-":
        case "_":
          animateTo({ zoom: Math.max(MIN_ZOOM, viewRef.current.zoom / 1.6) });
          break;
        case "0":
          animateTo({ ...DEFAULT_VIEW }, 600);
          break;
        case "ArrowUp":
          if (isGlobe) {
            animateTo({ rotation: [viewRef.current.rotation[0], Math.min(90, viewRef.current.rotation[1] + 10), 0] });
          } else {
            animateTo({ centerY: viewRef.current.centerY + panSpeed });
          }
          break;
        case "ArrowDown":
          if (isGlobe) {
            animateTo({ rotation: [viewRef.current.rotation[0], Math.max(-90, viewRef.current.rotation[1] - 10), 0] });
          } else {
            animateTo({ centerY: viewRef.current.centerY - panSpeed });
          }
          break;
        case "ArrowLeft":
          if (isGlobe) {
            animateTo({ rotation: [viewRef.current.rotation[0] - 15, viewRef.current.rotation[1], 0] });
          } else {
            animateTo({ centerX: viewRef.current.centerX + panSpeed });
          }
          break;
        case "ArrowRight":
          if (isGlobe) {
            animateTo({ rotation: [viewRef.current.rotation[0] + 15, viewRef.current.rotation[1], 0] });
          } else {
            animateTo({ centerX: viewRef.current.centerX - panSpeed });
          }
          break;
        default:
          handled = false;
      }

      if (handled) {
        e.preventDefault();
        scheduleHideControls();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [animateTo, isGlobe, scheduleHideControls]);

  // ============ Zoom Actions (with animation) ============
  const zoomIn = () => {
    scheduleHideControls();
    animateTo({ zoom: Math.min(MAX_ZOOM, viewRef.current.zoom * 1.6) });
  };

  const zoomOut = () => {
    scheduleHideControls();
    animateTo({ zoom: Math.max(MIN_ZOOM, viewRef.current.zoom / 1.6) });
  };

  const resetView = () => {
    scheduleHideControls();
    animateTo({ ...DEFAULT_VIEW }, 600);
  };

  const zoomToPreset = (target: number) => {
    scheduleHideControls();
    animateTo({ zoom: target, centerX: 0, centerY: 0 }, 500);
  };

  const handleSliderChange = (value: number) => {
    stopAnimation();
    scheduleHideControls();
    viewRef.current.zoom = value;
    setZoomLevel(value);
    render();
  };

  // Zoom to fit selected country
  const zoomToSelection = () => {
    if (!geoJsonData || !selectedFeatureName) return;
    scheduleHideControls();

    const data = geoJsonData as {
      features?: Array<{
        properties?: Record<string, unknown> | null;
        geometry?: GeoJSON.Geometry;
      }>;
    };

    const feature = data.features?.find(
      (f) => getFeatureName(f.properties) === selectedFeatureName
    );
    if (!feature?.geometry) return;

    const bounds = getGeometryBounds(feature.geometry);
    if (!bounds) return;

    const centerLng = (bounds[0][0] + bounds[1][0]) / 2;
    const centerLat = (bounds[0][1] + bounds[1][1]) / 2;
    const spanLng = bounds[1][0] - bounds[0][0];
    const spanLat = bounds[1][1] - bounds[0][1];
    const span = Math.max(spanLng, spanLat);

    // Estimate zoom to fit this country
    const estimatedZoom = Math.max(1, Math.min(MAX_ZOOM, 180 / Math.max(span, 1)));

    if (isGlobe) {
      animateTo({
        zoom: estimatedZoom,
        rotation: [-centerLng, -centerLat, 0],
      }, 800);
    } else {
      // For flat projections, zoom and center
      animateTo({ zoom: estimatedZoom }, 800);
    }
  };

  // Show controls when user interacts
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const showHandler = () => scheduleHideControls();
    container.addEventListener("mousemove", showHandler);
    container.addEventListener("touchstart", showHandler);

    return () => {
      container.removeEventListener("mousemove", showHandler);
      container.removeEventListener("touchstart", showHandler);
    };
  }, [scheduleHideControls]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          cursor: isDragging ? (isGlobe ? "grabbing" : "move") : isGlobe ? "grab" : "crosshair",
          touchAction: "none",
        }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* ============ Navigation Controls (auto-hide) ============ */}
      <div
        className={`absolute top-4 right-4 z-[500] flex flex-col items-end gap-2 transition-all duration-300 ${
          showControls ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 pointer-events-none"
        }`}
      >
        {/* Zoom Buttons */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={zoomIn}
            title="Zoom in (+ key)"
            className="w-10 h-10 rounded-xl bg-gray-900/90 backdrop-blur-md border border-white/20 text-white text-xl font-bold flex items-center justify-center cursor-pointer hover:bg-gray-800 hover:border-amber-400/40 active:scale-95 shadow-lg transition-all"
          >
            +
          </button>
          <button
            onClick={zoomOut}
            title="Zoom out (− key)"
            className="w-10 h-10 rounded-xl bg-gray-900/90 backdrop-blur-md border border-white/20 text-white text-xl font-bold flex items-center justify-center cursor-pointer hover:bg-gray-800 hover:border-amber-400/40 active:scale-95 shadow-lg transition-all"
          >
            −
          </button>
        </div>

        {/* Zoom to Selection */}
        {selectedFeatureName && (
          <button
            onClick={zoomToSelection}
            title={`Zoom to ${selectedFeatureName}`}
            className="w-10 h-10 rounded-xl bg-amber-500/20 backdrop-blur-md border border-amber-400/40 text-amber-300 text-sm font-bold flex items-center justify-center cursor-pointer hover:bg-amber-500/30 active:scale-95 shadow-lg transition-all"
          >
            🎯
          </button>
        )}

        {/* Reset */}
        <button
          onClick={resetView}
          title="Reset view (0 key)"
          className="w-10 h-10 rounded-xl bg-gray-900/90 backdrop-blur-md border border-white/20 text-amber-300 text-sm font-bold flex items-center justify-center cursor-pointer hover:bg-gray-800 hover:border-amber-400/40 active:scale-95 shadow-lg transition-all"
        >
          ⟳
        </button>
      </div>

      {/* ============ Bottom Control Bar ============ */}
      <div
        className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[500] flex items-center gap-3 rounded-2xl bg-gray-900/90 backdrop-blur-xl border border-white/15 px-4 py-2.5 shadow-2xl transition-all duration-300 ${
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        {/* Zoom Slider */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-400 w-8 text-right">
            {zoomLevel.toFixed(1)}×
          </span>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.1}
            value={zoomLevel}
            onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
            className="w-24 sm:w-32 h-1.5 rounded-full accent-amber-500 cursor-pointer bg-gray-700"
            title="Zoom level"
          />
        </div>

        {/* Zoom Preset Buttons */}
        <div className="flex items-center gap-1">
          {ZOOM_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => zoomToPreset(preset)}
              title={`Zoom to ${preset}×`}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                Math.abs(zoomLevel - preset) < 0.05
                  ? "bg-amber-500 text-gray-950 shadow-sm"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/10"
              }`}
            >
              {preset}×
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-white/10" />

        {/* Hint Text */}
        <span className="text-[10px] text-gray-500 hidden sm:inline whitespace-nowrap">
          {isGlobe ? "Drag: rotate · Pinch/Scroll: zoom" : "Drag: pan · Scroll: zoom · Dbl-click: zoom in"}
        </span>
      </div>

      {/* ============ Keyboard Hints (bottom-left) ============ */}
      <div
        className={`absolute bottom-4 left-4 z-[400] rounded-lg bg-gray-900/70 backdrop-blur-md border border-white/10 px-2.5 py-1.5 text-[9px] text-gray-400 font-mono space-y-0.5 transition-opacity duration-300 hidden md:block ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <p><kbd className="text-amber-400">+</kbd>/<kbd className="text-amber-400">−</kbd> zoom</p>
        <p><kbd className="text-amber-400">↑↓←→</kbd> navigate</p>
        <p><kbd className="text-amber-400">0</kbd> reset view</p>
      </div>

      {/* Animation indicator */}
      {isAnimating && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500]">
          <div className="flex items-center gap-1.5 rounded-full bg-gray-900/90 px-3 py-1 text-[10px] text-amber-300 border border-white/10">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Animating…</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to get geometry bounds
function getGeometryBounds(geom: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

  const walk = (coords: unknown) => {
    if (Array.isArray(coords)) {
      if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") {
        const [lng, lat] = coords as [number, number];
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      } else {
        coords.forEach(walk);
      }
    }
  };

  if (geom.type === "Polygon") walk((geom as GeoJSON.Polygon).coordinates);
  else if (geom.type === "MultiPolygon") walk((geom as GeoJSON.MultiPolygon).coordinates);
  else if (geom.type === "GeometryCollection") {
    (geom as GeoJSON.GeometryCollection).geometries.forEach((g) => {
      const b = getGeometryBounds(g);
      if (b) {
        if (b[0][0] < minLng) minLng = b[0][0];
        if (b[1][0] > maxLng) maxLng = b[1][0];
        if (b[0][1] < minLat) minLat = b[0][1];
        if (b[1][1] > maxLat) maxLat = b[1][1];
      }
    });
  }

  if (minLng === Infinity) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}
