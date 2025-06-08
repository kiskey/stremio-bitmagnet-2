
import { TrackerSources } from '../types'; // Adjusted path
import { BEST_TRACKERS_URL, FALLBACK_TRACKERS } from '../constants'; // Adjusted path

let cachedTrackers: TrackerSources = { http: [], udp: [], ws: [] };
let lastFetched: number = 0;
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
let isFetching = false; // Simple mutex to prevent concurrent fetches

export const fetchTrackers = async (): Promise<TrackerSources> => {
  if (isFetching) {
    console.log("[trackerService] Tracker fetch already in progress. Returning current cache.");
    // Return a copy of the current cache to avoid race conditions on the cache object itself
    // or simply return the reference if mutations are handled carefully (which they are here).
    return getCachedTrackers(); 
  }
  
  const now = Date.now();
  // Check if cache is still valid and not empty
  if (now - lastFetched < CACHE_DURATION && 
      (cachedTrackers.http?.length || cachedTrackers.udp?.length || cachedTrackers.ws?.length)) {
    // console.log("[trackerService] Returning recently cached trackers.");
    return cachedTrackers;
  }

  isFetching = true;
  console.log("[trackerService] Cache expired or empty. Attempting to fetch fresh trackers...");

  try {
    const response = await fetch(BEST_TRACKERS_URL, { 
        signal: AbortSignal.timeout(15000) // 15s timeout for fetching trackers
    }); 
    if (!response.ok) {
      throw new Error(`Failed to fetch trackers list: ${response.status} ${response.statusText}`);
    }
    const text = await response.text();
    const trackerList = text.split('\n')
                            .map(t => t.trim())
                            .filter(t => t !== '' && (t.startsWith('http') || t.startsWith('udp') || t.startsWith('ws')));
    
    const newTrackers: TrackerSources = { http: [], udp: [], ws: [] };
    trackerList.forEach(trackerUrl => {
      try {
        // Basic URL validation, more robust validation could be added if needed
        const url = new URL(trackerUrl); 
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          if (newTrackers.http) newTrackers.http.push(trackerUrl);
        } else if (url.protocol === 'udp:') {
          if (newTrackers.udp) newTrackers.udp.push(trackerUrl);
        } else if (url.protocol === 'ws:' || url.protocol === 'wss:') {
          if (newTrackers.ws) newTrackers.ws.push(trackerUrl);
        }
      } catch (e) {
        // console.warn(`[trackerService] Invalid tracker URL skipped: ${trackerUrl}`, e);
      }
    });
    
    if (newTrackers.http?.length || newTrackers.udp?.length || newTrackers.ws?.length) {
        cachedTrackers = newTrackers; // Update cache
        lastFetched = now;
        console.log(`[trackerService] Fetched ${trackerList.length} trackers successfully. Categorized: ${newTrackers.http?.length || 0} HTTP, ${newTrackers.udp?.length || 0} UDP, ${newTrackers.ws?.length || 0} WS.`);
    } else {
        // If list was fetched but empty or all invalid, use fallbacks
        console.warn("[trackerService] Fetched tracker list was empty or contained no valid categorized trackers. Using fallbacks.");
        throw new Error("Fetched tracker list empty or invalid."); // Trigger fallback logic
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[trackerService] Error fetching trackers (${errorMessage}), using fallback list.`);
    const fallback: TrackerSources = { http: [], udp: [], ws: [] };
    FALLBACK_TRACKERS.forEach(trackerUrl => { // Populate fallback trackers
        if (trackerUrl.startsWith('http')) {
            if (fallback.http) fallback.http.push(trackerUrl);
        } else if (trackerUrl.startsWith('udp')) {
            if (fallback.udp) fallback.udp.push(trackerUrl);
        } else if (trackerUrl.startsWith('ws')) {
            if (fallback.ws) fallback.ws.push(trackerUrl);
        }
    });
    cachedTrackers = fallback; 
    lastFetched = now; // Mark fallback as "fetched" to avoid rapid retries
    console.log(`[trackerService] Using fallback trackers: ${fallback.http?.length || 0} HTTP, ${fallback.udp?.length || 0} UDP, ${fallback.ws?.length || 0} WS.`);
  } finally {
    isFetching = false; // Release mutex
  }
  return cachedTrackers;
};

export const getCachedTrackers = (): TrackerSources => {
  // If cache is completely empty and not recently attempted (and not currently fetching), try to fetch.
  // This handles scenarios where the initial fetch on module load might fail.
  if (!(cachedTrackers.http?.length || cachedTrackers.udp?.length || cachedTrackers.ws?.length) && 
      (Date.now() - lastFetched > 30000) && // 30s delay before retrying an empty cache
      !isFetching) { 
    console.log("[trackerService] Cache is empty and stale. Initiating background fetch from getCachedTrackers...");
    // Non-blocking call, let it update cache in background.
    // Errors are caught and logged within fetchTrackers itself.
    fetchTrackers().catch(e => console.error("[trackerService] Error during background fetch initiated by getCachedTrackers:", e));
  }
  return cachedTrackers;
};

// Initial fetch attempt when module loads (for server environments).
// This ensures trackers are fetched soon after server start.
// Check if running in Node.js environment before auto-fetching.
if (typeof process !== 'undefined' && process.versions?.node) {
    console.log("[trackerService] Initializing tracker fetch on module load (Node.js environment).");
    fetchTrackers(); // Errors are handled internally
}
