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

  test("declares one checkbox input per collection/tag name, saves what's checked as human-readable text", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      // Positional: [Psychology collection, AI collection, favorite tag, to-read tag]
      promptQueue: [[true, false, true, false]],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ body: [{ key: "C1", data: { name: "Psychology" } }, { key: "C2", data: { name: "AI" } }] }),
      fakeResponse({ body: [{ tag: "favorite" }, { tag: "to-read" }] })
    );

    await configureSync(app);

    const promptCall = app._calls.prompts[0];
    expect(promptCall.options.inputs).toEqual([
      { label: "Collection: Psychology", type: "checkbox" },
      { label: "Collection: AI", type: "checkbox" },
      { label: "Tag: favorite", type: "checkbox" },
      { label: "Tag: to-read", type: "checkbox" },
    ]);

    expect(app.settings["Zotero sync filter"]).toBe("Collections: Psychology\nTags: favorite");
    expect(app._calls.alerts.at(-1)).toMatch(/Collections: Psychology/);
  });

  test("saves an empty filter (sync everything) when nothing is checked", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      promptQueue: [[false, false]],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ body: [{ key: "C1", data: { name: "Psychology" } }] }),
      fakeResponse({ body: [{ tag: "favorite" }] })
    );

    await configureSync(app);

    expect(app.settings["Zotero sync filter"]).toBe("");
    expect(app._calls.alerts.at(-1)).toMatch(/whole library/i);
  });

  test("leaves the setting untouched when the prompt is cancelled", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero sync filter": "Tags: favorite" },
      promptQueue: [null],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ body: [{ key: "C1", data: { name: "Psychology" } }] }),
      fakeResponse({ body: [{ tag: "favorite" }] })
    );

    await configureSync(app);

    expect(app.settings["Zotero sync filter"]).toBe("Tags: favorite");
    expect(app._calls.alerts).toHaveLength(0);
  });

  test("alerts and skips the prompt when the library has no collections or tags at all", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [] }), fakeResponse({ body: [] }));

    await configureSync(app);

    expect(app._calls.prompts).toHaveLength(0);
    expect(app._calls.alerts[0]).toMatch(/nothing to filter by/i);
  });

  test("alerts a clear message when fetching collections/tags fails", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    // Promise.all([listCollections(), listTags()]) shares one keysCurrent call, then
    // fires both of their own requests — both fail here, only one needs to.
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ status: 403 }),
      fakeResponse({ status: 403 })
    );

    await configureSync(app);

    expect(app._calls.alerts[0]).toMatch(/Zotero API error/i);
  });
});
