import { useState, useEffect, useRef } from "react";
import { BASE_URL, YEARS } from "../data/years";
import { getCachedGeoJson, setCachedGeoJson } from "../utils/geoCacheDb";

export function useGeoJsonData(yearIndex: number) {
  const [data, setData] = useState<unknown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const entry = YEARS[yearIndex];
    if (!entry) return;

    const url = BASE_URL + entry.filename;

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Abort previous network request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    let isMounted = true;

    // Step 1: Check instant memory / IndexedDB cache
    getCachedGeoJson(url).then((cached) => {
      if (!isMounted) return;

      if (cached) {
        setData(cached);
        setLoading(false);
        setError(null);
        return;
      }

      // Step 2: If not cached, debounce network request slightly (150ms) to avoid spam while sliding
      setLoading(true);
      setError(null);

      debounceTimerRef.current = setTimeout(() => {
        if (!isMounted) return;

        const controller = new AbortController();
        abortRef.current = controller;

        const fetchWithBackoff = async (attempt = 1): Promise<void> => {
          try {
            const res = await fetch(url, {
              signal: controller.signal,
              headers: { Accept: "application/json" },
            });

            if (res.status === 429) {
              if (attempt <= 2 && !controller.signal.aborted) {
                const waitTime = 2000 * attempt;
                if (isMounted) {
                  setError(`Rate limited (HTTP 429). Retrying in ${Math.round(waitTime / 1000)}s...`);
                }
                await new Promise((r) => setTimeout(r, waitTime));
                if (!controller.signal.aborted) {
                  return fetchWithBackoff(attempt + 1);
                }
              } else {
                throw new Error("HTTP 429: Rate limit reached. Use the Cache Manager to load data or wait a few seconds.");
              }
            }

            if (!res.ok) {
              throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const json = await res.json();

            if (isMounted) {
              await setCachedGeoJson(url, json);
              setData(json);
              setLoading(false);
              setError(null);
            }
          } catch (err: unknown) {
            const errorObj = err as Error;
            if (errorObj.name === "AbortError") return;

            if (isMounted) {
              setError(errorObj.message || "Failed to load historical boundary data");
              setLoading(false);
            }
          }
        };

        fetchWithBackoff();
      }, 150);
    });

    return () => {
      isMounted = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [yearIndex]);

  return { data, loading, error };
}
