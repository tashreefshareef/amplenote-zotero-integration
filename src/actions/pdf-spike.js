import { SETTING_ZOTERO_API_KEY, ZOTERO_API_BASE } from "../constants.js";
import { createZoteroClient } from "../zotero-client.js";

/**
 * ⚠️ SPIKE — DELETE AFTER IT ANSWERS ITS QUESTIONS. Modeled on Phase 0's probe plugin
 * (zotero-findings.md): one round trip that answers several live questions at once,
 * then gets removed.
 *
 * The question: can a Zotero PDF be VIEWED inside Amplenote ("seamless viewing within
 * the same interface", the bounty's Document Attachment Integration bullet)?
 *
 * Why it's open again after Phase 0 said no. Phase 0 spike #2/#3 asked whether the
 * plugin could READ a Zotero PDF's BYTES, for PDF.js. It concluded no: `/items/<key>/file`
 * 302s to S3, S3 sends no CORS header, and Amplenote's `cors-proxy` returned 400. Two
 * things were wrong with treating that as "viewing is impossible":
 *
 *   1. **CORS governs `fetch`/XHR, not `<iframe>`.** An iframe pointed at a PDF renders
 *      it in the browser's own viewer with no CORS involved. api-notes.md even lists
 *      this (as option 3 for the PDF Annotator) but dismissed it there because that
 *      project needed a TEXT LAYER for highlighting. Viewing needs no text layer.
 *   2. **The proxy was only ever given the REDIRECTING url** (`/items/<key>/file`).
 *      Zotero also exposes `/items/<key>/file/view/url`, which returns the presigned S3
 *      url as TEXT — and api.zotero.org is CORS-open, so the plugin can read that string
 *      even though it can't read the file bytes. Handing the proxy an already-resolved
 *      presigned url is untested. (Probing the proxy with curl can't settle it either:
 *      it 400s on every url from curl, including non-Zotero ones, so it's rejecting the
 *      caller, not the target.)
 *
 * So this reports, from inside a real embed:
 *   A. does `/file/view/url` return a presigned url?
 *   B. does an `<iframe>` of that url render (i.e. does Amplenote's embed CSP allow
 *      `frame-src` to Zotero's S3 host)? — the simple path, no proxy, no bytes.
 *   C. does `cors-proxy` return BYTES for the RESOLVED url? — the full path, which would
 *      let the PDF Annotator's PDF.js viewer be reused wholesale.
 *
 * B alone is enough for "seamless viewing". C would additionally give a text layer.
 */

const SPIKE_HEADING = "Zotero PDF viewer spike";

/** First stored PDF attachment in the library, or null. */
async function findPdfAttachment(client) {
  const uid = await client.keysCurrent().then((k) => k.userID);
  const res = await client.request(`/users/${uid}/items`, {
    params: { itemType: "attachment", limit: 100, include: "data" },
  });
  const pdf = (res.data || []).find(
    (i) => i.data?.contentType === "application/pdf" && String(i.data?.linkMode || "").startsWith("imported")
  );
  return pdf ? { key: pdf.key, title: pdf.data.title || "(untitled)", uid } : null;
}

/** appOption: "Zotero: PDF viewer spike" — drops the embed into the current note. */
export async function insertPdfSpike(app) {
  const apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  if (!apiKey) {
    await app.alert(`Set the "${SETTING_ZOTERO_API_KEY}" row first.`);
    return;
  }

  const client = createZoteroClient({ apiKey });
  let attachment;
  try {
    attachment = await findPdfAttachment(client);
  } catch (e) {
    await app.alert(`Couldn't list attachments: ${e.message}`);
    return;
  }
  if (!attachment) {
    await app.alert("No stored PDF attachment found in your Zotero library — nothing to test with.");
    return;
  }

  // The plugin's own note uuid is what `plugin://` needs. Look it up by name rather than
  // asking the user to paste it (api-notes.md has no confirmed way to get it from `app`).
  const pluginNote = await app.findNote({ name: "Zotero Integration" });
  if (!pluginNote) {
    await app.alert('Could not find a note named "Zotero Integration" to embed from.');
    return;
  }

  const tag = `<object data="plugin://${pluginNote.uuid}?spike=pdf&att=${attachment.key}" data-aspect-ratio="0.8" />`;
  await app.insertNoteContent(
    { uuid: app.context.noteUUID },
    `\n# ${SPIKE_HEADING}\n\nTesting with: ${attachment.title} (${attachment.key})\n\n${tag}\n`,
    { atEnd: true }
  );
  await app.alert(`Spike embed added at the end of this note, testing with "${attachment.title}".`);
}

/** Plugin-side half of the bridge: hands the embed what it needs to run the probes. */
export async function spikeEmbedCall(app, value) {
  let msg;
  try {
    msg = JSON.parse(value);
  } catch {
    return JSON.stringify({ error: "bad payload" });
  }
  if (msg.action !== "config") return JSON.stringify({ error: `unknown action ${msg.action}` });

  const apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  const client = createZoteroClient({ apiKey });
  const uid = await client.keysCurrent().then((k) => k.userID);
  return JSON.stringify({ apiKey, uid, base: ZOTERO_API_BASE });
}

/**
 * The embed. Runs the three probes IN the embed's own origin, which is the only place
 * the CSP question (B) can be answered. Everything is reported on screen — nothing here
 * writes to a note.
 */
export function renderPdfSpike(app, args) {
  const params = new URLSearchParams(args || "");
  const att = params.get("att") || "";
  return `<!doctype html>
<meta charset="utf-8">
<style>
  body { font: 13px/1.5 system-ui, sans-serif; margin: 8px; color: #222; }
  h2 { font-size: 14px; margin: 0 0 6px; }
  .row { margin: 4px 0; padding: 4px 6px; border-left: 3px solid #ccc; background: #f7f7f7; }
  .ok { border-color: #2e7d32; } .bad { border-color: #c62828; } .wait { border-color: #999; }
  code { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; }
  iframe { width: 100%; height: 420px; border: 1px solid #bbb; margin-top: 8px; }
</style>
<h2>Zotero PDF viewer spike</h2>
<div id="out"></div>
<div id="frame"></div>
<script>
(function () {
  var out = document.getElementById("out");
  function say(id, cls, text) {
    var el = document.getElementById(id);
    if (!el) { el = document.createElement("div"); el.id = id; out.appendChild(el); }
    el.className = "row " + cls;
    el.innerHTML = text;
  }
  say("a", "wait", "A. Resolving presigned url…");

  function probe(cfg) {
    var base = cfg.base, key = cfg.apiKey, uid = cfg.uid, att = ${JSON.stringify(att)};
    var viewUrl = base + "/users/" + uid + "/items/" + att + "/file/view/url";

    // A — does /file/view/url hand back a presigned url? api.zotero.org is CORS-open, so
    // reading this STRING should work even though reading the file's bytes doesn't.
    fetch(viewUrl, { headers: { "Zotero-API-Key": key, "Zotero-API-Version": "3" } })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); })
      .then(function (res) {
        if (res.status !== 200 || !/^https?:/.test(res.text.trim())) {
          say("a", "bad", "A. FAILED — /file/view/url returned HTTP " + res.status +
            ": <code>" + res.text.slice(0, 200) + "</code>");
          return;
        }
        var url = res.text.trim();
        say("a", "ok", "A. OK — presigned url returned (HTTP 200):<br><code>" + url.slice(0, 160) + "…</code>");

        // B — iframe it. No CORS involved; this tests Amplenote's embed CSP frame-src.
        say("b", "wait", "B. Trying &lt;iframe&gt; of that url — if a PDF appears below, viewing works.");
        var f = document.createElement("iframe");
        f.src = url;
        f.onload = function () { say("b", "ok", "B. iframe fired onload — check below: is a PDF visible?"); };
        f.onerror = function () { say("b", "bad", "B. iframe errored."); };
        document.getElementById("frame").appendChild(f);
        setTimeout(function () {
          var el = document.getElementById("b");
          if (el && /Trying/.test(el.textContent)) {
            say("b", "bad", "B. iframe never loaded (likely CSP frame-src). Check the console for a CSP violation.");
          }
        }, 6000);

        // C — proxy the RESOLVED url (Phase 0 only ever proxied the redirecting one).
        say("c", "wait", "C. Trying cors-proxy on the RESOLVED url…");
        var proxied = "https://plugins.amplenote.com/cors-proxy?apiurl=" + encodeURIComponent(url);
        fetch(proxied)
          .then(function (r) {
            return r.arrayBuffer().then(function (b) { return { status: r.status, bytes: b.byteLength }; });
          })
          .then(function (r) {
            if (r.status === 200 && r.bytes > 1000) {
              say("c", "ok", "C. OK — proxy returned " + r.bytes +
                " bytes. PDF.js is viable, so the Annotator's viewer could be reused.");
            } else {
              say("c", "bad", "C. proxy returned HTTP " + r.status + ", " + r.bytes + " bytes.");
            }
          })
          .catch(function (e) { say("c", "bad", "C. proxy fetch threw: " + e.message); });
      })
      .catch(function (e) { say("a", "bad", "A. fetch threw: " + e.message); });
  }

  window.callAmplenotePlugin(JSON.stringify({ action: "config" }))
    .then(function (raw) {
      var cfg = JSON.parse(raw);
      if (cfg.error) { say("a", "bad", "config failed: " + cfg.error); return; }
      probe(cfg);
    })
    .catch(function (e) { say("a", "bad", "bridge failed: " + e.message); });
})();
</script>`;
}
