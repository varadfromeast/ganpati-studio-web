// Replaced from the completed build by scripts/build-service-worker.mjs.
const BUILD_VERSION = "__BUILD_VERSION__";
const CACHE_PREFIX = "ganpati-studio-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${BUILD_VERSION}`;
const PACK_CACHE = `${CACHE_PREFIX}packs-${BUILD_VERSION}`;
const SHELL = __PRECACHE_URLS__;
const NETWORK_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  // Allow existing tabs to finish with their own shell before activating an update.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE && key !== PACK_CACHE)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.headers.has("authorization") || event.request.headers.has("x-firebase-appcheck")) return;

  // Route queries (such as ?intent=design) may use the public offline shell.
  // The requested document itself is never stored in the cache.
  if (event.request.mode === "navigate") {
    event.respondWith(navigate(event.request));
    return;
  }
  // Query-bearing resources can be signed or user-specific; never cache them.
  if (url.search !== "") return;

  if (/^\/packs\/[^/]+\/manifest\.v2\.json$/.test(url.pathname)) {
    event.respondWith(networkFirst(event.request, PACK_CACHE, url.pathname));
    return;
  }
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(networkFirst(event.request, SHELL_CACHE));
    return;
  }
  if (/^\/packs\/[^/]+\/(?:layers|thumbnails)\/[^/]+\.(?:avif|jpe?g|png|webp)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, PACK_CACHE));
    return;
  }
  if (/^\/(?:assets|icons|materials|previews)\//.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
  }
});

async function cachedResponse(cacheName, request) {
  try {
    return await (await caches.open(cacheName)).match(request);
  } catch {
    // Cache Storage can be unavailable or evicted; online use must still work.
    return undefined;
  }
}

async function storeResponse(cacheName, request, response) {
  if (!response.ok || response.redirected) return;
  try {
    await (await caches.open(cacheName)).put(request, response.clone());
  } catch {
    // A full device must not turn a successful network response into a failure.
  }
}

async function fetchBounded(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal, cache: "no-cache" });
  } finally {
    clearTimeout(timeout);
  }
}

async function navigate(request) {
  try {
    const response = await fetchBounded(request);
    return response.ok ? response : await cachedResponse(SHELL_CACHE, "/") ?? response;
  } catch (error) {
    const cached = await cachedResponse(SHELL_CACHE, "/");
    if (cached) return cached;
    throw error;
  }
}

function staleWhileRevalidate(event, cacheName) {
  const cached = cachedResponse(cacheName, event.request);
  const network = fetchBounded(event.request).then(async (response) => {
    await storeResponse(cacheName, event.request, response);
    return response;
  });
  // Register background work synchronously, before the cached response resolves.
  event.waitUntil(network.then(() => undefined).catch(() => undefined));
  return cached.then((response) => response ?? network);
}

async function networkFirst(request, cacheName, packManifestPath) {
  const cached = await cachedResponse(cacheName, request);
  try {
    const response = await fetchBounded(request);
    if (!response.ok) return cached ?? response;
    if (packManifestPath && cached && await cached.clone().text() !== await response.clone().text()) {
      // Layer filenames are stable within a pack; invalidate them if its manifest changes.
      const packRoot = packManifestPath.slice(0, packManifestPath.lastIndexOf("/") + 1);
      try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        await Promise.all(keys.map((key) => {
          const url = new URL(key.url);
          return url.origin === self.location.origin && url.pathname.startsWith(packRoot)
            ? cache.delete(key)
            : undefined;
        }));
      } catch {
        // Network success remains usable if cache maintenance is unavailable.
      }
    }
    await storeResponse(cacheName, request, response);
    return response;
  } catch (error) {
    if (cached) return cached;
    throw error;
  }
}
