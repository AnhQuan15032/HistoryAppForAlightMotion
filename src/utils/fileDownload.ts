/**
 * Tiny browser file helpers shared by the Capture Studio exporters.
 */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a moment to start the transfer before releasing the object URL
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read image data"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Resolves any image source (data: URL, blob: URL, remote URL) into a data URL
 * so it can be embedded inside an exported SVG/XML document. Returns null if the
 * source cannot be read (e.g. a cross-origin URL without CORS).
 */
export async function imageSrcToDataUrl(src: string, mimeHint?: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:")) return src;

  try {
    const res = await fetch(src, { mode: "cors", credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (mimeHint && blob.type === "application/octet-stream") {
      return await blobToDataUrl(blob.slice(0, blob.size, mimeHint));
    }
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
