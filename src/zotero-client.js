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
import { ZOTERO_API_BASE, ZOTERO_API_VERSION, DEFAULT_CITATION_STYLE } from "./constants.js";
import { stripHtmlToText, htmlToParagraphText } from "./format-citation.js";

/** Shared by syncItems and syncFilteredItems — same envelope, same fields sync needs. */
function mapSyncItem(item) {
  return {
    key: item.key,
    version: item.version,
    title: item.data?.title || "(untitled)",
    abstract: item.data?.abstractNote || "",
    tags: (item.data?.tags || []).map((t) => t.tag),
    citation: stripHtmlToText(item.citation),
    bib: stripHtmlToText(item.bib),
    url: item.links?.alternate?.href || null,
  };
}

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

/** Shared by every action that surfaces a Zotero call failure via app.alert. */
export function describeZoteroError(e) {
  if (e instanceof ZoteroRateLimitedError) {
    return `Zotero rate-limited this request — retry in ${e.retryAfterSeconds}s.`;
  }
  if (e instanceof ZoteroApiError) return `Zotero API error (HTTP ${e.status}). Check the key is current.`;
  return `Could not reach Zotero: ${e.message}`;
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
  userID,
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

  // Cached per client instance so a search doesn't cost two round trips every time —
  // resolved once, lazily, the first time something needs it. `pendingUserID` closes a
  // real race: two callers resolving concurrently (e.g. configure-sync.js's
  // Promise.all([listCollections(), listTags()])) would otherwise both see
  // cachedUserID === null before either await settles, and both fire their own
  // /keys/current request. Share the one in-flight request instead.
  let cachedUserID = userID ?? null;
  let pendingUserID = null;
  async function resolveUserID() {
    if (cachedUserID !== null) return cachedUserID;
    if (!pendingUserID) {
      pendingUserID = keysCurrent().then((info) => {
        cachedUserID = info.userID;
        pendingUserID = null;
        return cachedUserID;
      });
    }
    return pendingUserID;
  }

  /**
   * Top-level items (excludes child notes/attachments — those aren't citable on their
   * own) matching a quick-search query, with a formatted citation and bibliography
   * entry already attached and stripped to plain text. `qmode: titleCreatorYear` is
   * Zotero's default quick-search mode: title, creator and year only, not full text.
   */
  async function searchItems({ query, style = DEFAULT_CITATION_STYLE, limit = 25 } = {}) {
    const uid = await resolveUserID();
    const res = await request(`/users/${uid}/items/top`, {
      params: {
        q: query,
        qmode: "titleCreatorYear",
        itemType: "-attachment",
        include: "data,citation,bib",
        style,
        limit,
      },
    });
    return res.data.map((item) => ({
      key: item.key,
      title: item.data?.title || "(untitled)",
      citation: stripHtmlToText(item.citation),
      bib: stripHtmlToText(item.bib),
    }));
  }

  /**
   * Phase 3 content sync. `sinceVersion` omitted means a full pull (first-ever sync);
   * passed, Zotero returns only items changed after that library version. Same item
   * shape as `searchItems` plus the fields sync needs beyond a citation: `version` (this
   * item's own watermark, unused today but cheap to carry), `tags` (applied to the
   * Amplenote note at creation only — see sync-library.js, there's no confirmed API to
   * retag an existing note), `abstract`, and `url` (the item's own web-library permalink,
   * `links.alternate.href`, already on the envelope with no extra round trip).
   *
   * Deletions are a separate Zotero endpoint (`/items/trash` or a `deleted?since=` feed)
   * and are NOT handled here — the roadmap's trimmed scope keeps the incremental pull but
   * drops the deletion tail. A note whose Zotero item was deleted just stops being
   * touched by future syncs.
   */
  async function syncItems({ sinceVersion, pageSize = 50 } = {}) {
    const uid = await resolveUserID();
    const { items, lastModifiedVersion } = await paginate(`/users/${uid}/items/top`, {
      params: { itemType: "-attachment", include: "data,citation,bib" },
      sinceVersion,
      pageSize,
    });
    return { lastModifiedVersion, items: items.map(mapSyncItem) };
  }

  /** Zotero collections, for Phase 5's config picker and collection-scoped sync below.
   * Collections have a stable `key`, unlike tags — see `listTags`. */
  async function listCollections() {
    const uid = await resolveUserID();
    const { items } = await paginate(`/users/${uid}/collections`, { params: { include: "data" } });
    return items.map((c) => ({ key: c.key, name: c.data?.name || "(untitled collection)" }));
  }

  /** Every tag name used anywhere in the library. Zotero has no separate tag id/key —
   * a tag IS its name, which is also what `syncFilteredItems`'s `tag=` filter takes. */
  async function listTags() {
    const uid = await resolveUserID();
    const { items } = await paginate(`/users/${uid}/tags`);
    return [...new Set(items.map((t) => t.tag).filter(Boolean))].sort();
  }

  /**
   * Zotero's fixed catalog of item types — the bounty's "categories" axis. Unlike
   * collections/tags this is a global schema endpoint, not scoped to `/users/<uid>` or
   * to what's actually used in this library (no auth/userID needed at all). `attachment`
   * and `note` are excluded from what's returned: neither is ever synced as its own
   * top-level item note (see `syncItems`'s hard `itemType: "-attachment"`), so offering
   * them as selectable "categories" would be a checkbox that can never do anything.
   */
  async function listItemTypes() {
    const { items } = await paginate("/itemTypes");
    return items
      .filter((t) => t.itemType !== "attachment" && t.itemType !== "note")
      .map((t) => ({ itemType: t.itemType, name: t.localized || t.itemType }));
  }

  /**
   * Phase 5: same shape as `syncItems`, scoped to selected collections, tags, and/or
   * item types ("categories" in the bounty's wording), unioned — "in any selected
   * collection, OR carrying any selected tag, OR of any selected type" (checking more
   * boxes syncs more, matching how a filter checklist normally reads). Zotero has no
   * single query expressing an OR across these different kinds of criteria, so this
   * issues one request per selected collection (`/collections/<key>/items/top`) plus one
   * more `/items/top?tag=` request if any tags are selected, plus one more
   * `/items/top?itemType=` request if any types are selected, then de-duplicates by item
   * key. Costs roughly one extra Zotero request per selected collection (plus up to two
   * more) on top of a plain sync — accepted since Configure sync only runs when the user
   * changes what to sync, not on every Sync now.
   *
   * None of these requests also carries one of the OTHER filters: a collection-scoped
   * request narrowed by `tag=` (or `itemType=`) would mean "in this collection AND has
   * this tag," an AND, which is the opposite of the OR this is meant to express across
   * different kinds of selection.
   */
  async function syncFilteredItems({
    sinceVersion,
    collectionKeys = [],
    tagNames = [],
    itemTypes = [],
    pageSize = 50,
  } = {}) {
    const uid = await resolveUserID();
    const baseParams = { itemType: "-attachment", include: "data,citation,bib" };

    const byKey = new Map();
    let lastModifiedVersion = null;
    const mergeIn = async (path, params) => {
      const res = await paginate(path, { params, sinceVersion, pageSize });
      if (res.lastModifiedVersion !== null) {
        lastModifiedVersion = Math.max(lastModifiedVersion ?? 0, res.lastModifiedVersion);
      }
      for (const item of res.items) byKey.set(item.key, item);
    };

    for (const key of collectionKeys) {
      await mergeIn(`/users/${uid}/collections/${key}/items/top`, baseParams);
    }
    if (tagNames.length) {
      await mergeIn(`/users/${uid}/items/top`, { ...baseParams, tag: tagNames.join(" || ") });
    }
    if (itemTypes.length) {
      await mergeIn(`/users/${uid}/items/top`, { include: "data,citation,bib", itemType: itemTypes.join(" || ") });
    }

    return { lastModifiedVersion, items: [...byKey.values()].map(mapSyncItem) };
  }

  /** One item's direct children (attachments, standalone notes) — `include: "data"` is
   * enough here; no citation/bib needed for a child item. */
  async function getChildren(itemKey) {
    const uid = await resolveUserID();
    const { items } = await paginate(`/users/${uid}/items/${itemKey}/children`, {
      params: { include: "data" },
    });
    return items;
  }

  /**
   * Phase 4: an item's attachments and their annotations. Zotero nests annotations two
   * levels below a top-level item (item -> attachment -> annotation), so this costs one
   * children request for the item plus one per attachment found on it — acceptable for
   * a manual "Sync now" trigger, not something to run unbounded in a loop.
   *
   * Annotation TEXT (highlights) and COMMENTS import; annotation `image`/`ink` content
   * does not, for the same reason a PDF's own bytes don't (zotero-findings.md: no CORS
   * on Zotero's file storage) — those are named but not rendered. Sorted by Zotero's own
   * `annotationSortIndex` so imported highlights read in the PDF's own order.
   */
  async function getItemExtras(itemKey) {
    const children = await getChildren(itemKey);
    const attachments = children.filter((c) => c.data?.itemType === "attachment");

    const annotations = [];
    for (const attachment of attachments) {
      const grandchildren = await getChildren(attachment.key);
      for (const a of grandchildren) {
        if (a.data?.itemType !== "annotation") continue;
        // `annotationPosition` is a JSON *string* on the wire: {"pageIndex": N, ...},
        // 0-based. Parsed here so sync-library.js can build a page-precise
        // zotero://open-pdf link without re-parsing.
        let pageIndex = null;
        try {
          const pos = JSON.parse(a.data.annotationPosition || "{}");
          if (Number.isInteger(pos.pageIndex)) pageIndex = pos.pageIndex;
        } catch {
          // leave null — the link degrades to the attachment without a page
        }
        annotations.push({
          key: a.key,
          attachmentKey: attachment.key,
          type: a.data.annotationType || "",
          text: a.data.annotationText || "",
          comment: a.data.annotationComment || "",
          color: (a.data.annotationColor || "").toLowerCase(),
          pageLabel: a.data.annotationPageLabel || "",
          pageIndex,
          sortIndex: a.data.annotationSortIndex || "",
        });
      }
    }
    annotations.sort((x, y) => x.sortIndex.localeCompare(y.sortIndex));

    // Zotero's own notes on the item (child `note` items, HTML bodies) — what the
    // Obsidian reference plugin's "Import notes" pulls in. Kept paragraph-structured.
    const notes = children
      .filter((c) => c.data?.itemType === "note")
      .map((n) => ({ key: n.key, text: htmlToParagraphText(n.data.note || "") }))
      .filter((n) => n.text);

    return {
      attachments: attachments.map((a) => ({
        key: a.key,
        title: a.data?.title || "Attachment",
        url: a.links?.alternate?.href || null,
      })),
      annotations,
      notes,
    };
  }

  /**
   * A single item's current title, by its Zotero key — used to recover a note this
   * plugin lost track of (sync-library.js's `resolveNoteUUID`) when the sync state has
   * no title on record for it (an item this plugin has never touched since title
   * tracking was added). The Zotero key is always a reliable handle regardless of
   * anything going wrong on the Amplenote note-lookup side.
   */
  async function getItem(itemKey) {
    const uid = await resolveUserID();
    const res = await request(`/users/${uid}/items/${itemKey}`, { params: { include: "data" } });
    return { title: res.data?.data?.title || "(untitled)" };
  }

  return {
    request,
    paginate,
    keysCurrent,
    searchItems,
    syncItems,
    getItemExtras,
    getItem,
    listCollections,
    listTags,
    listItemTypes,
    syncFilteredItems,
  };
}
