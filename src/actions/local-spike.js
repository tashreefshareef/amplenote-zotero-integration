/**
 * ⚠️ SPIKE — delete once answered. Registered in plugin.js under "Zotero: Local API spike".
 *
 * Question: can plugin code reach the Zotero desktop app's local server
 * (http://localhost:23119) from inside Amplenote? If it can, PDFs could be pulled straight
 * off the user's disk instead of from Zotero's cloud storage — which the browser's CORS
 * rule keeps the plugin from reading (docs/zotero-findings.md).
 *
 * What's already measured from outside (2026-09-21):
 *   - Zotero 10.0.1 answers on 23119; its preflight reply carries NO
 *     Access-Control-Allow-Origin, so a cross-origin script is expected to be refused.
 *   - The public amplenote.com page has a `connect-src` CSP that refuses localhost before
 *     any request leaves the browser. But that page's CSP doesn't list api.zotero.org
 *     either, and the plugin reaches that fine — so the sandbox's policy is different and
 *     only a run inside it settles this.
 *
 * Each probe reports one of three outcomes, which are what we're actually distinguishing:
 *   - CSP block  → "Failed to fetch" for the `no-cors` ping too (never left the browser)
 *   - CORS block → `no-cors` ping succeeds opaque, the readable ones fail
 *   - readable   → status + body: the route is open
 */
export async function localApiSpike(app) {
  const results = { origin: typeof location !== "undefined" ? location.origin : "?" };

  async function probe(name, url, init) {
    try {
      const r = await fetch(url, init);
      results[name] = {
        type: r.type,
        status: r.status,
        acao: r.headers.get("access-control-allow-origin"),
        body: (await r.text()).slice(0, 60),
      };
    } catch (e) {
      results[name] = { error: String(e) };
    }
  }

  for (const host of ["localhost", "127.0.0.1"]) {
    const base = `http://${host}:23119`;
    await probe(`${host} ping (no-cors)`, `${base}/connector/ping`, { mode: "no-cors" });
    await probe(`${host} ping`, `${base}/connector/ping`);
    await probe(`${host} local api`, `${base}/api/users/0/items?limit=1`);
    await probe(`${host} bbt json-rpc`, `${base}/better-bibtex/json-rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "item.search", params: ["a"], id: 1 }),
    });
  }

  const text = JSON.stringify(results, null, 2);
  console.log("[local-spike]", text);
  await app.alert(text);
}
