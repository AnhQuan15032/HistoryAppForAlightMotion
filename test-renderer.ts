/*
 * Standalone verification for the Capture Studio canvas renderer layer-order.
 * Run:
 *   npx esbuild test-renderer.ts --bundle --format=esm --platform=node --outfile=/tmp/t.mjs && node /tmp/t.mjs
 * (not part of the app build or tsconfig)
 */
import { renderCountryToCanvas, type CaptureOptions } from "./src/utils/geoCapture";

const polygons = [
  [
    [
      [10, 50],
      [12, 50],
      [12, 52],
      [10, 52],
      [10, 50],
    ],
  ],
];

function makeRecordingCanvas() {
  const calls: string[] = [];
  const state = { fillStyle: "" as string | object, globalAlpha: 1, gco: "source-over" };
  const patternSentinel = { toString: () => "<pattern>" } as unknown as CanvasPattern;
  const ctx = {
    filter: "none",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    miterLimit: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    clearRect: () => calls.push("clearRect"),
    fillRect: () => calls.push(`fillRect:${state.fillStyle}`),
    createPattern: (_source: unknown, type: string) => {
      calls.push(`createPattern:${type}`);
      return patternSentinel;
    },
    scale: (sx: number, sy: number) => calls.push(`scale:${sx},${sy}`),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    clip: (rule?: string) => calls.push(`clip:${rule ?? "nonzero"}`),
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: () => {},
    rotate: () => {},
    drawImage: () => calls.push("drawImage"),
    fill: (rule?: string) => calls.push(`fill:${rule ?? "nonzero"}:${state.fillStyle}`),
    stroke: () => calls.push("stroke"),
    fillText: () => {},
    set fillStyle(v: string | object) {
      state.fillStyle = v;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalCompositeOperation(v: string) {
      state.gco = v;
      calls.push(`gco:${v}`);
    },
    get globalCompositeOperation() {
      return state.gco;
    },
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    set shadowColor(v: string) {
      calls.push(`shadowColor:${v}`);
    },
    set shadowBlur(v: number) {
      calls.push(`shadowBlur:${v}`);
    },
    set shadowOffsetX(v: number) {
      calls.push(`shadowOffsetX:${v}`);
    },
    set shadowOffsetY(v: number) {
      calls.push(`shadowOffsetY:${v}`);
    },
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, calls };
}

const fakeImage = {
  complete: true,
  naturalWidth: 100,
  naturalHeight: 100,
  width: 100,
  height: 100,
} as unknown as HTMLImageElement;

const baseOptions = {
  width: 1024,
  height: 1024,
  paddingRatio: 0.12,
  fillColor: "#DC2626",
  borderColor: "#FFFFFF",
  borderWidth: 2,
  backgroundColor: "transparent",
  showTitle: false,
  countryName: "Testland",
  yearLabel: "2000 AD",
  projection: "mercator" as const,
};

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:  ", msg);
  }
}

// 1) MASKED mode: clip exists, underlay drawn, image drawn inside clip, border on top
{
  const { canvas, calls } = makeRecordingCanvas();
  const opts: CaptureOptions = {
    ...baseOptions,
    fillOpacity: 0,
    imageFill: {
      image: fakeImage,
      fitMode: "cover",
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      opacity: 1,
      layerOrder: "masked",
      colorCombine: { enabled: true, baseColor: "#D4AF37", baseColorOpacity: 1 },
    },
  };
  renderCountryToCanvas(canvas, polygons, opts);
  const clipIdx = calls.indexOf("clip:evenodd");
  const drawIdx = calls.indexOf("drawImage");
  const underlayIdx = calls.findIndex((c) => c === "fillRect:rgba(212, 175, 55, 1)");
  const strokeIdx = calls.indexOf("stroke");

  assert(clipIdx >= 0, "masked: ctx.clip(evenodd) called");
  assert(underlayIdx > clipIdx, "masked: base underlay painted inside clip");
  assert(drawIdx > underlayIdx, "masked: image painted over underlay");
  assert(strokeIdx > drawIdx, "masked: border painted last");
}

// 2) BELOW mode: NO clip, image drawn FIRST, then country fill with its color+opacity, then border
{
  const { canvas, calls } = makeRecordingCanvas();
  const opts: CaptureOptions = {
    ...baseOptions,
    fillOpacity: 0.5,
    imageFill: {
      image: fakeImage,
      fitMode: "cover",
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      opacity: 1,
      layerOrder: "below",
      colorCombine: { enabled: true, baseColor: "#D4AF37", baseColorOpacity: 1 },
    },
  };
  renderCountryToCanvas(canvas, polygons, opts);
  const drawIdx = calls.indexOf("drawImage");
  const fillIdx = calls.findIndex((c) => c.startsWith("fill:evenodd:"));
  const strokeIdx = calls.indexOf("stroke");

  assert(!calls.includes("clip:evenodd"), "below: image is NOT clipped");
  assert(drawIdx >= 0, "below: image drawn");
  assert(fillIdx > drawIdx, "below: country fill painted AFTER the image");
  assert(
    calls[fillIdx] === "fill:evenodd:rgba(220, 38, 38, 0.5)",
    `below: country fill uses fillColor + fillOpacity (got ${calls[fillIdx]})`
  );
  assert(strokeIdx > fillIdx, "below: border painted last");
  assert(
    !calls.some((c) => c === "fillRect:rgba(212, 175, 55, 1)"),
    "below: no full-canvas base underlay"
  );
}

// 3) Solid-color fallback unchanged
{
  const { canvas, calls } = makeRecordingCanvas();
  renderCountryToCanvas(canvas, polygons, { ...baseOptions, fillOpacity: 0.8 });
  const fillIdx = calls.findIndex((c) => c.startsWith("fill:evenodd:"));
  assert(calls[fillIdx] === "fill:evenodd:rgba(220, 38, 38, 0.8)", "solid: fill color/opacity unchanged");
}

// 4) LAYER STACK: bottom→top order, per-layer clip, country fill at its stack
//    position, tint inside the mask, border ALWAYS last
{
  const { canvas, calls } = makeRecordingCanvas();
  const opts: CaptureOptions = {
    ...baseOptions,
    fillOpacity: 1,
    imageFill: null,
    layers: [
      {
        kind: "image",
        image: fakeImage,
        fitMode: "cover",
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        opacity: 1,
        clipToLand: true,
        tint: { color: "#D4AF37", opacity: 0.3, blend: "soft-light" },
      },
      { kind: "country", fillColor: "#DC2626", fillOpacity: 0.6 },
      {
        kind: "image",
        image: fakeImage,
        fitMode: "cover",
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        opacity: 1,
        clipToLand: false,
      },
    ],
  };
  renderCountryToCanvas(canvas, polygons, opts);

  const drawIdx1 = calls.indexOf("drawImage");
  const drawIdx2 = calls.indexOf("drawImage", drawIdx1 + 1);
  const countryFillIdx = calls.findIndex((c) => c === "fill:evenodd:rgba(220, 38, 38, 0.6)");
  const strokeIdx = calls.lastIndexOf("stroke");
  const clipIdx = calls.indexOf("clip:evenodd");

  assert(drawIdx1 >= 0 && drawIdx2 >= 0, "stack: both image layers drawn");
  assert(clipIdx >= 0 && clipIdx < drawIdx1, "stack: bottom (masked) layer clipped to territory");
  assert(
    calls.slice(clipIdx + 1, drawIdx2).filter((c) => c === "clip:evenodd").length === 0,
    "stack: top (unmasked) layer NOT clipped"
  );
  assert(
    countryFillIdx > drawIdx1 && countryFillIdx < drawIdx2,
    "stack: country layer painted at its stack position (between the two images)"
  );
  assert(drawIdx2 > countryFillIdx, "stack: top image painted after the country layer");
  assert(strokeIdx > drawIdx2, "stack: border painted LAST (crisp outline over all layers)");

  const tintIdx = calls.findIndex((c) => c === "fillRect:rgba(212, 175, 55, 0.3)");
  assert(tintIdx > drawIdx1 && tintIdx < drawIdx2, "stack: atmosphere tint painted over the masked layer");
}

// 5) LAYER STACK: a 0-opacity country layer paints nothing; stack still renders
{
  const { canvas, calls } = makeRecordingCanvas();
  renderCountryToCanvas(canvas, polygons, {
    ...baseOptions,
    fillOpacity: 0.5,
    imageFill: null,
    layers: [
      { kind: "country", fillColor: "#DC2626", fillOpacity: 0 },
      {
        kind: "image",
        image: fakeImage,
        fitMode: "cover",
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        opacity: 1,
        clipToLand: true,
      },
    ],
  });
  assert(!calls.some((c) => c.startsWith("fill:evenodd:")), "stack: 0-opacity country layer paints no fill");
  assert(calls.includes("drawImage"), "stack: image layer still drawn");
  assert(calls.includes("stroke"), "stack: border still drawn on top");
}

// 6) LAYER STACK: per-layer blend modes — set in order before each paint
{
  const { canvas, calls } = makeRecordingCanvas();
  renderCountryToCanvas(canvas, polygons, {
    ...baseOptions,
    fillOpacity: 1,
    imageFill: null,
    layers: [
      {
        kind: "image",
        image: fakeImage,
        fitMode: "cover",
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        opacity: 1,
        blendMode: "multiply",
        clipToLand: true,
      },
      { kind: "country", fillColor: "#DC2626", fillOpacity: 0.8, blendMode: "screen" },
      {
        kind: "image",
        image: fakeImage,
        fitMode: "cover",
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        opacity: 1,
        blendMode: "overlay",
        clipToLand: false,
      },
    ],
  });
  const drawIdx1 = calls.indexOf("drawImage");
  const drawIdx2 = calls.indexOf("drawImage", drawIdx1 + 1);
  const fillIdx = calls.findIndex((c) => c === "fill:evenodd:rgba(220, 38, 38, 0.8)");
  const gcoMultiply = calls.indexOf("gco:multiply");
  const gcoScreen = calls.indexOf("gco:screen");
  const gcoOverlay = calls.indexOf("gco:overlay");

  assert(gcoMultiply >= 0 && gcoMultiply < drawIdx1, "blend: image layer sets 'multiply' before its draw");
  assert(
    gcoScreen > drawIdx1 && gcoScreen < fillIdx,
    "blend: country layer sets 'screen' before its fill (at its stack position)"
  );
  assert(
    gcoOverlay > fillIdx && gcoOverlay < drawIdx2,
    "blend: top image layer sets 'overlay' before its draw"
  );
}

// 7) TILED layer: mirror-repeat pattern fill instead of a stretched drawImage
{
  const mirrorCalls: string[] = [];
  const mirrorCtx = {
    save: () => mirrorCalls.push("save"),
    restore: () => mirrorCalls.push("restore"),
    translate: (x: number, y: number) => mirrorCalls.push(`translate:${x},${y}`),
    scale: (sx: number, sy: number) => mirrorCalls.push(`scale:${sx},${sy}`),
    drawImage: () => mirrorCalls.push("drawImage"),
  };
  const tileBuilds: number[] = [];
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => {
      tileBuilds.push(1);
      return { width: 0, height: 0, getContext: () => mirrorCtx };
    },
  };

  const tileImage = {
    complete: true,
    naturalWidth: 80,
    naturalHeight: 60,
    width: 80,
    height: 60,
  } as unknown as HTMLImageElement;

  const tileLayer = {
    kind: "image" as const,
    image: tileImage,
    fitMode: "cover" as const,
    scale: 2,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    opacity: 1,
    tile: true,
    clipToLand: true,
  };

  const { canvas, calls } = makeRecordingCanvas();
  renderCountryToCanvas(canvas, polygons, {
    ...baseOptions,
    fillOpacity: 0.4,
    imageFill: null,
    layers: [tileLayer, { kind: "country", fillColor: "#DC2626", fillOpacity: 0.4 }],
  });

  const patternIdx = calls.indexOf("createPattern:repeat");
  const scaleIdx = calls.indexOf("scale:2,2");
  const patternFillIdx = calls.indexOf("fillRect:<pattern>");
  const countryFillIdx = calls.findIndex((c) => c === "fill:evenodd:rgba(220, 38, 38, 0.4)");
  const strokeIdx = calls.lastIndexOf("stroke");

  assert(patternIdx >= 0, "tile: repeating pattern created from the layer image");
  assert(
    patternFillIdx > patternIdx && patternFillIdx > scaleIdx,
    "tile: layer painted via a pattern fillRect (after the layer scale)"
  );
  assert(!calls.includes("drawImage"), "tile: no stretched drawImage for the tiled layer");
  assert(
    patternFillIdx < countryFillIdx && countryFillIdx < strokeIdx,
    "tile: tiled layer keeps its stack position"
  );

  // Mirror super-tile holds 4 quadrants: normal / flipX / flipY / flipXY
  assert(mirrorCalls.filter((c) => c === "drawImage").length === 4, "tile: mirror source holds 4 image cells");
  const mSeq = mirrorCalls.join(" ");
  assert(mSeq.includes("translate:80,0 scale:-1,1"), "tile: right cell mirrored horizontally");
  assert(mSeq.includes("translate:0,60 scale:1,-1"), "tile: bottom cell mirrored vertically");
  assert(mSeq.includes("translate:80,60 scale:-1,-1"), "tile: corner cell mirrored both ways");

  // A second render reuses the cached super-tile (built once per image)
  renderCountryToCanvas(canvas, polygons, {
    ...baseOptions,
    fillOpacity: 0.4,
    imageFill: null,
    layers: [tileLayer],
  });
  assert(tileBuilds.length === 1, "tile: mirror super-tile cached per image (built once)");
}

// 8) LAYER STACK: per-layer drop shadow — set before the paint, cleared before the next
{
  const { canvas, calls } = makeRecordingCanvas();
  renderCountryToCanvas(canvas, polygons, {
    ...baseOptions,
    fillOpacity: 1,
    imageFill: null,
    layers: [
      {
        kind: "image",
        image: fakeImage,
        fitMode: "cover",
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        opacity: 1,
        clipToLand: true,
        shadow: { color: "#000000", opacity: 0.6, blur: 24, offsetX: -4, offsetY: 10 },
      },
      {
        kind: "country",
        fillColor: "#DC2626",
        fillOpacity: 0.8,
        shadow: { color: "#7C3AED", opacity: 0.4, blur: 12, offsetX: 0, offsetY: 6 },
      },
    ],
  });
  const drawIdx = calls.indexOf("drawImage");
  const fillIdx = calls.findIndex((c) => c === "fill:evenodd:rgba(220, 38, 38, 0.8)");
  const imgShadowIdx = calls.indexOf("shadowColor:rgba(0, 0, 0, 0.6)");
  const imgShadowOx = calls.indexOf("shadowOffsetX:-4");
  const clearIdx = calls.indexOf("shadowBlur:0");
  const countryShadowIdx = calls.indexOf("shadowColor:rgba(124, 58, 237, 0.4)");

  assert(imgShadowIdx >= 0 && imgShadowIdx < drawIdx, "shadow: image layer sets shadow color before its draw");
  assert(imgShadowOx > imgShadowIdx && imgShadowOx < drawIdx, "shadow: image layer sets its offset before its draw");
  assert(clearIdx > drawIdx && clearIdx < fillIdx, "shadow: cleared after the image draw (before the next layer)");
  assert(countryShadowIdx > clearIdx && countryShadowIdx < fillIdx, "shadow: country layer sets its shadow before the territory fill");
}

// 9) LAYER STACK: a shadow-less layer sets NO shadow state
{
  const { canvas, calls } = makeRecordingCanvas();
  renderCountryToCanvas(canvas, polygons, {
    ...baseOptions,
    fillOpacity: 1,
    imageFill: null,
    layers: [
      {
        kind: "image",
        image: fakeImage,
        fitMode: "cover",
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        opacity: 1,
        clipToLand: false,
      },
      { kind: "country", fillColor: "#DC2626", fillOpacity: 0.8 },
    ],
  });
  assert(!calls.some((c) => c.startsWith("shadow")), "shadow: no shadow state touched when no layer has one");
}

console.log("\n--- BELOW mode call sequence ---");
{
  const { canvas, calls } = makeRecordingCanvas();
  renderCountryToCanvas(canvas, polygons, {
    ...baseOptions,
    fillOpacity: 0.5,
    imageFill: {
      image: fakeImage,
      fitMode: "cover",
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      opacity: 1,
      layerOrder: "below",
    },
  });
  console.log(calls.join(" -> "));
}
