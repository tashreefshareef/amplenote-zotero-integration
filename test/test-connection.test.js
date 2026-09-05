import { jest } from "@jest/globals";
import { testConnection } from "../src/actions/test-connection.js";
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

describe("testConnection", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("alerts to set the key when none is configured", async () => {
    const app = createMockApp();

    await testConnection(app);

    expect(app._calls.alerts[0]).toMatch(/Zotero API key/i);
  });

  test("alerts a success message with userID and access scope on a valid key", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "good-key" } });
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      fakeResponse({
        body: {
          userID: 16332327,
          username: "tashreef",
          access: { user: { library: true, files: true, notes: true } },
        },
      })
    );

    await testConnection(app);

    expect(app._calls.alerts[0]).toContain("tashreef");
    expect(app._calls.alerts[0]).toContain("16332327");
    expect(app._calls.alerts[0]).toContain("library");
  });

  test("alerts a clear message when the key is rejected", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "bad-key" } });
    jest.spyOn(globalThis, "fetch").mockResolvedValue(fakeResponse({ status: 403 }));

    await testConnection(app);

    expect(app._calls.alerts[0]).toMatch(/rejected/i);
  });

  test("alerts a rate-limit message with the wait time, not a raw error", async () => {
    const app = createMockApp({ settings: { "Zotero API key": "good-key" } });
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(fakeResponse({ status: 429, headers: { "Retry-After": "15" } }));

    await testConnection(app);

    expect(app._calls.alerts[0]).toMatch(/15s/);
  });
});
