# Amplenote Zotero Integration

An Amplenote plugin that connects a Zotero library to Amplenote notes — reference search,
formatted citation insertion, content sync, and annotation import.

> **Status:** every feature is built and verified in the live Amplenote app: reference
> search and citation insertion (formatted, bibliography, Pandoc/LaTeX keys, BibTeX),
> content sync (one note per Zotero item, incremental), single-item import, highlight and
> note import, group libraries, and the sync filter by collections, tags and item types —
> plus citation styles, cite keys and layout templates. Checked on an Android phone too
> (`docs/mobile-check.md`).

## Start here

| Document | What it is |
|---|---|
| [`docs/zotero-findings.md`](docs/zotero-findings.md) | Verified Zotero + Amplenote facts for this project, including the four feasibility spikes, all closed live |
| [`docs/api-notes.md`](docs/api-notes.md) | Confirmed Amplenote API signatures and platform quirks. **Carried over and still living** — its "Lessons for the NEXT Amplenote plugin" section was written for this project |
| [`docs/bugs-found.md`](docs/bugs-found.md) | General web-platform bugs and fixes. Also carried over, also still living |
| [`docs/development.md`](docs/development.md) | Build, test, and how to set up the plugin note in Amplenote |
| [`docs/plugin-instructions.md`](docs/plugin-instructions.md) | The end-user instructions, as they appear in the plugin note's instructions cell, and the screenshots that go with them |
| [`docs/mobile-check.md`](docs/mobile-check.md) | The Android checklist and its results — where each action lives on mobile, and what does not work there |

## The short version of the research

- **The Zotero Web API is fully CORS-open** and exposes `Last-Modified-Version`, `Link`,
  `Backoff` and `Retry-After` to JS — so incremental sync, pagination and rate-limit
  backoff all work from inside the plugin, with the API key in a header. This was the
  project's biggest risk; confirmed live from inside a real embed, not just by `curl`.
- **Citations render server-side** via `include=citation,bib&style=`, so no CSL engine
  ships in the bundle. That matters: a dense plugin code block costs 15–60 seconds just to
  *open* the plugin note.
- **The Obsidian Zotero plugin can't be replicated by mechanism** — it requires Zotero
  desktop and Better BibTeX over localhost, which an Amplenote plugin can't reach. This
  plugin matches it by outcome instead, over the Zotero Web API.
- **PDF attachment import does not work** as a real Amplenote attachment — confirmed live:
  `attachNoteMedia` rejects PDFs, and the Zotero file endpoint redirects to storage with no
  CORS headers, so the plugin can't read the bytes either. Viewing one inside Amplenote
  was closed too, six routes tested. PDFs and highlights link out with
  `zotero://open-pdf`, page-precise — **desktop Zotero only**: the Zotero Android app
  does not register the scheme, so on a phone those links do nothing. Annotation import
  does not depend on any of it and is unaffected.
- **The plugin has no embeds.** `app.prompt`'s `select` input, alongside a `string`
  input in the same prompt, is a real two-step citation picker, and the sync filter is a
  prompt of checkboxes — both confirmed live. Every action is a dialog, which is why none
  of the Annotator's mobile embed problems apply.
- **On mobile, the app actions live under search, not `/`.** Only `Insert citation` is in
  the `/` menu on Android, and an action run from search gets no current note — so
  `/zotero` is the way to cite into a note on a phone.

## What came from the PDF Annotator

This is the second Amplenote plugin in this series, and a lot transfers.

`docs/api-notes.md` and `docs/bugs-found.md` are **living documents** that continue here —
add to them, don't fork them.

`reference/pdf-annotator/` holds working code from that project kept as **templates, not
dependencies**. None of it runs unmodified; what was needed was adapted into place,
and the originals stay here for reference.

| File | Why it's here |
|---|---|
| `esbuild.js` | The build that collapses `src/` into the single expression Amplenote wants, including the Plugin Builder format assertions |
| `package.json`, `jest.config.js` | Script and test setup, incl. Jest in ESM mode |
| `test-helpers.js` | The mock Amplenote `app` with real in-memory note state |
| `harness.mjs`, `harness-bridge.js` | The standalone embed harness — the pattern that made embed code debuggable without a live round trip |
| `plugin-builder-patched.js` | The patched Plugin Builder that actually syncs |
| `development.md` | How the build, harness and factory-injection test pattern work |
| `plugin-instructions.md` | The shape of the end-user install doc |

## Setup

See [`docs/development.md`](docs/development.md) for build, test and plugin-note setup.
The short version:

```bash
npm install && npm run build && npm test
git config core.hooksPath .githooks
```

## License

MIT.
