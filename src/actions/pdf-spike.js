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
 * The embed — ROUND 2. Round 1 settled two of three questions:
 *   A ✅ `/file/view/url` returns a presigned url (HTTP 200) — and it points at
 *        **files.zotero.net**, NOT the `zoterofilestorage.s3.amazonaws.com` host Phase 0
 *        tested. A different server, reachable only through this endpoint.
 *   C ❌ `cors-proxy` returns 400 even for the fully-resolved url. Combined with it
 *        400ing on unrelated hosts from curl, Amplenote's proxy is restricted to
 *        Amplenote's own attachment domain. The PDF.js-via-proxy route is dead.
 *   B ⚠️ the iframe's onload FIRED but Edge painted "This page has been blocked by
 *        Microsoft Edge". files.zotero.net sends no X-Frame-Options, so framing isn't
 *        refused by Zotero — the likely cause is the file being served as a DOWNLOAD
 *        (Content-Disposition: attachment) inside a sandboxed iframe that lacks
 *        allow-downloads.
 *
 * So round 2 asks the question that follows from A's new host, which Phase 0 never had
 * the chance to ask (it only knew the S3 host): **is files.zotero.net CORS-open?** If it
 * is, the bytes can be read directly, turned into a `blob:` url, and framed — blob is
 * same-origin to the embed, which sidesteps BOTH the download block and CORS. That would
 * give seamless viewing AND make PDF.js viable without Amplenote's proxy at all.
 *
 * Fallbacks tried in the same pass: <embed> and <object>, which some browsers treat as a
 * plugin-render rather than a navigation, so they may escape the download block.
 * The full url is printed, selectable, so it can be opened in a plain tab — if it
 * downloads there instead of rendering, that confirms the attachment disposition.
 */
export function renderPdfSpike(app, args) {
  const params = new URLSearchParams(args || "");
  const att = params.get("att") || "";
  return `<!doctype html>
<meta charset="utf-8">
<style>
  body { font: 13px/1.5 system-ui, sans-serif; margin: 8px; color: #222; background: #fff; }
  h2 { font-size: 14px; margin: 0 0 6px; }
  .row { margin: 4px 0; padding: 4px 6px; border-left: 3px solid #ccc; background: #f7f7f7; }
  .ok { border-color: #2e7d32; } .bad { border-color: #c62828; } .wait { border-color: #999; }
  textarea { width: 100%; height: 44px; font: 11px ui-monospace, monospace; }
  .box { width: 100%; height: 320px; border: 1px solid #bbb; margin-top: 6px; }
</style>
<h2>Zotero PDF viewer spike — round 2</h2>
<div id="out"></div>
<div id="stage"></div>
<script>
(function () {
  var out = document.getElementById("out"), stage = document.getElementById("stage");
  function say(id, cls, html) {
    var el = document.getElementById(id);
    if (!el) { el = document.createElement("div"); el.id = id; out.appendChild(el); }
    el.className = "row " + cls; el.innerHTML = html;
  }
  function show(el) { el.className = "box"; stage.appendChild(el); }

  say("a", "wait", "A. Resolving presigned url…");

  function probe(cfg) {
    var url0 = cfg.base + "/users/" + cfg.uid + "/items/" + ${JSON.stringify(att)} + "/file/view/url";
    fetch(url0, { headers: { "Zotero-API-Key": cfg.apiKey, "Zotero-API-Version": "3" } })
      .then(function (r) { return r.text().then(function (t) { return { s: r.status, t: t }; }); })
      .then(function (res) {
        if (res.s !== 200 || !/^https?:/.test(res.t.trim())) {
          say("a", "bad", "A. FAILED — HTTP " + res.s); return;
        }
        var url = res.t.trim();
        say("a", "ok", "A. OK — presigned url (select to copy, then try opening it in a normal tab):" +
          '<textarea readonly onclick="this.select()">' + url + "</textarea>");

        // ---- THE decisive test: can we read the BYTES from files.zotero.net? ----
        say("b", "wait", "B. fetch() on files.zotero.net — is it CORS-open?");
        fetch(url)
          .then(function (r) { return r.blob().then(function (b) { return { s: r.status, b: b, type: b.type }; }); })
          .then(function (r) {
            if (!r.b || r.b.size < 1000) {
              say("b", "bad", "B. fetch returned HTTP " + r.s + " but only " + (r.b ? r.b.size : 0) + " bytes."); return;
            }
            say("b", "ok", "B. ✅ CORS-OPEN — read " + r.b.size + " bytes (" + (r.type || "no type") +
              "). Phase 0's 'cannot read Zotero bytes' does NOT hold for this host.");

            // Bytes in hand -> blob url is same-origin, so no download block, no CORS.
            var burl = URL.createObjectURL(r.b.type === "application/pdf" ? r.b : new Blob([r.b], { type: "application/pdf" }));
            say("c", "wait", "C. Framing the blob: url — a PDF below means seamless viewing works.");
            var f = document.createElement("iframe"); f.src = burl;
            f.onload = function () { say("c", "ok", "C. blob iframe loaded — is a PDF visible below?"); };
            show(f);
          })
          .catch(function (e) {
            say("b", "bad", "B. ❌ fetch blocked: " + e.message +
              " — so files.zotero.net is NOT CORS-open either, and the blob route is out.");

            // No bytes. Try the tags that render rather than navigate.
            say("d", "wait", "D. Trying &lt;embed&gt; and &lt;object&gt; on the direct url instead…");
            var em = document.createElement("embed");
            em.src = url; em.type = "application/pdf"; show(em);
            var ob = document.createElement("object");
            ob.data = url; ob.type = "application/pdf"; show(ob);
            setTimeout(function () {
              say("d", "wait", "D. &lt;embed&gt; and &lt;object&gt; are rendered below — does EITHER show a PDF?");
            }, 2500);
          });
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
