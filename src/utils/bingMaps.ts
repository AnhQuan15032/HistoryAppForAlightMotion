import L from "leaflet";

/**
 * Converts tile coordinate (x, y, z) into a Microsoft Bing Maps QuadKey string
 */
export function tileToQuadKey(x: number, y: number, z: number): string {
  let quadKey = "";
  for (let i = z; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadKey += digit.toString();
  }
  return quadKey;
}

export type BingStyle = "aerial" | "road" | "hybrid" | "canvasDark" | "canvasLight";

/**
 * Custom Leaflet TileLayer class for Microsoft Bing Maps QuadKey tiles
 */
export class BingMapsTileLayer extends L.TileLayer {
  public bingStyle: BingStyle;

  constructor(style: BingStyle = "aerial", options?: L.TileLayerOptions) {
    let urlPattern = "";
    switch (style) {
      case "road":
        urlPattern = "https://ecn.t{s}.tiles.virtualearth.net/tiles/r{q}.png?g=1&mkt=en-US";
        break;
      case "hybrid":
        urlPattern = "https://ecn.t{s}.tiles.virtualearth.net/tiles/h{q}.jpeg?g=1&mkt=en-US";
        break;
      case "canvasDark":
        urlPattern = "https://ecn.t{s}.tiles.virtualearth.net/tiles/r{q}.png?g=1&mkt=en-US";
        break;
      case "canvasLight":
        urlPattern = "https://ecn.t{s}.tiles.virtualearth.net/tiles/r{q}.png?g=1&mkt=en-US";
        break;
      case "aerial":
      default:
        urlPattern = "https://ecn.t{s}.tiles.virtualearth.net/tiles/a{q}.jpeg?g=1";
        break;
    }

    super(urlPattern, {
      subdomains: ["0", "1", "2", "3"],
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.bing.com/maps" target="_blank" rel="noopener">Microsoft Bing Maps</a>',
      crossOrigin: true,
      ...options,
    });

    this.bingStyle = style;
  }

  getTileUrl(coords: L.Coords): string {
    const quadKey = tileToQuadKey(coords.x, coords.y, coords.z);
    const self = this as unknown as { _url: string; _getSubdomain: (c: L.Coords) => string };
    return L.Util.template(self._url, {
      s: self._getSubdomain(coords),
      q: quadKey,
    });
  }
}

/**
 * Factory function for creating a BingMapsTileLayer
 */
export function createBingTileLayer(style: BingStyle, options?: L.TileLayerOptions): BingMapsTileLayer {
  return new BingMapsTileLayer(style, options);
}
