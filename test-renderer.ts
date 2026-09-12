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
  const state = { fillStyle: "", globalAlpha: 1, gco: "source-over" };
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
    set fillStyle(v: string) {
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
