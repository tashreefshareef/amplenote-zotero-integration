# Amplenote Zotero Integration

An Amplenote plugin that connects a Zotero library to Amplenote notes — reference search,
formatted citation insertion, content sync, and annotation import.

Built for the [Amplenote plugin bounty](https://public.amplenote.com/u1ivsVxuqee3TntAwJ5Pvca8).

> **Status: Phase 6 — mobile, docs, submission.** Phases 1–5 are built and each was
> verified in the live app: reference search and citation insertion, content sync (one
> note per Zotero item, incremental), highlight and note import, and the sync filter by
> collections, tags and item types — plus citation styles, cite keys and layout templates.
> A run on an Android phone (2026-10-10) passed every action but one; that one, Search
> citation, is fixed and re-verified on the phone (`docs/mobile-check.md`). Left: the
> settings-page check on mobile, user instructions and screenshots, and submission. See
> `docs/roadmap.md`.

## Start here

| Document | What it is |
|---|---|
| [`docs/roadmap.md`](docs/roadmap.md) | The build plan, phased, estimated bottom-up with fixed per-plugin overhead separated from per-feature work — and read against what the bounty actually pays |
| [`docs/zotero-findings.md`](docs/zotero-findings.md) | Verified Zotero + Amplenote facts for this project — all four Phase 0 spikes closed live |
| [`docs/bounty-note.md`](docs/bounty-note.md) | The bounty requirements, verbatim, including the footnote the rendered page drops |
| [`docs/api-notes.md`](docs/api-notes.md) | Confirmed Amplenote API signatures and platform quirks. **Carried over and still living** — its "Lessons for the NEXT Amplenote plugin" section was written for this project |
| [`docs/bugs-found.md`](docs/bugs-found.md) | General web-platform bugs and fixes. Also carried over, also still living |
| [`docs/development.md`](docs/development.md) | Build, test, and how to set up the plugin note in Amplenote |
| [`docs/mobile-check.md`](docs/mobile-check.md) | The Android checklist and its results — where each action lives on mobile, and what does not work there |

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
dependencies**. None of it runs unmodified; Phase 1 adapted what was needed into place,
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
| `bounty-intent-email.md` | The intent-email template, to be adapted and sent in Phase 0 |

## Setup

See [`docs/development.md`](docs/development.md) for build, test and plugin-note setup.
The short version:

```bash
npm install && npm run build && npm test
git config core.hooksPath .githooks
```

## License

MIT.
