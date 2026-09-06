# Development

How to build, test and run this plugin. For the platform facts behind these choices, see
[`api-notes.md`](api-notes.md) and [`zotero-findings.md`](zotero-findings.md).

Adapted from `reference/pdf-annotator/development.md` — that file is the fuller
reference; this one covers what's actually true of this repo today, and will grow as
later phases add an embed, a harness, and the rest.

## Why there's a build step

An Amplenote plugin is a single self-contained JavaScript expression pasted into one
code block inside a note — no imports, no npm at runtime, no bundler in the sandbox.
This repo authors normal ES modules in `src/` and uses esbuild to collapse them into
the single expression Amplenote expects.

`dist/plugin.js` is the paste target and is committed on purpose — the bounty terms
require the public repo to hold the code that actually runs.

## Getting started

```bash
npm install
npm run build
```

Once per clone, enable the repo's git hooks — `core.hooksPath` is local config, so it
doesn't come with the checkout:

```bash
git config core.hooksPath .githooks
```

That activates `.githooks/commit-msg`, which strips any `Co-Authored-By:` trailer naming
Claude or Anthropic (see `CLAUDE.md`).

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Bundle `src/` → `dist/plugin.js` (GitHub sync target) and `dist/plugin-paste.js` (manual paste) |
| `npm test` | Run the Jest suite |
| `npm run test:watch` | Jest in watch mode |

## Layout

```
src/
  plugin.js          The plugin object — kept thin, delegates to actions/
  constants.js        Zotero API base/version, settings-row labels, default citation style
  zotero-client.js     Zotero Web API v3 client: auth header, since= pagination,
                       Backoff/Retry-After, searchItems(), syncItems()
  format-citation.js   Strips Zotero's citation/bib HTML to plain text
  sync-state.js        Reads/writes the Phase 3 sync watermark + key->noteUUID map,
                       persisted as JSON in a fenced code block (api-notes.md #4/#4b)
  actions/
    test-connection.js   "Zotero: Test connection" — the Phase 1 smoke test
    citation-picker.js   Search Zotero, pick a result — shared by the insertText
                         and appOption citation actions (Phase 2)
    sync-library.js      "Zotero: Sync now" — items -> one note each, Zotero tags ->
                         Amplenote tags, incremental via since= (Phase 3)
esbuild.js            Build: src/ → dist/plugin.js
dist/plugin.js        Build output (committed)
test/
  helpers.js           Mock Amplenote `app` object
docs/api-notes.md      Verified Amplenote API signatures and platform quirks
docs/zotero-findings.md  Verified Zotero facts and the closed Phase 0 spikes
```

## Testing

Plugin actions can't run outside the Amplenote sandbox, so the suite calls them with a
mock `app` object (`test/helpers.js`) that keeps real in-memory note state — write-then-
read-back tests exercise the actual logic rather than asserting on canned values.

Design consequence: **action logic must live in pure, importable functions in `src/`
that take `app` as a parameter.** Anything written inline in the plugin object is
unreachable from tests.

```bash
npm test
```

Jest runs in ESM mode, so `jest.fn()` and friends need an explicit
`import { jest } from "@jest/globals"` — the global isn't injected.

The Zotero client's own tests (`test/zotero-client.test.js`) inject a fake `fetchImpl`
rather than hitting the real API — they check the auth header lands correctly, pagination
follows `Link: rel="next"`, a `Backoff` header pauses between pages without the client
silently retrying on its own, and a 429 throws rather than looping. **A passing test here
is not evidence Amplenote's sandbox allows the request** — that's `zotero-findings.md`'s
job, confirmed live. Test the logic here; test the platform there.

## Setting up the plugin note

There's no template file for this yet — it's created by hand in Amplenote. The note
needs:

1. A metadata table with these rows (label in the left cell, value in the right):

   | | |
   |---|---|
   | name | Zotero Integration |
   | setting | Zotero API key |

   Use a **read-only** Zotero key (generate one at
   <https://www.zotero.org/settings/keys>). Confirmed live, 2026-09-05, contrary to what
   the platform docs imply: the value does **not** sit inline in the note's own table —
   the table only declares the setting's *label*. The actual value is entered and stored
   on a separate page, **Account Settings → Plugins → [this plugin] → Settings**, which
   only ever shows this plugin's own settings, never another installed plugin's.

2. A `# Code block` heading, exactly that text — Plugin Builder's sync target looks for
   it verbatim (`esbuild.js`'s format-contract assertions cross-check this at build time,
   but the heading text itself isn't something the build can enforce).

3. Under that heading, a fenced code block holding `dist/plugin.js`'s contents (via
   Plugin Builder sync from this GitHub repo, or `dist/plugin-paste.js` pasted by hand).

4. Register it: **Account Settings → Plugins → Add a plugin**, then pick the note from
   the list. This is also how Amplenote registers a note as a plugin at all — there's no
   tag involved, contrary to what might seem intuitive from a note's own "add a tag" UI.

Then run **Zotero: Test connection** from the `/` slash-command picker in any note, with
your key filled in. It should alert back your Zotero username, userID and access scope.
That's the live-app check this phase ends on (`CLAUDE.md`).

## Running actions live

Type `/` anywhere in a note body, then filter (e.g. `/zotero`). Every action shows up
prefixed `Plugin: <plugin name>: <label>`, grouped by kind:

- **`appOption` actions** appear under "DISPLAY AND GLOBAL ACTIONS".
- **`insertText` actions** appear under "INSERT" — this is a live, general finding, not
  documented anywhere in `api-notes.md` before now: the `{Plugin Name}` macro syntax
  those docs describe is not the only way to trigger one. Selecting it from the `/`
  picker runs it exactly the same way.

Two mechanics this project had marked unverified turned out fine on the first live run:
`app.prompt` with a single `string` input returns a value the code's defensive
`Array.isArray` check handles either way, and cancelling `insertText` mid-flow leaves no
`"undefined"` in the note — confirmed by running the actual cancel path, not inferred.

## Syncing via Plugin Builder

Manually pasting `dist/plugin-paste.js` after every change works but doesn't scale.
Plugin Builder (a separate installed plugin, same as the PDF Annotator uses) syncs the
code block from this GitHub repo on demand:

1. Add a plain-text line (**not** a heading — see below) anywhere in the note, reading:

   ```
   entry: tashreefshareef/amplenote-zotero-integration/dist/plugin.js
   ```

2. Run **Plugin Builder: Refresh** from the `/` picker.

**Placement matters, confirmed live 2026-09-05: put the `entry:` line *above* the
`# Code block` heading, never below it or inside the fenced block.** Plugin Builder
rewrites the whole section under that heading on every sync, and if the `entry:` line
sits there too, it gets silently wiped the first time you refresh — the next refresh
then has nothing to find `entry:`/`repo:` from and fails. Above the heading, it survives
indefinitely across refreshes.

**A line typed at the start of a heading inherits that heading's style.** Typing the
`entry:` line at the top of "Code block" makes it an H1 too — functionally harmless
(Plugin Builder's regex reads note content, not formatting), but for a normal-looking
note, click into that line afterward and toggle its heading style off from the toolbar.

**The raw GitHub content this pulls from can lag a few minutes after a push**, especially
if that exact URL was fetched (by a script, a browser, anything) shortly before the push
landed — that request can seed a stale cache entry that then serves for its full TTL
regardless of what's actually on `main`. If a refresh doesn't pick up a change that's
definitely pushed, that's the likely cause; wait a few minutes and retry, or paste
`dist/plugin-paste.js` by hand for an immediate check.

## Phase 3: content sync — implemented, not yet live-checked

`Zotero: Sync now` (an `appOption`) pulls the library via `since=` incremental sync,
writes one Amplenote note per Zotero item (title, formatted bibliography, abstract if
present, a link back to the item's Zotero web-library page), applies the item's Zotero
tags as the note's tags at creation time, and persists a key -> noteUUID map plus the
library-version watermark as JSON in a fenced code block inside a note named "Zotero
Sync" (`src/sync-state.js`).

Known, deliberate trims (roadmap.md's "trimmed build"):
- **Deletions aren't synced.** Zotero exposes deletions via a separate endpoint; a note
  whose Zotero item was deleted just stops being touched by future syncs.
- **Tags don't refresh on a re-sync.** There is no confirmed Amplenote API to retag an
  existing note — only `createNote`'s tags argument, at creation time.

This is unverified against the live app — CLAUDE.md's rule applies: a passing Jest run
against the mock `app` is not evidence Amplenote's sandbox behaves the same way. Before
trusting this phase, run **Zotero: Sync now** for real and check:
- A "Zotero Sync" note is created with a `# Zotero Sync State` heading and a valid JSON
  fence.
- Each library item gets its own note, correctly tagged.
- Running sync again updates those notes in place rather than duplicating them, and the
  `since=` value sent on the second run matches the first run's `Last-Modified-Version`.
