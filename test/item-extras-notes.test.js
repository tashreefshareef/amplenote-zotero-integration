import { jest } from "@jest/globals";
import { createZoteroClient } from "../src/zotero-client.js";

function fakeResponse({ status = 200, headers = {}, body = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("createZoteroClient#getItemExtras — Zotero child notes", () => {
  test("returns the item's child notes as paragraph text, skipping empty ones", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(
        fakeResponse({
          body: [
            { key: "N1", data: { itemType: "note", note: "<p>First &amp; foremost</p><p>Second</p>" } },
            { key: "N2", data: { itemType: "note", note: "<p></p>" } },
            { key: "ATT", data: { itemType: "attachment", title: "x.pdf" } },
          ],
        })
      )
      .mockResolvedValueOnce(fakeResponse({ body: [] })); // attachment's children
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const extras = await client.getItemExtras("ITEM1");

    expect(extras.notes).toEqual([{ key: "N1", text: "First & foremost\nSecond" }]);
    expect(extras.attachments).toHaveLength(1);
  });

  test("returns an empty notes list when the item has none", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(fakeResponse({ body: { userID: 1 } }))
      .mockResolvedValueOnce(fakeResponse({ body: [] }));
    const client = createZoteroClient({ apiKey: "k", fetchImpl });

    const extras = await client.getItemExtras("ITEM1");

    expect(extras.notes).toEqual([]);
  });
});
