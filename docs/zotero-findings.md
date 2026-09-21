# Zotero integration — verified findings

Same purpose as `api-notes.md`, for the Zotero half of this plugin: **confirmed** facts
only, with how each was confirmed. Anything unverified is marked as such.

**Measured 2026-08-28** unless noted otherwise. The four Phase 0 spikes were closed
**2026-09-05**, live against a real Zotero library from inside an actual Amplenote embed —
see "Phase 0 spikes — closed" below. The probe used is described there; it no longer
exists in the repo (`spike/`, deleted once these findings were written up).

---

## ✅ The Zotero Web API is fully CORS-open — the plugin can call it directly

This is the finding the whole architecture rests on, and it is the one that nearly killed
the PDF Annotator in its equivalent position (see `api-notes.md`, "reading attachment
bytes"). Here it is clear.

Measured with `curl` against `https://api.zotero.org/groups/1/items?limit=1`, sending
`Origin: https://plugins.amplenote.com` (the embed's real origin — see `api-notes.md`
lesson #6):

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: HEAD, GET, POST, PUT, PATCH, DELETE
Access-Control-Allow-Headers: Authorization, Content-Type, If-Match, If-None-Match,
    If-Modified-Since-Version, If-Unmodified-Since-Version, Zotero-API-Key,
    Zotero-API-Version, Zotero-Schema-Version, Zotero-Write-Token
Access-Control-Expose-Headers: Backoff, ETag, Last-Modified-Version, Link, Retry-After,
    Total-Results, Zotero-API-Version, ...
Access-Control-Max-Age: 86400
```

A preflight `OPTIONS` with `Access-Control-Request-Headers: zotero-api-key` also returns
`200` with the same headers.

Three things follow, and each one removes a design problem:

1. **`Zotero-API-Key` is in `Allow-Headers`**, so the key goes in a header. The `key=`
   query parameter is supported but Zotero's own docs say "not recommended" — and a key
   in a URL is a key in logs.
2. **`Last-Modified-Version` is in `Expose-Headers`**, so incremental sync
   (`?since=<version>` + `If-Modified-Since-Version` → `304`) is readable from JS. Without
   the expose header the value exists on the wire but is invisible to `fetch`, and full
   re-sync would have been the only option.
3. **`Link`, `Total-Results`, `Backoff` and `Retry-After` are exposed too**, so pagination
   and rate-limit backoff are both implementable properly rather than guessed at.

**✅ Confirmed live, 2026-09-05.** The above was `curl` from a shell — it proved the
*server*, not whether Amplenote's plugin sandbox permits the request (a separate question,
owned by Amplenote's CSP `connect-src`). That was spike #1, and it now has a real answer:
a `fetch` to `https://api.zotero.org` from inside a live embed on `plugins.amplenote.com`
returns `HTTP 200`, with `Total-Results`, `Last-Modified-Version` and `Link` all readable
from JS. Checked twice — once from inside the embed, once plugin-side — both open. The
architecture is sound as designed; nothing here forces a redesign.

## ✅ Citations render server-side — no citeproc-js in the bundle

Zotero's API takes `include=citation,bib` alongside `style=` (default
`chicago-note-bibliography`) and `locale=` (default `en-US`), and returns formatted CSL
output. Source: <https://www.zotero.org/support/dev/web_api/v3/basics>.

This matters far more than it sounds. `api-notes.md` lesson #1: a dense plugin code block
costs **15–60 seconds to open the plugin note**, every time, and the cost is tokenization
of real JS, not character count. Shipping a CSL engine and a style repository inside the
plugin would land squarely on that. Letting Zotero's servers format is not just less work
— it is the difference between a usable plugin note and an unusable one.

**✅ Confirmed live, 2026-09-05**, against a real library item: `include=data,citation,bib`
returned both fields populated — `citation` as `<span>Author, Author, and Author, "Title."
</span>`, `bib` as a full `<div class="csl-bib-body">` block. The `citation` field needs
its `<span>` wrapper stripped before `insertText` (see the new dead-end entry below —
`insertText` is a plain-text macro, so an unstripped tag arrives as literal angle
brackets); the `bib` field's HTML is usable as-is for a clipboard `text/html` flavor
(`api-notes.md` lesson #7).

## ❌ The local Zotero HTTP server is not reachable from a plugin — measured 2026-09-21

Zotero runs a local server on `localhost:23119`: `/connector/*` endpoints always, a
read-only local API under `/api/` behind **Settings → Advanced → "Allow other applications
on this computer to communicate with Zotero"** (off by default; it answers
`403 Local API is not enabled` until switched on), and Better BibTeX's JSON-RPC when that
add-on is installed. It is the only route to a PDF that would come straight off the user's
disk rather than from Zotero's cloud storage, so it was worth a real test after the
`files.zotero.net` result below.

Probed from inside the live sandbox (`origin=https://plugins.amplenote.com`, Zotero
10.0.1 running) against both `localhost` and `127.0.0.1`:

| Probe | Result |
|---|---|
| `/connector/ping`, `mode: "no-cors"` | ❌ `TypeError: Failed to fetch` |
| `/connector/ping` | ❌ `TypeError: Failed to fetch` |
| `/api/users/0/items` | ❌ `TypeError: Failed to fetch` |
| `/better-bibtex/json-rpc` (POST) | ❌ `TypeError: Failed to fetch` |

**The `no-cors` line is the decisive one.** A request that reaches the server in
`no-cors` mode resolves to an opaque response even when the server sends no CORS headers
at all; it can only throw if the browser refused to send it. So the block sits in the
browser, ahead of anything Zotero could answer — the same sandbox reaches
`api.zotero.org` in the same run, so it is specific to localhost.

What this test could not tell apart: whether the refusal is the sandbox document's
`connect-src` CSP (the public amplenote.com page has one that lists only Amplenote's own
hosts and blocks localhost with a console error saying so) or Chromium's local-network
access policy for a cross-origin iframe. Both belong to Amplenote and the browser, and
neither is something plugin code can opt out of, so the distinction doesn't change the
conclusion.

Two corrections to what this entry used to say, which had been reasoned rather than
measured: `http://localhost` from an https page is **not** mixed content — Chromium
treats localhost as potentially trustworthy — so that reason was wrong; and Zotero's
"cross-origin restrictions" note was accurate but never reached, because the request
doesn't get as far as Zotero. Measured from outside the browser, Zotero's CORS preflight
reply does carry no `Access-Control-Allow-Origin`, so it would have refused a readable
response anyway.

Source: <https://www.zotero.org/support/dev/client_coding/connector_http_server>;
<https://www.zotero.org/support/dev/client_coding/local_api>.

**Consequence for scope, and it is the biggest one on this project:** see the parity note
below.

## ⚠️ The Obsidian plugin we are asked to match cannot be matched by mechanism

The bounty asks for "feature parity to [this Obsidian
integration](https://github.com/mgmeyers/obsidian-zotero-integration)". That plugin
**hard-requires Zotero desktop running locally plus the Better BibTeX plugin**, and talks
to them over the local server above. Its README: "Requires the Better BibTeX for Zotero
plugin."

An Amplenote plugin has no desktop process and cannot reach localhost. So parity has to be
**by outcome** — citation insertion, library search, annotation import, bibliography —
delivered over the Web API instead.

**The bounty note licenses this explicitly.** Its "feature parity" footnote reads, in
full: *"Or as close as possible"*. Raise it in the intent email so it is agreed in week
zero rather than argued at submission. See `docs/bounty-note.md` for the verbatim source.

## ❌ Reading a Zotero-hosted attachment's bytes does not work from an embed — resolved

Decides Phase 4's attachment half. Two related, now-closed questions.

**`/items/<key>/file` redirects to S3, and S3 sends no CORS headers.** Confirmed
2026-09-05 by following the redirect manually (`redirect: "manual"`, then a direct request
to the `Location` target) with `Origin: https://plugins.amplenote.com` set:

```
hop 1  api.zotero.org              302   access-control-allow-origin: *
hop 2  zoterofilestorage.s3....    200   access-control-allow-origin: ABSENT
```

The first hop is open — it's the redirect target that isn't. A browser `fetch` follows the
redirect and then enforces CORS against the *final* response, so it fails there
regardless of the first hop. Confirmed live inside a real embed too (spike #2): `fetch`
against `/items/<key>/file` for a real stored PDF returned `Failed to fetch`.

**Amplenote's CORS proxy doesn't help either — resolved, not just unresolved.**
`https://plugins.amplenote.com/cors-proxy?apiurl=<encoded>` is the undocumented proxy the
PDF Annotator uses to read attachment bytes (`api-notes.md`). Pointed at the same Zotero
file URL from `curl`, then again from inside a live embed with the request shaped like a
real one (real `Origin`, from the actual iframe, not a shell) — both returned:

```
HTTP/1.1 400 Bad Request
Content-Length: 0
```

The live-embed retest is what actually closes this: `zotero-findings.md` previously
flagged the `curl` 400 as inconclusive, since a validation rule or a missing
referer/origin `curl` doesn't send could have explained it. Sending the request from the
real iframe, with its real origin, ruled that out. The proxy does not accept a Zotero URL
under any request shape tried.

**Consequence: nothing reads Zotero-hosted attachment bytes from inside the plugin.**
Phase 4's attachment half degrades to a deep link into Zotero's web reader, as the roadmap
already assumed and priced at 0.25 days — this closes the question rather than changing
the plan. **Annotation import is unaffected**: Zotero annotations are ordinary API items,
no file access involved, and that is the half of Phase 4 to guarantee.

## ❌ Known dead ends inherited from the PDF Annotator

Carried over so they are not rediscovered. Full detail in `api-notes.md`.

| Thing | Status |
|---|---|
| `attachNoteMedia` with a PDF | Throws `NetworkError`. PDFs cannot be uploaded to a note by a plugin. |
| Media uploaded via `attachNoteMedia` | Is **not** a note attachment; `getNoteAttachments` does not list it. |
| `app.openSidebarEmbed` | Pro-gated (Peek Viewer). Never the primary UI. |
| `window.confirm` / `alert` / `prompt` inside the embed | Silently swallowed. Build in-page confirms. |
| `insertText` returning note source | It is a **plain text macro**. An `<object>` embed tag arrives as literal text. |
| Copying markdown to the clipboard for the user to paste | Amplenote reads `text/html`; `text/plain` pastes literally. Needs a `text/html` flavor. |
| Downloading a file on iOS from inside an embed | No route exists. Not fixable from the plugin. |
| `Zotero-API-Key` response shape from `/keys/current` | `{ key, userID, username, displayName, access }` — `userID` is top-level, not nested. Confirmed live 2026-09-05. |
| An `imported_url` attachment can be `text/html`, not a file | A library can hold a web-page snapshot (`storage.html`) alongside a real PDF, both under `linkMode` starting `imported_*`. Filtering on `linkMode` alone can pick the snapshot. Filter on `contentType === "application/pdf"` too if the goal is a document. |

## ✅ Phase 0 spikes — closed, 2026-09-05

All four resolved live, in one session, against a real Zotero library from inside an
actual Amplenote embed and plugin context — not simulated. A purpose-built probe plugin
(now deleted, see the top of this file) answered all four at once rather than one round
trip each.

1. **`fetch` to `api.zotero.org` from inside a live embed: ✅ works.** See "The Zotero Web
   API is fully CORS-open" above — this is what closed it. Checked twice, embed-side and
   plugin-side; both open. Nothing about the architecture needs to change.
2. **Reading `/items/<key>/file` bytes from the embed: ❌ does not work.** See "Reading a
   Zotero-hosted attachment's bytes does not work from an embed" above.
3. **`cors-proxy` with a Zotero URL, retested from a live embed: ❌ still 400.** Same
   section — this closes the "maybe it was curl's fault" question the original `curl` test
   couldn't answer on its own.
4. **`app.prompt`'s `select` input for a citation picker: ✅ good enough, no embed
   needed.** Confirmed live with a two-input prompt — one `string`, one `select` with
   three labeled options:
   - **A `string` and a `select` coexist in one `app.prompt` call**, and `select` renders
     as a real, searchable-looking native dropdown — not a degraded fallback.
   - **The return arrives as a positional array**, matching the `inputs` order:
     `["thinking fast", "A", -1]` for a string typed as `"thinking fast"` and the
     `select` option whose `value` was `"A"`.
   - **New finding, not previously in `api-notes.md`: the array carries one more element
     than the declared inputs.** The trailing `-1` here is not one of the two declared
     inputs — it matches `app.alert`'s documented "`-1` for primary action" convention, so
     `app.prompt` appears to append an implicit action index even when no `actions` array
     is passed. Added to `api-notes.md`'s "Still unverified" table.

   **Consequence: Phase 2's citation picker needs no embed.** A two-step "type a query →
   pick from the select" is a real `app.prompt`, not a fallback UX — a plugin-side Zotero
   call runs between the `string` prompt and the `select` prompt. That leaves the Phase 5
   config panel as the plugin's only embed, which shrinks the four-host mobile-testing
   floor in `docs/roadmap.md` — worth roughly the ¾ day the roadmap already flagged for
   this outcome.

## ❌ A Zotero PDF cannot be VIEWED inside Amplenote either — six routes tested, 2026-09-20

Phase 0 concluded the plugin can't read a Zotero attachment's **bytes**, and that was
taken to mean in-note **viewing** was impossible too. That inference was wrong twice
over — **CORS governs `fetch`/XHR, not `<iframe>`**, and viewing needs no text layer, so
it doesn't need bytes at all. Re-opened and tested properly with a throwaway probe embed
(now deleted, like Phase 0's). The conclusion survives, but it is now *measured* rather
than inherited, and the tested surface is much wider:

| Route | Result |
|---|---|
| `<iframe>` the presigned file url | ❌ `onload` fires, then **Edge paints its own block page**. Zotero sends **no `X-Frame-Options`**, so framing isn't refused by Zotero — the file is served as a download, and Amplenote's plugin iframe is sandboxed without `allow-downloads`. |
| `fetch()` bytes from **`files.zotero.net`** | ❌ "Failed to fetch" — not CORS-open. |
| `fetch()` bytes from `zoterofilestorage.s3…` | ❌ No CORS header (Phase 0). |
| Amplenote's `cors-proxy`, **resolved** url | ❌ HTTP 400 — see below. |
| `<embed>` / `<object type="application/pdf">` | ❌ Both render blank. |
| `<iframe>` Zotero's own web reader | ❌ `www.zotero.org` sends **`X-Frame-Options: SAMEORIGIN`**. |

Three things worth keeping, because each corrects something previously believed:

1. **`/items/<key>/file/view/url` exists and works** (HTTP 200), returning a presigned url
   as plain text. `api.zotero.org` is CORS-open, so the plugin *can* read that **string**
   even though it can't read the **file**. Phase 0 never used this endpoint — it only
   ever called `/items/<key>/file`, which 302s.
2. **That url points at `files.zotero.net`, not S3.** A host Phase 0 never saw, so its
   "no CORS on Zotero file storage" finding was, strictly, only ever measured against
   `zoterofilestorage.s3.amazonaws.com`. Now measured on both. Same answer.
3. **Amplenote's `cors-proxy` is restricted to Amplenote's own attachment domain.** Phase
   0 called it 400 for a Zotero url; it also 400s for `httpbin.org` and every other host
   tried from curl, so it rejects the *target*, not just Zotero. Don't reach for it as a
   general-purpose proxy for a future plugin — it is not one.

**What's left, and why it isn't taken:** a third-party CORS proxy would work, but it
means routing a presigned url — and therefore the user's actual document — through a
server neither we nor Amplenote control. Not acceptable for a research library.

**So the deep link stands as the answer**, and it is the same answer the Obsidian plugin
the bounty cites gives (`zotero://open-pdf`): the bullet's "seamless viewing within the
same interface" is not reachable by any plugin on this platform, first- or third-party.

## ✅ Better BibTeX keys arrive through the Web API — no Better BibTeX dependency needed

Observed live 2026-09-21, on the same item a few days apart:

- **Before Better BibTeX was installed in Zotero desktop:** `data.citationKey` was empty,
  so the plugin's fallback produced `sahay2026` (`\cite{sahay2026}`, parity pass C).
- **After it was installed** (for testing the Obsidian plugin): the Web API returned
  `data.citationKey` = `sahayComputingQLDPCCodes2026`, and the plugin used it as-is.

That key has the shape of Better BibTeX's default formula (author, then the first words
of the title, then the year). The likely explanation — inferred from the timing and the
key's shape, not confirmed from Better BibTeX's own documentation — is that Better
BibTeX writes its key into Zotero's native Citation Key field, which syncs up to
zotero.org and comes back through the API like any other field.

Why it matters: the Obsidian plugin *requires* Better BibTeX and a running Zotero
desktop to get cite keys. This plugin needs neither — yet someone who does run Better
BibTeX gets **the same keys** they'd get in Obsidian, with no configuration, because
`cite-key.js` prefers `citationKey` whenever it's set and only falls back to
`<author><year>` when it's empty.

## ⚠️ An invalid CSL style is an HTTP **500**, not a 400 — and only when there's an item to render

Confirmed live 2026-09-07 (the plugin's own `style=` setting, pointed at `not-a-style`),
then reproduced independently against a populated public group so it isn't specific to
one library:

```
GET /groups/30/items/top?limit=1&include=citation&style=apa                        200
GET /groups/30/items/top?limit=1&include=citation&style=chicago-note-bibliography  200
GET /groups/30/items/top?limit=1&include=citation&style=not-a-style                500  "An error occurred"
GET /groups/30/items/top?limit=1&include=citation&style=totally-bogus-xyz          500  "An error occurred"
```

Two things follow, and both cost a wrong error message before they were understood:

1. **Don't validate a style by expecting a 4xx.** A bad style id is a server error, so
   any code branching on `400` to mean "bad input" never fires. `describeZoteroError`
   now names a non-default style as the likely cause of a 5xx.
2. **An empty result set never validates the style at all.** The same bad style returns
   `200 []` against a library with no matching items (`/groups/1/...` — an empty group —
   returns `[]` for every style, valid or not). Zotero only loads the CSL style when it
   has something to format, so a typo'd style can sit unnoticed until the first item
   comes back.

Related: the plugin's old blanket message for any `ZoteroApiError` was "Check the key is
current," which is right only for 403. It now branches per status — 403 blames the key,
5xx blames the server (or the style), everything else states the status plainly.

## Sources

- Zotero Web API v3 basics — <https://www.zotero.org/support/dev/web_api/v3/basics>
- Zotero local HTTP server — <https://www.zotero.org/support/dev/client_coding/connector_http_server>
- The Obsidian plugin — <https://github.com/mgmeyers/obsidian-zotero-integration>
- The bounty note — <https://public.amplenote.com/u1ivsVxuqee3TntAwJ5Pvca8>
  (append `.md` for the raw markdown — that is how the footnote text was recovered)
