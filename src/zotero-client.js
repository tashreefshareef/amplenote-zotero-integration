/**
 * Zotero Web API v3 client.
 *
 * zotero-findings.md: the API is fully CORS-open and confirmed reachable from a live
 * Amplenote embed and from the plugin context — both send Zotero-API-Key as a header,
 * never a `key=` query parameter (Zotero's own docs call the query param "not
 * recommended", and a key in a URL is a key in logs).
 *
 * `Backoff` and `Retry-After` are handled two different ways on purpose:
 *   - `request()` never sleeps or retries on its own. A 429/503 throws
 *     ZoteroRateLimitedError with the wait time attached, so a caller can't accidentally
 *     hammer the API in a retry loop it didn't know it was in.
 *   - `paginate()` DOES pause between pages when a successful response carries a
 *     `Backoff` header — that header means "you're fine, but slow down", and honouring
 *     it during a multi-page sync is exactly the retrofit the roadmap warns against
 *     doing later ("how you get banned mid-demo").
 */
import { ZOTERO_API_BASE, ZOTERO_API_VERSION } from "./constants.js";

export class ZoteroApiError extends Error {
  constructor(status, body) {
    super(`Zotero API error: HTTP ${status}`);
    this.name = "ZoteroApiError";
    this.status = status;
    this.body = body;
  }
}

export class ZoteroRateLimitedError extends Error {
  constructor(status, retryAfterSeconds) {
    super(`Zotero API rate limited: HTTP ${status}, retry after ${retryAfterSeconds}s`);
    this.name = "ZoteroRateLimitedError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const numberOrNull = (value) => (value === null || value === "" ? null : Number(value));

/** Zotero's `Link` header: comma-separated `<url>; rel="name"` entries. */
export function parseLinkHeader(linkHeader) {
  if (!linkHeader) return {};
  const links = {};
  for (const entry of linkHeader.split(",")) {
    const match = entry.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (match) links[match[2]] = match[1];
  }
  return links;
}

const defaultSleep = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export function createZoteroClient({
  apiKey,
  fetchImpl = typeof fetch === "function" ? fetch : undefined,
  sleepImpl = defaultSleep,
} = {}) {
  if (!fetchImpl) throw new Error("createZoteroClient: no fetch implementation available");

  /**
   * One request. `sinceVersion` maps to Zotero's `?since=` param (only items changed
   * after that library version come back); `ifModifiedSinceVersion` maps to the
   * `If-Unmodified-Since-Version` header Zotero docs describe for associating a
   * specific state with one result set — the two solve different sync questions and
   * a caller may want either, so both are separate options rather than one overloaded
   * "version" argument.
   */
  async function request(path, { method = "GET", params = {}, sinceVersion, ifModifiedSinceVersion } = {}) {
    const url = new URL(path, ZOTERO_API_BASE);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    if (sinceVersion !== undefined) url.searchParams.set("since", String(sinceVersion));

    const headers = { "Zotero-API-Version": ZOTERO_API_VERSION };
    if (apiKey) headers["Zotero-API-Key"] = apiKey;
    if (ifModifiedSinceVersion !== undefined) {
      headers["If-Unmodified-Since-Version"] = String(ifModifiedSinceVersion);
    }

    const res = await fetchImpl(url, { method, headers });

    const backoffHeader = res.headers.get("Backoff");
    const retryAfterHeader = res.headers.get("Retry-After");
    const backoffSeconds = numberOrNull(backoffHeader);

    if (res.status === 429 || res.status === 503) {
      throw new ZoteroRateLimitedError(res.status, numberOrNull(retryAfterHeader) ?? backoffSeconds ?? 1);
    }
    if (!res.ok && res.status !== 304) {
      let body;
      try {
        body = await res.text();
      } catch {
        body = null;
      }
      throw new ZoteroApiError(res.status, body);
    }

    return {
      status: res.status,
      notModified: res.status === 304,
      data: res.status === 304 ? null : await res.json(),
      lastModifiedVersion: numberOrNull(res.headers.get("Last-Modified-Version")),
      totalResults: numberOrNull(res.headers.get("Total-Results")),
      links: parseLinkHeader(res.headers.get("Link")),
      backoffSeconds,
    };
  }

  /**
   * Follows `Link: rel="next"` until exhausted, returning every item as one array plus
   * the final response's `Last-Modified-Version` — the library version to persist as
   * this sync's watermark, per zotero-findings.md's incremental-sync design.
   */
  async function paginate(path, { params = {}, sinceVersion, pageSize = 50 } = {}) {
    const items = [];
    let nextPath = path;
    let nextParams = { limit: pageSize, ...params };
    let lastModifiedVersion = null;

    while (nextPath) {
      const res = await request(nextPath, { params: nextParams, sinceVersion });
      items.push(...res.data);
      lastModifiedVersion = res.lastModifiedVersion;

      if (res.backoffSeconds) await sleepImpl(res.backoffSeconds);

      nextPath = res.links.next ?? null;
      nextParams = {}; // the next URL is already fully qualified with its own query string
      sinceVersion = undefined; // likewise — don't append `since=` a second time
    }

    return { items, lastModifiedVersion };
  }

  /** `/keys/current` — confirms the key is valid and returns its userID. */
  async function keysCurrent() {
    const res = await request("/keys/current");
    return res.data;
  }

  return { request, paginate, keysCurrent };
}
