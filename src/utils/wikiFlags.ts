export interface WikiFlagResult {
  id: number;
  title: string;
  cleanTitle: string;
  thumbUrl: string;
  originalUrl: string;
  width: number;
  height: number;
  description: string;
  date?: string;
  license?: string;
}

const wikiQueryCache = new Map<string, WikiFlagResult[]>();
const imageBlobCache = new Map<string, string>();

/**
 * Cleans Wikimedia file title into a human-readable title
 * e.g. "File:Flag of France (1790–1794).svg" -> "Flag of France (1790–1794)"
 */
function cleanWikiTitle(title: string): string {
  return title
    .replace(/^File:/i, "")
    .replace(/\.(svg|png|jpg|jpeg|webp)$/i, "")
    .replace(/_/g, " ")
    .trim();
}

/**
 * Searches Wikimedia Commons for flags, banners, standards, and coats of arms with built-in caching
 */
export async function searchWikimediaFlags(
  countryName: string,
  customQuery?: string,
  limit: number = 24
): Promise<WikiFlagResult[]> {
  if (!countryName && !customQuery) return [];

  // Build intelligent search term
  let searchTerm = "";
  if (customQuery && customQuery.trim().length > 0) {
    searchTerm = customQuery.trim();
  } else {
    // Default search for flags and banners of this country
    const cleanCountry = countryName.trim();
    searchTerm = `Flag of ${cleanCountry} OR "${cleanCountry} flag" OR "${cleanCountry} banner" OR "${cleanCountry} standard" OR "Coat of arms of ${cleanCountry}"`;
  }

  const cacheKey = searchTerm.toLowerCase();
  if (wikiQueryCache.has(cacheKey)) {
    return wikiQueryCache.get(cacheKey)!;
  }

  const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    searchTerm
  )}&gsrlimit=${limit}&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=800&format=json&origin=*`;

  try {
    const res = await fetch(endpoint);
    if (!res.ok) {
      if (res.status === 429) {
        console.warn("Wikimedia API 429 rate limit");
        return [];
      }
      throw new Error(`Wikimedia API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.query || !data.query.pages) {
      wikiQueryCache.set(cacheKey, []);
      return [];
    }

    const pages = Object.values(data.query.pages) as Array<{
      pageid: number;
      title: string;
      imageinfo?: Array<{
        url: string;
        thumburl: string;
        width: number;
        height: number;
        mime: string;
        extmetadata?: {
          ObjectName?: { value: string };
          ImageDescription?: { value: string };
          DateTimeOriginal?: { value: string };
          LicenseShortName?: { value: string };
        };
      }>;
    }>;

    const results: WikiFlagResult[] = [];

    pages.forEach((page) => {
      if (!page.imageinfo || page.imageinfo.length === 0) return;
      const info = page.imageinfo[0];

      // Only accept images
      if (!info.mime || !info.mime.startsWith("image/")) return;

      const metadata = info.extmetadata;
      const cleanTitle = metadata?.ObjectName?.value
        ? metadata.ObjectName.value.replace(/<[^>]*>?/gm, "").trim()
        : cleanWikiTitle(page.title);

      const rawDesc = metadata?.ImageDescription?.value || "";
      const cleanDesc = rawDesc.replace(/<[^>]*>?/gm, "").trim();

      results.push({
        id: page.pageid,
        title: page.title,
        cleanTitle: cleanTitle || cleanWikiTitle(page.title),
        thumbUrl: info.thumburl || info.url,
        originalUrl: info.url,
        width: info.width || 800,
        height: info.height || 600,
        description: cleanDesc.slice(0, 120),
        date: metadata?.DateTimeOriginal?.value,
        license: metadata?.LicenseShortName?.value,
      });
    });

    // Sort to prioritize items that have "Flag" or "Banner" in title
    results.sort((a, b) => {
      const aHasFlag = /flag|banner|standard|royal/i.test(a.cleanTitle);
      const bHasFlag = /flag|banner|standard|royal/i.test(b.cleanTitle);
      if (aHasFlag && !bHasFlag) return -1;
      if (!aHasFlag && bHasFlag) return 1;
      return 0;
    });

    wikiQueryCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Failed to search Wikimedia Commons flags:", err);
    return [];
  }
}

/**
 * Safely fetches an image and turns it into a local ObjectURL blob to prevent canvas tainting
 */
export async function fetchImageAsBlobUrl(url: string): Promise<string> {
  if (imageBlobCache.has(url)) {
    return imageBlobCache.get(url)!;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch image blob");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    imageBlobCache.set(url, objectUrl);
    return objectUrl;
  } catch {
    return url;
  }
}
