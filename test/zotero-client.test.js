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
