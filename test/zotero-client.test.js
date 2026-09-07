import { jest } from "@jest/globals";
import {
  createZoteroClient,
  parseLinkHeader,
  ZoteroApiError,
  ZoteroRateLimitedError,
} from "../src/zotero-client.js";

function fakeResponse({ status = 200, headers = {}, body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("parseLinkHeader", () => {
  test("extracts rel targets from a real Zotero-shaped Link header", () => {
    const header =
      '<https://api.zotero.org/users/1/items?start=50>; rel="next", ' +
      '<https://api.zotero.org/users/1/items?start=450>; rel="last"';
    expect(parseLinkHeader(header)).toEqual({
      next: "https://api.zotero.org/users/1/items?start=50",
      last: "https://api.zotero.org/users/1/items?start=450",
    });
  });

  test("returns {} for a missing header", () => {
    expect(parseLinkHeader(null)).toEqual({});
  });
});

describe("createZoteroClient#request", () => {
  test("sends the API key as a header, never in the URL", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ body: [] }));
    const client = createZoteroClient({ apiKey: "secret-key", fetchImpl });

    await client.request("/users/1/items");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).not.toContain("secret-key");
    expect(init.headers["Zotero-API-Key"]).toBe("secret-key");
    expect(init.headers["Zotero-API-Version"]).toBe("3");
  });

  test("appends since= for incremental sync", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ body: [] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    await client.request("/users/1/items", { sinceVersion: 42 });

    const [url] = fetchImpl.mock.calls[0];
    expect(new URL(url).searchParams.get("since")).toBe("42");
  });

  test("exposes Last-Modified-Version, Total-Results and parsed Link", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      fakeResponse({
        headers: {
          "Last-Modified-Version": "123",
          "Total-Results": "7",
          Link: '<https://api.zotero.org/users/1/items?start=50>; rel="next"',
        },
        body: [{ key: "ABCD1234" }],
      })
    );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const res = await client.request("/users/1/items");

    expect(res.lastModifiedVersion).toBe(123);
    expect(res.totalResults).toBe(7);
    expect(res.links.next).toBe("https://api.zotero.org/users/1/items?start=50");
    expect(res.data).toEqual([{ key: "ABCD1234" }]);
  });

  test("treats 304 as notModified with no body parse", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ status: 304 }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const res = await client.request("/users/1/items", { ifModifiedSinceVersion: 5 });

    expect(res.notModified).toBe(true);
    expect(res.data).toBeNull();
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.headers["If-Unmodified-Since-Version"]).toBe("5");
  });

  test("throws ZoteroRateLimitedError on 429, carrying Retry-After", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(fakeResponse({ status: 429, headers: { "Retry-After": "30" } }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    await expect(client.request("/users/1/items")).rejects.toMatchObject(
      new ZoteroRateLimitedError(429, 30)
    );
  });

  test("throws ZoteroApiError on other non-ok statuses", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ status: 403 }));
    const client = createZoteroClient({ apiKey: "bad-key", fetchImpl });

    await expect(client.request("/users/1/items")).rejects.toBeInstanceOf(ZoteroApiError);
  });
});

describe("createZoteroClient#paginate", () => {
  test("follows Link: rel=next across pages and aggregates items", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({
          headers: {
            Link: '<https://api.zotero.org/users/1/items?start=1>; rel="next"',
            "Last-Modified-Version": "10",
          },
          body: [{ key: "A" }],
        })
      )
      .mockResolvedValueOnce(
        fakeResponse({ headers: { "Last-Modified-Version": "10" }, body: [{ key: "B" }] })
      );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const { items, lastModifiedVersion } = await client.paginate("/users/1/items");

    expect(items).toEqual([{ key: "A" }, { key: "B" }]);
    expect(lastModifiedVersion).toBe(10);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Second call hits the fully-qualified next URL as-is, no duplicated params.
    expect(String(fetchImpl.mock.calls[1][0])).toBe("https://api.zotero.org/users/1/items?start=1");
  });

  test("pauses between pages on a Backoff header, without retrying the request itself", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        fakeResponse({
          headers: {
            Backoff: "2",
            Link: '<https://api.zotero.org/users/1/items?start=1>; rel="next"',
          },
          body: [{ key: "A" }],
        })
      )
      .mockResolvedValueOnce(fakeResponse({ body: [{ key: "B" }] }));
    const sleepImpl = jest.fn().mockResolvedValue();
    const client = createZoteroClient({ apiKey: "k", fetchImpl, sleepImpl });

    await client.paginate("/users/1/items");

    expect(sleepImpl).toHaveBeenCalledWith(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("createZoteroClient#keysCurrent", () => {
  test("returns the parsed key info", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      fakeResponse({ body: { key: "x", userID: 16332327, username: "tashreef", access: { user: { library: true } } } })
    );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const info = await client.keysCurrent();

    expect(info.userID).toBe(16332327);
    expect(fetchImpl.mock.calls[0][0].toString()).toBe("https://api.zotero.org/keys/current");
  });
});

describe("createZoteroClient#searchItems", () => {
  function itemFixture(overrides = {}) {
    return {
      key: "ABCD1234",
      data: { title: "Thinking, Fast and Slow" },
      citation: "<span>Kahneman, <i>Thinking, Fast and Slow</i>.</span>",
      bib: '<div class="csl-bib-body">Kahneman. Thinking, Fast and Slow. 2011.</div>',
      ...overrides,
    };
  }

  test("resolves the userID once via keysCurrent, then reuses it", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 16332327 } })) // keysCurrent
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture()] })) // search 1
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture()] })); // search 2
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    await client.searchItems({ query: "kahneman" });
    await client.searchItems({ query: "kahneman again" });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0].toString()).toBe("https://api.zotero.org/keys/current");
    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/16332327/items/top");
    expect(fetchImpl.mock.calls[2][0].toString()).toContain("/users/16332327/items/top");
  });

  test("two concurrent first-time calls share one keysCurrent request, not two", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 16332327 } })) // keysCurrent
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture()] }))
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture()] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    await Promise.all([client.searchItems({ query: "a" }), client.searchItems({ query: "b" })]);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.filter((c) => c[0].toString().endsWith("/keys/current"))).toHaveLength(1);
  });

  test("skips resolving the userID when it's already known", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ body: [itemFixture()] }));
    const client = createZoteroClient({ apiKey: "k", userID: 16332327, fetchImpl });

    await client.searchItems({ query: "kahneman" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0].toString()).toContain("/users/16332327/items/top");
  });

  test("sends the query, quick-search mode, and citation/bib includes", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ body: [itemFixture()] }));
    const client = createZoteroClient({ apiKey: "k", userID: 1, fetchImpl });

    await client.searchItems({ query: "kahneman" });

    const url = new URL(fetchImpl.mock.calls[0][0].toString());
    expect(url.pathname).toBe("/users/1/items/top");
    expect(url.searchParams.get("q")).toBe("kahneman");
    expect(url.searchParams.get("qmode")).toBe("titleCreatorYear");
    expect(url.searchParams.get("itemType")).toBe("-attachment");
    expect(url.searchParams.get("include")).toBe("data,citation,bib");
    expect(url.searchParams.get("style")).toBe("chicago-note-bibliography");
  });

  test("returns results with citation/bib already stripped of HTML", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(fakeResponse({ body: [itemFixture()] }));
    const client = createZoteroClient({ apiKey: "k", userID: 1, fetchImpl });

    const results = await client.searchItems({ query: "kahneman" });

    expect(results).toEqual([
      {
        key: "ABCD1234",
        title: "Thinking, Fast and Slow",
        citation: "Kahneman, Thinking, Fast and Slow.",
        bib: "Kahneman. Thinking, Fast and Slow. 2011.",
      },
    ]);
  });

  test("falls back to a placeholder title when an item has none", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(fakeResponse({ body: [itemFixture({ data: {} })] }));
    const client = createZoteroClient({ apiKey: "k", userID: 1, fetchImpl });

    const [result] = await client.searchItems({ query: "kahneman" });

    expect(result.title).toBe("(untitled)");
  });
});

describe("createZoteroClient#syncItems", () => {
  function itemFixture(overrides = {}) {
    return {
      key: "ABCD1234",
      version: 10,
      data: { title: "Thinking, Fast and Slow", abstractNote: "A summary.", tags: [{ tag: "psychology" }] },
      citation: "<span>Kahneman, Thinking, Fast and Slow.</span>",
      bib: "<div>Kahneman. 2011.</div>",
      links: { alternate: { href: "https://www.zotero.org/tashreef/items/ABCD1234" } },
      ...overrides,
    };
  }

  test("omits since= on a first, full sync", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    await client.syncItems({});

    const url = new URL(fetchImpl.mock.calls[1][0].toString());
    expect(url.searchParams.has("since")).toBe(false);
    expect(url.searchParams.get("itemType")).toBe("-attachment");
  });

  test("passes sinceVersion through for an incremental sync", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    await client.syncItems({ sinceVersion: 50 });

    const url = new URL(fetchImpl.mock.calls[1][0].toString());
    expect(url.searchParams.get("since")).toBe("50");
  });

  test("maps items to the fields sync needs, with tags flattened and HTML stripped", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ headers: { "Last-Modified-Version": "99" }, body: [itemFixture()] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const result = await client.syncItems({});

    expect(result.lastModifiedVersion).toBe(99);
    expect(result.items).toEqual([
      {
        key: "ABCD1234",
        version: 10,
        title: "Thinking, Fast and Slow",
        abstract: "A summary.",
        tags: ["psychology"],
        citation: "Kahneman, Thinking, Fast and Slow.",
        bib: "Kahneman. 2011.",
        url: "https://www.zotero.org/tashreef/items/ABCD1234",
      },
    ]);
  });

  test("defaults abstract/tags/url when the item carries none", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(
        fakeResponse({ body: [itemFixture({ data: { title: "Bare Item" }, links: {} })] })
      );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const [result] = (await client.syncItems({})).items;

    expect(result).toMatchObject({ abstract: "", tags: [], url: null });
  });
});

describe("createZoteroClient#getItemExtras", () => {
  const attachment = {
    key: "ATT1",
    data: { itemType: "attachment", title: "Kahneman.pdf" },
    links: { alternate: { href: "https://www.zotero.org/tashreef/items/ATT1" } },
  };

  function annotationFixture(overrides = {}) {
    return {
      key: "ANN1",
      data: {
        itemType: "annotation",
        annotationType: "highlight",
        annotationText: "text",
        annotationComment: "",
        annotationPageLabel: "1",
        annotationSortIndex: "00001",
        ...overrides,
      },
    };
  }

  test("fetches the item's children, then each attachment's children, filtering to attachment/annotation types", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } })) // keysCurrent
      .mockResolvedValueOnce(fakeResponse({ body: [attachment, { key: "N1", data: { itemType: "note" } }] })) // item's children
      .mockResolvedValueOnce(fakeResponse({ body: [annotationFixture()] })); // attachment's children
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const extras = await client.getItemExtras("ITEM1");

    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/items/ITEM1/children");
    expect(fetchImpl.mock.calls[2][0].toString()).toContain("/users/1/items/ATT1/children");
    expect(extras.attachments).toEqual([
      { key: "ATT1", title: "Kahneman.pdf", url: "https://www.zotero.org/tashreef/items/ATT1" },
    ]);
    expect(extras.annotations).toHaveLength(1);
    expect(extras.annotations[0]).toMatchObject({ key: "ANN1", type: "highlight", text: "text" });
  });

  test("sorts annotations by Zotero's own sortIndex", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [attachment] }))
      .mockResolvedValueOnce(
        fakeResponse({
          body: [
            annotationFixture({ annotationText: "second", annotationSortIndex: "00002" }),
            annotationFixture({ annotationText: "first", annotationSortIndex: "00001" }),
          ],
        })
      );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const { annotations } = await client.getItemExtras("ITEM1");

    expect(annotations.map((a) => a.text)).toEqual(["first", "second"]);
  });

  test("returns no annotations for an item with no attachments, without fetching further", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const extras = await client.getItemExtras("ITEM1");

    expect(extras).toEqual({ attachments: [], annotations: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("createZoteroClient#getItem", () => {
  test("fetches one item by key and returns its title", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: { key: "ITEM1", data: { title: "A Title" } } }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const item = await client.getItem("ITEM1");

    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/items/ITEM1");
    expect(item).toEqual({ title: "A Title" });
  });

  test("falls back to a placeholder title when the item has none", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: { key: "ITEM1", data: {} } }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const item = await client.getItem("ITEM1");

    expect(item.title).toBe("(untitled)");
  });
});

describe("createZoteroClient#listCollections", () => {
  test("returns key/name pairs", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(
        fakeResponse({ body: [{ key: "C1", data: { name: "Psychology" } }, { key: "C2", data: { name: "AI" } }] })
      );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const collections = await client.listCollections();

    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/collections");
    expect(collections).toEqual([
      { key: "C1", name: "Psychology" },
      { key: "C2", name: "AI" },
    ]);
  });
});

describe("createZoteroClient#listTags", () => {
  test("returns deduplicated, sorted tag names", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [{ tag: "favorite" }, { tag: "to-read" }, { tag: "favorite" }] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const tags = await client.listTags();

    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/tags");
    expect(tags).toEqual(["favorite", "to-read"]);
  });
});

describe("createZoteroClient#listItemTypes", () => {
  test("returns itemType/name pairs, excluding attachment and note", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(
      fakeResponse({
        body: [
          { itemType: "journalArticle", localized: "Journal Article" },
          { itemType: "attachment", localized: "Attachment" },
          { itemType: "note", localized: "Note" },
          { itemType: "book", localized: "Book" },
        ],
      })
    );
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const types = await client.listItemTypes();

    expect(fetchImpl).toHaveBeenCalledTimes(1); // no /keys/current -- a global, unauthenticated schema endpoint
    expect(new URL(fetchImpl.mock.calls[0][0].toString()).pathname).toBe("/itemTypes");
    expect(types).toEqual([
      { itemType: "journalArticle", name: "Journal Article" },
      { itemType: "book", name: "Book" },
    ]);
  });

  test("falls back to the raw itemType key when localized is missing", async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(fakeResponse({ body: [{ itemType: "map" }] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const [type] = await client.listItemTypes();

    expect(type).toEqual({ itemType: "map", name: "map" });
  });
});

describe("createZoteroClient#syncFilteredItems", () => {
  function itemFixture(key, title) {
    return { key, data: { title }, citation: `<span>${title}</span>`, bib: `<div>${title}</div>` };
  }

  test("issues one request per selected collection and unions the results", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } })) // keysCurrent
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] })) // collection C1
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("B", "Item B")] })); // collection C2
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const result = await client.syncFilteredItems({ collectionKeys: ["C1", "C2"] });

    expect(fetchImpl.mock.calls[1][0].toString()).toContain("/users/1/collections/C1/items/top");
    expect(fetchImpl.mock.calls[2][0].toString()).toContain("/users/1/collections/C2/items/top");
    expect(result.items.map((i) => i.key).sort()).toEqual(["A", "B"]);
  });

  test("de-duplicates an item present in more than one selected collection", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] }))
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const result = await client.syncFilteredItems({ collectionKeys: ["C1", "C2"] });

    expect(result.items).toHaveLength(1);
  });

  test("adds one more request with tag= (joined with ||) when tags are selected too", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] })) // collection C1
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("B", "Item B")] })); // tag-filtered items/top
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const result = await client.syncFilteredItems({ collectionKeys: ["C1"], tagNames: ["favorite", "to-read"] });

    const tagUrl = new URL(fetchImpl.mock.calls[2][0].toString());
    expect(tagUrl.pathname).toBe("/users/1/items/top");
    expect(tagUrl.searchParams.get("tag")).toBe("favorite || to-read");
    expect(result.items.map((i) => i.key).sort()).toEqual(["A", "B"]);
  });

  test("a collection-scoped request does not also carry tag= (union, not intersection)", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [] }))
      .mockResolvedValueOnce(fakeResponse({ body: [] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    await client.syncFilteredItems({ collectionKeys: ["C1"], tagNames: ["favorite"] });

    const collectionUrl = new URL(fetchImpl.mock.calls[1][0].toString());
    expect(collectionUrl.searchParams.has("tag")).toBe(false);
  });

  test("takes the highest lastModifiedVersion across the merged requests", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ headers: { "Last-Modified-Version": "10" }, body: [] }))
      .mockResolvedValueOnce(fakeResponse({ headers: { "Last-Modified-Version": "25" }, body: [] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const result = await client.syncFilteredItems({ collectionKeys: ["C1", "C2"] });

    expect(result.lastModifiedVersion).toBe(25);
  });

  test("adds one more request with itemType= (joined with ||) when categories are selected too", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] })); // itemType-filtered items/top
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const result = await client.syncFilteredItems({ itemTypes: ["journalArticle", "book"] });

    const url = new URL(fetchImpl.mock.calls[1][0].toString());
    expect(url.pathname).toBe("/users/1/items/top");
    expect(url.searchParams.get("itemType")).toBe("journalArticle || book");
    expect(result.items.map((i) => i.key)).toEqual(["A"]);
  });

  test("de-duplicates across all three filter dimensions", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] })) // collection
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] })) // tag
      .mockResolvedValueOnce(fakeResponse({ body: [itemFixture("A", "Item A")] })); // category
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const result = await client.syncFilteredItems({
      collectionKeys: ["C1"],
      tagNames: ["favorite"],
      itemTypes: ["journalArticle"],
    });

    expect(result.items).toHaveLength(1);
  });
});
