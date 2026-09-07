import { jest } from "@jest/globals";
import { configureSync } from "../src/actions/configure-sync.js";
import { createMockApp } from "./helpers.js";

function fakeResponse({ status = 200, headers = {}, body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function mockFetchSequence(...responses) {
  const fetchImpl = jest.fn();
  for (const r of responses) fetchImpl.mockResolvedValueOnce(r);
  jest.spyOn(globalThis, "fetch").mockImplementation(fetchImpl);
  return fetchImpl;
}

// Promise.all([listCollections(), listTags(), listItemTypes()]): the first two share one
// keysCurrent call (via resolveUserID); listItemTypes needs no auth at all and fires
// immediately, so it lands second in call order, ahead of collections/tags which only
// proceed once keysCurrent resolves. Fixed call order: keysCurrent, itemTypes,
// collections, tags.
function mockConfigFetches({ collections = [], tags = [], categories = [] } = {}) {
  return mockFetchSequence(
    fakeResponse({ body: { userID: 1 } }),
    fakeResponse({ body: categories }),
    fakeResponse({ body: collections }),
    fakeResponse({ body: tags })
  );
}

describe("configureSync", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("alerts and makes no network call when no key is configured", async () => {
    const app = createMockApp();
    const fetchImpl = mockFetchSequence();

    await configureSync(app);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(app._calls.alerts[0]).toMatch(/Zotero API key/i);
  });

  test("declares one checkbox input per collection/tag/category name, saves what's checked as human-readable text", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      // Positional: [Psychology, AI, favorite, to-read, Journal Article, Book]
      promptQueue: [[true, false, true, false, false, true]],
    });
    mockConfigFetches({
      collections: [{ key: "C1", data: { name: "Psychology" } }, { key: "C2", data: { name: "AI" } }],
      tags: [{ tag: "favorite" }, { tag: "to-read" }],
      categories: [
        { itemType: "journalArticle", localized: "Journal Article" },
        { itemType: "book", localized: "Book" },
      ],
    });

    await configureSync(app);

    const promptCall = app._calls.prompts[0];
    expect(promptCall.options.inputs).toEqual([
      { label: "Collection: Psychology", type: "checkbox" },
      { label: "Collection: AI", type: "checkbox" },
      { label: "Tag: favorite", type: "checkbox" },
      { label: "Tag: to-read", type: "checkbox" },
      { label: "Category: Journal Article", type: "checkbox" },
      { label: "Category: Book", type: "checkbox" },
    ]);

    expect(app.settings["Zotero sync filter"]).toBe("Collections: Psychology\nTags: favorite\nCategories: Book");
    expect(app._calls.alerts.at(-1)).toMatch(/Collections: Psychology/);
    expect(app._calls.alerts.at(-1)).toMatch(/Categories: Book/);
  });

  test("saves an empty filter (sync everything) when nothing is checked", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      promptQueue: [[false, false]],
    });
    mockConfigFetches({ collections: [{ key: "C1", data: { name: "Psychology" } }], tags: [{ tag: "favorite" }] });

    await configureSync(app);

    expect(app.settings["Zotero sync filter"]).toBe("");
    expect(app._calls.alerts.at(-1)).toMatch(/whole library/i);
  });

  test("leaves the setting untouched when the prompt is cancelled", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero sync filter": "Tags: favorite" },
      promptQueue: [null],
    });
    mockConfigFetches({ collections: [{ key: "C1", data: { name: "Psychology" } }], tags: [{ tag: "favorite" }] });

    await configureSync(app);

    expect(app.settings["Zotero sync filter"]).toBe("Tags: favorite");
    expect(app._calls.alerts).toHaveLength(0);
  });

  test("alerts and skips the prompt when the library has no collections, tags, or categories at all", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    mockConfigFetches({});

    await configureSync(app);

    expect(app._calls.prompts).toHaveLength(0);
    expect(app._calls.alerts[0]).toMatch(/nothing to filter by/i);
  });

  test("alerts a clear message when fetching collections/tags/categories fails", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    // Promise.all shares one keysCurrent call, then fires all three of their own
    // requests — only one needs to fail.
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ status: 403 }),
      fakeResponse({ status: 403 }),
      fakeResponse({ status: 403 })
    );

    await configureSync(app);

    expect(app._calls.alerts[0]).toMatch(/rejected the API key/i);
  });
});
