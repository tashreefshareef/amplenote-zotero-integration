import { jest } from "@jest/globals";
import { pickCitation, insertCitationAtCursor, searchAndAppendCitation } from "../src/actions/citation-picker.js";
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

const KAHNEMAN = {
  key: "ABCD1234",
  data: { title: "Thinking, Fast and Slow" },
  citation: "<span>Kahneman, Thinking, Fast and Slow.</span>",
  bib: "<div>Kahneman. 2011.</div>",
};

function mockFetchSequence(...responses) {
  const fetchImpl = jest.fn();
  for (const r of responses) fetchImpl.mockResolvedValueOnce(r);
  jest.spyOn(globalThis, "fetch").mockImplementation(fetchImpl);
  return fetchImpl;
}

describe("pickCitation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("alerts and returns null when no key is configured", async () => {
    const app = createMockApp();

    const result = await pickCitation(app);

    expect(result).toBeNull();
    expect(app._calls.alerts[0]).toMatch(/Zotero API key/i);
  });

  test("returns null without any network call when the search prompt is cancelled", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: [null] });
    const fetchImpl = mockFetchSequence();

    const result = await pickCitation(app);

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("returns null for a blank query without calling the network", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: ["   "] });
    const fetchImpl = mockFetchSequence();

    const result = await pickCitation(app);

    expect(result).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("alerts a clear message when the Zotero search call fails", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: ["kahneman"] });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ status: 403 }) // search
    );

    const result = await pickCitation(app);

    expect(result).toBeNull();
    expect(app._calls.alerts[0]).toMatch(/Zotero API error/i);
  });

  test("alerts when nothing matches the query", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: ["nonexistent"] });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [] }));

    const result = await pickCitation(app);

    expect(result).toBeNull();
    expect(app._calls.alerts[0]).toMatch(/No Zotero items matched "nonexistent"/);
  });

  test("returns null when the results prompt is cancelled", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      promptQueue: ["kahneman", null],
    });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [KAHNEMAN] }));

    const result = await pickCitation(app);

    expect(result).toBeNull();
  });

  test("returns the matched result on a successful pick, offering the select by key", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      promptQueue: ["kahneman", "ABCD1234"],
    });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [KAHNEMAN] }));

    const result = await pickCitation(app);

    expect(result).toEqual({
      key: "ABCD1234",
      title: "Thinking, Fast and Slow",
      citation: "Kahneman, Thinking, Fast and Slow.",
      bib: "Kahneman. 2011.",
    });
    const selectPrompt = app._calls.prompts[1];
    expect(selectPrompt.options.inputs[0].type).toBe("select");
    expect(selectPrompt.options.inputs[0].options).toEqual([
      { label: "Kahneman, Thinking, Fast and Slow.", value: "ABCD1234" },
    ]);
  });
});

describe("insertCitationAtCursor", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("returns the citation text for insertText substitution", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      promptQueue: ["kahneman", "ABCD1234"],
    });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [KAHNEMAN] }));

    const text = await insertCitationAtCursor(app);

    expect(text).toBe("Kahneman, Thinking, Fast and Slow.");
  });

  test('returns "" rather than undefined when the flow is cancelled', async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: [null] });
    mockFetchSequence();

    const text = await insertCitationAtCursor(app);

    expect(text).toBe("");
  });
});

describe("searchAndAppendCitation", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("appends the citation to the note and alerts, on a successful pick", async () => {
    const app = createMockApp({
      notes: [{ uuid: "note-1", content: "Existing content\n" }],
      settings: { "Zotero API key": "k" },
      promptQueue: ["kahneman", "ABCD1234"],
    });
    mockFetchSequence(fakeResponse({ body: { userID: 1 } }), fakeResponse({ body: [KAHNEMAN] }));

    await searchAndAppendCitation(app);

    expect(app._notes.get("note-1").content).toBe("Existing content\nKahneman, Thinking, Fast and Slow.\n");
    expect(app._calls.alerts.at(-1)).toMatch(/^Appended:/);
  });

  test("does nothing to the note when the flow is cancelled", async () => {
    const app = createMockApp({
      notes: [{ uuid: "note-1", content: "Existing content\n" }],
      settings: { "Zotero API key": "k" },
      promptQueue: [null],
    });
    mockFetchSequence();

    await searchAndAppendCitation(app);

    expect(app._notes.get("note-1").content).toBe("Existing content\n");
    expect(app._calls.insertedContent).toHaveLength(0);
  });
});
