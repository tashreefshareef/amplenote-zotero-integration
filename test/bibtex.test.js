import { jest } from "@jest/globals";
import { formatCitation } from "../src/cite-key.js";
import { pickCitation, searchAndAppendCitation } from "../src/actions/citation-picker.js";
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

const KAHNEMAN = {
  key: "ABCD1234",
  title: "Thinking, Fast and Slow",
  citationKey: "",
  creators: [{ creatorType: "author", firstName: "Daniel", lastName: "Kahneman" }],
  date: "2011-10-25",
};

// The shape Zotero's exporter returned for a real item with no Citation Key, 2026-10-23:
// a `zotero-item-<id>` key, tab-indented fields, wrapped in newlines.
const ZOTERO_ENTRY = "\n@book{zotero-item-23099,\n\ttitle = {Thinking, Fast and Slow},\n\tyear = {2011},\n}\n";

describe("formatCitation — bibtex", () => {
  test("re-keys Zotero's entry so it matches the pandoc/LaTeX key for the same item", () => {
    const text = formatCitation({ ...KAHNEMAN, bibtex: ZOTERO_ENTRY.trim() }, "bibtex");
    expect(text.split("\n")[0]).toBe("@book{kahneman2011,");
    expect(text).toContain("title = {Thinking, Fast and Slow}");
    expect(formatCitation(KAHNEMAN, "pandoc")).toBe("[@kahneman2011]");
  });

  test("an item with a Citation Key keeps it", () => {
    const text = formatCitation({ ...KAHNEMAN, citationKey: "kahneman:thinking", bibtex: ZOTERO_ENTRY.trim() }, "bibtex");
    expect(text.split("\n")[0]).toBe("@book{kahneman:thinking,");
  });
});

describe("pickCitation — bibtex", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const SEARCH_HIT = {
    key: "ABCD1234",
    data: { title: "Thinking, Fast and Slow", creators: [{ lastName: "Kahneman" }], date: "2011" },
    citation: "<span>Kahneman.</span>",
    bib: "<div>Kahneman. 2011.</div>",
  };
  const EXPECTED = "@book{kahneman2011,\n\ttitle = {Thinking, Fast and Slow},\n\tyear = {2011},\n}";

  test("fetches the entry only once bibtex is picked, and re-keys it", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: ["kahneman", "ABCD1234", "bibtex"] });
    const fetchImpl = mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ body: [SEARCH_HIT] }),
      fakeResponse({ body: { key: "ABCD1234", bibtex: ZOTERO_ENTRY } })
    );

    const result = await pickCitation(app);

    // The search itself doesn't ask for BibTeX — that would render it for every result.
    expect(new URL(fetchImpl.mock.calls[1][0].toString()).searchParams.get("include")).not.toContain("bibtex");
    const url = new URL(fetchImpl.mock.calls[2][0].toString());
    expect(url.pathname).toBe("/users/1/items/ABCD1234");
    expect(url.searchParams.get("include")).toBe("bibtex");
    expect(result.text).toBe(EXPECTED);
  });

  test("Search citation appends it as a bibtex code block", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k", "Zotero citation format": "bibtex" },
      promptQueue: ["kahneman", "ABCD1234"],
      notes: [{ uuid: "n1", name: "Draft", content: "" }],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ body: [SEARCH_HIT] }),
      fakeResponse({ body: { key: "ABCD1234", bibtex: ZOTERO_ENTRY } })
    );

    await searchAndAppendCitation(app);

    expect(app._notes.get("n1").content).toBe("```bibtex\n" + EXPECTED + "\n```\n");
    expect(app._calls.alerts.at(-1)).toBe('Appended the BibTeX entry for "Thinking, Fast and Slow".');
  });

  test("an item Zotero returns no entry for says so instead of inserting nothing", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" }, promptQueue: ["kahneman", "ABCD1234", "bibtex"] });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ body: [SEARCH_HIT] }),
      fakeResponse({ body: { key: "ABCD1234" } })
    );

    expect(await pickCitation(app)).toBeNull();
    expect(app._calls.alerts[0]).toMatch(/no BibTeX entry/);
  });
});
