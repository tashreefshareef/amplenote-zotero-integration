# Amplenote Zotero Integration

An Amplenote plugin that connects a Zotero library to Amplenote notes — reference search,
formatted citation insertion, content sync, and annotation import.

Built for the [Amplenote plugin bounty](https://public.amplenote.com/u1ivsVxuqee3TntAwJ5Pvca8).

> **Status: pre-implementation.** Nothing is built yet. The platform research is done and
> all four Phase 0 spikes are closed, live — see `docs/zotero-findings.md`. Next is the
> intent email, then Phase 1 (`docs/roadmap.md`).

## Start here

| Document | What it is |
|---|---|
| [`docs/roadmap.md`](docs/roadmap.md) | The build plan, phased, estimated bottom-up with fixed per-plugin overhead separated from per-feature work — and read against what the bounty actually pays |
| [`docs/zotero-findings.md`](docs/zotero-findings.md) | Verified Zotero + Amplenote facts for this project — all four Phase 0 spikes closed live |
| [`docs/bounty-note.md`](docs/bounty-note.md) | The bounty requirements, verbatim, including the footnote the rendered page drops |
| [`docs/api-notes.md`](docs/api-notes.md) | Confirmed Amplenote API signatures and platform quirks. **Carried over and still living** — its "Lessons for the NEXT Amplenote plugin" section was written for this project |
| [`docs/bugs-found.md`](docs/bugs-found.md) | General web-platform bugs and fixes. Also carried over, also still living |

## The short version of the research

- **The Zotero Web API is fully CORS-open** and exposes `Last-Modified-Version`, `Link`,
  `Backoff` and `Retry-After` to JS — so incremental sync, pagination and rate-limit
  backoff all work from inside the plugin, with the API key in a header. This was the
  project's biggest risk; confirmed live from inside a real embed, not just by `curl`.
- **Citations render server-side** via `include=citation,bib&style=`, so no CSL engine
  ships in the bundle. That matters: a dense plugin code block costs 15–60 seconds just to
  *open* the plugin note.
- **The Obsidian plugin the bounty names cannot be replicated** — it requires Zotero
  desktop and Better BibTeX over localhost. Parity has to be by outcome. The bounty's own
  footnote, *"Or as close as possible"*, is what licenses that.
- **PDF attachment import does not work** as a real Amplenote attachment — confirmed live:
  `attachNoteMedia` rejects PDFs, and the Zotero file endpoint redirects to storage with no
  CORS headers, so the plugin can't read the bytes either. Degrades to a deep link into
  Zotero's web reader. Annotation import does not depend on it and is unaffected.
- **The citation picker needs no embed.** `app.prompt`'s `select` input, alongside a
  `string` input in the same prompt, is a real two-step picker — confirmed live. That
  leaves the config panel as the plugin's only embed.

## What came from the PDF Annotator

This is the second Amplenote plugin in this series, and a lot transfers.

`docs/api-notes.md` and `docs/bugs-found.md` are **living documents** that continue here —
add to them, don't fork them.

`reference/pdf-annotator/` holds working code from that project kept as **templates, not
dependencies**. None of it runs unmodified; adapt it into place during Phase 1.

| File | Why it's here |
|---|---|
| `esbuild.js` | The build that collapses `src/` into the single expression Amplenote wants, including the Plugin Builder format assertions |
| `package.json`, `jest.config.js` | Script and test setup, incl. Jest in ESM mode |
| `test-helpers.js` | The mock Amplenote `app` with real in-memory note state |
| `harness.mjs`, `harness-bridge.js` | The standalone embed harness — the pattern that made embed code debuggable without a live round trip |
| `plugin-builder-patched.js` | The patched Plugin Builder that actually syncs |
| `development.md` | How the build, harness and factory-injection test pattern work |
| `plugin-instructions.md` | The shape of the end-user install doc |
| `bounty-intent-email.md` | The intent-email template, to be adapted and sent in Phase 0 |

## Setup

Once per clone, enable the repo's git hooks — `core.hooksPath` is local config, so it does
not come with the checkout:

```bash
git config core.hooksPath .githooks
```

## License

MIT.
