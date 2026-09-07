import { jest } from "@jest/globals";
import { syncLibrary } from "../src/actions/sync-library.js";
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
  version: 10,
  data: { title: "Thinking, Fast and Slow", abstractNote: "A summary.", tags: [{ tag: "psychology" }] },
  citation: "<span>Kahneman, Thinking, Fast and Slow.</span>",
  bib: "<div>Kahneman. 2011.</div>",
  links: { alternate: { href: "https://www.zotero.org/tashreef/items/ABCD1234" } },
};

const CHILD_NOTE = {
  key: "NOTE1",
  data: { itemType: "note", note: '<div data-schema-version="9"><p>Comment: 56 + 12 pages</p><p>9 total figures</p></div>' },
};

function syncStateNote({ libraryVersion, items }) {
  const json = JSON.stringify({ libraryVersion, items });
  return { uuid: "sync-note-1", name: "Zotero Sync", content: `# Zotero Sync State\n\n\`\`\`json\n${json}\n\`\`\`\n` };
}

const SECTIONED = [
  "## Reference",
  "",
  "Old bib.",
  "",
  "## Zotero Notes",
  "",
  "_No Zotero notes._",
  "",
  "## Highlights & Notes",
  "",
  "_No highlights or notes yet._",
  "",
  "## My Notes",
  "",
  "This is MY thinking about the paper.",
  "",
  "## A heading I added myself",
  "",
  "More of my own text.",
  "",
].join("\n");

describe("sectioned item notes", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("a new note is created with the four sections in order, Zotero child notes included", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }), // keysCurrent
      fakeResponse({ headers: { "Last-Modified-Version": "99" }, body: [KAHNEMAN] }), // items/top
      fakeResponse({ body: [CHILD_NOTE] }) // children: one note, no attachments
    );

    await syncLibrary(app);

    const call = app._calls.createdNotes.find((c) => c.name === "Thinking, Fast and Slow");
    const content = app._notes.get(call.uuid).content;
    const order = ["## Reference", "## Zotero Notes", "## Highlights & Notes", "## My Notes"].map((h) => content.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(content).toContain("Kahneman. 2011.");
    expect(content).toContain("Comment: 56 + 12 pages\n9 total figures");
    expect(content).toContain("sync never touches it");
  });

  test("re-syncing a sectioned note rewrites only the sync-owned sections, leaving the user's text intact", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({ libraryVersion: 50, items: { ABCD1234: { noteUUID: "item-1", title: "Thinking, Fast and Slow" } } }),
        { uuid: "item-1", name: "Thinking, Fast and Slow", content: SECTIONED },
      ],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "101" }, body: [KAHNEMAN] }),
      fakeResponse({ body: [CHILD_NOTE] })
    );

    await syncLibrary(app);

    const content = app._notes.get("item-1").content;
    expect(content).toContain("Kahneman. 2011."); // Reference rewritten
    expect(content).not.toContain("Old bib.");
    expect(content).toContain("Comment: 56 + 12 pages"); // Zotero Notes rewritten
    expect(content).toContain("This is MY thinking about the paper."); // My Notes untouched
    expect(content).toContain("## A heading I added myself"); // user-added section untouched
    expect(content).toContain("More of my own text.");
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 1 updated, 0 highlights refreshed.");
  });

  test("a legacy note without a Reference heading is migrated once by a whole-note rewrite", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({ libraryVersion: 50, items: { ABCD1234: { noteUUID: "item-1", title: "Thinking, Fast and Slow" } } }),
        { uuid: "item-1", name: "Thinking, Fast and Slow", content: "stale bib\n\n## Highlights & Notes\n\n_No highlights or notes yet._\n" },
      ],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "101" }, body: [KAHNEMAN] }),
      fakeResponse({ body: [] })
    );

    await syncLibrary(app);

    const content = app._notes.get("item-1").content;
    expect(content).not.toContain("stale bib");
    expect(content).toContain("## Reference");
    expect(content).toContain("## My Notes");
  });

  test("the highlights-refresh pass also refreshes Zotero Notes on a sectioned note the item sync didn't touch", async () => {
    const app = createMockApp({
      settings: { "Zotero API key": "k" },
      notes: [
        syncStateNote({ libraryVersion: 50, items: { OTHR1: { noteUUID: "item-2", title: "Other" } } }),
        { uuid: "item-2", name: "Other", content: SECTIONED },
      ],
    });
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "50" }, body: [] }), // nothing changed at item level
      fakeResponse({ body: [CHILD_NOTE] }) // children of OTHR1
    );

    await syncLibrary(app);

    const content = app._notes.get("item-2").content;
    expect(content).toContain("Comment: 56 + 12 pages");
    expect(content).toContain("This is MY thinking about the paper.");
    expect(content).toContain("Old bib."); // Reference is NOT rewritten in the refresh pass
    expect(app._calls.alerts.at(-1)).toBe("Zotero sync complete: 0 new, 0 updated, 1 highlights refreshed.");
  });

  test("a highlight renders its color name and a page-precise zotero://open-pdf link", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "k" } });
    const attachment = { key: "ATT1", data: { itemType: "attachment", title: "paper.pdf" }, links: {} };
    const highlight = {
      key: "ANN1",
      data: {
        itemType: "annotation",
        annotationType: "highlight",
        annotationText: "System 1 and System 2",
        annotationComment: "key idea",
        annotationColor: "#ffd400",
        annotationPageLabel: "12",
        annotationPosition: JSON.stringify({ pageIndex: 12, rects: [] }),
        annotationSortIndex: "00001",
      },
    };
    mockFetchSequence(
      fakeResponse({ body: { userID: 1 } }),
      fakeResponse({ headers: { "Last-Modified-Version": "99" }, body: [KAHNEMAN] }),
      fakeResponse({ body: [attachment] }),
      fakeResponse({ body: [highlight] })
    );

    await syncLibrary(app);

    const call = app._calls.createdNotes.find((c) => c.name === "Thinking, Fast and Slow");
    const content = app._notes.get(call.uuid).content;
    expect(content).toContain(
      "> **(Yellow)** System 1 and System 2 (p. 12) — [Open in Zotero](zotero://open-pdf/library/items/ATT1?page=13)"
    );
    expect(content).toContain("_Comment: key idea_");
  });
});
