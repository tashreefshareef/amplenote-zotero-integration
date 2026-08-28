# Zotero integration — verified findings

Same purpose as `api-notes.md`, for the Zotero half of this plugin: **confirmed** facts
only, with how each was confirmed. Anything unverified is marked as such and belongs in
the spike list at the bottom, not in the design.

**Measured 2026-08-28** unless noted otherwise.

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

**Not yet confirmed:** all of the above is `curl` from a shell. It proves the *server*.
It does not prove Amplenote's plugin sandbox permits the request — that is a separate
question with a different owner (Amplenote's CSP `connect-src`), and it is spike #1.

## ✅ Citations render server-side — no citeproc-js in the bundle

Zotero's API takes `include=citation,bib` alongside `style=` (default
`chicago-note-bibliography`) and `locale=` (default `en-US`), and returns formatted CSL
output. Source: <https://www.zotero.org/support/dev/web_api/v3/basics>.

This matters far more than it sounds. `api-notes.md` lesson #1: a dense plugin code block
costs **15–60 seconds to open the plugin note**, every time, and the cost is tokenization
of real JS, not character count. Shipping a CSL engine and a style repository inside the
plugin would land squarely on that. Letting Zotero's servers format is not just less work
— it is the difference between a usable plugin note and an unusable one.

## ⚠️ The local Zotero HTTP server is not reachable from a plugin

Zotero runs a local server on `localhost:23119` exposing `/connector/*` endpoints.
It is unusable here, for two independent reasons — either alone is fatal:

- The embed is served over **https**; `http://localhost` is mixed content.
- Zotero's own docs note "cross-origin restrictions prevent webpages from reading the
  response."

Source: <https://www.zotero.org/support/dev/client_coding/connector_http_server>.

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

## ⚠️ Amplenote's CORS proxy rejected a non-Amplenote URL — unresolved

`https://plugins.amplenote.com/cors-proxy?apiurl=<encoded>` is the undocumented proxy the
PDF Annotator uses to read attachment bytes (`api-notes.md`). Pointed at a Zotero URL from
`curl` it returned:

```
HTTP/1.1 400 Bad Request
Content-Length: 0
```

**Do not conclude "allowlist" from this.** A 400 with an empty body is equally consistent
with a validation rule on the `apiurl` parameter, or with the proxy expecting a request
shape `curl` did not send (referer, an origin it recognises). The PDF Annotator only ever
called it from inside a live embed. Retest it there before designing around it — spike #3.

It only matters for one thing: fetching **Zotero-hosted attachment bytes**, if
`/items/<key>/file` turns out to redirect to storage without CORS headers. Everything else
goes direct.

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

## Open questions — the Phase 0 spike list

Each is answerable in about an hour, and each one changes the design if it goes the wrong
way. Do all four before writing product code.

1. **Does a `fetch` to `api.zotero.org` succeed from inside a live embed?** Confirms the
   server finding above against Amplenote's sandbox CSP. Everything depends on this.
2. **Can the embed read `/items/<key>/file` bytes?** Decides whether Phase 4 attaches
   files or links to Zotero's web reader.
3. **Retest `cors-proxy` with a Zotero URL from inside the embed.** Only needed if #2
   fails.
4. **Is `app.prompt`'s `select` input enough for a citation picker,** or does search need
   a full embed? Its documented input types are checkbox/date/embed/note/radio/
   secureText/select/string/tags/text — none of them does live async search, so the
   question is whether a two-step "type a query → pick from a select" is acceptable UX.

## Sources

- Zotero Web API v3 basics — <https://www.zotero.org/support/dev/web_api/v3/basics>
- Zotero local HTTP server — <https://www.zotero.org/support/dev/client_coding/connector_http_server>
- The Obsidian plugin — <https://github.com/mgmeyers/obsidian-zotero-integration>
- The bounty note — <https://public.amplenote.com/u1ivsVxuqee3TntAwJ5Pvca8>
  (append `.md` for the raw markdown — that is how the footnote text was recovered)
