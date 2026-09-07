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
  note-sections.js      Shared heading/section read+write helpers (writeSection),
                       used by sync-state.js and by sync-library.js's Highlights section
  actions/
    test-connection.js   "Zotero: Test connection" — the Phase 1 smoke test
    citation-picker.js   Search Zotero, pick a result — shared by the insertText
                         and appOption citation actions (Phase 2)
    sync-library.js      "Zotero: Sync now" — items -> one note each, Zotero tags ->
                         Amplenote tags, incremental via since= (Phase 3), plus
                         imported highlights/notes per item (Phase 4)
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

## Phase 3: content sync — live-verified, 2026-09-06

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

**Confirmed live, 2026-09-06**, against a real library of 4 items (one a blank test
"Journal Article" with no fields set — correctly rendered as `(untitled)` / `N.d.`, the
designed fallback, not a bug):
- First sync created one note per item, each correctly titled, tagged, and content
  (bibliography, abstract, "View in Zotero" link) — matched the "Zotero Sync" note's
  recorded `libraryVersion` and per-item `noteUUID` map exactly.
- A second sync with nothing changed on the Zotero side correctly returned `0 new,
  0 updated` — `since=` suppressing unchanged items, not a bug (the earlier plan on this
  page to expect "0 new, N updated" here was wrong; `since=` only returns items that
  actually changed).
- Editing one item in Zotero (adding a tag) and re-syncing correctly reported `0 new,
  1 updated`, matched the item by its stored key, and rewrote the existing note in place
  — no duplicate created. `app.createNote`'s returned uuid came back prefixed
  `local-...` and stayed valid for that particular write. **It did NOT stay valid
  indefinitely** — see Phase 4 below and `api-notes.md` finding 18. Given the actual
  scope of that finding, this Phase 3 result is best read as "worked within the window
  tested," not as evidence the id is durable.
- **A run that appeared to silently do nothing** (no alert, no error) turned out to be a
  stale browser tab/session, not a plugin bug — confirmed by the identical action
  succeeding immediately in a different browser, and by `Zotero: Test connection`
  working fine in the same broken tab at the same time. Inconclusive on root cause, not
  written up as a platform finding. It did surface a real gap while debugging it: the
  per-item write loop had no `try/catch`, so any write failure for any reason would have
  aborted the whole sync silently. Fixed — failures are now isolated per item and
  reported in the final alert alongside the new/updated counts.

## Phase 4: attachments and annotations — live-verified, 2026-09-07

**A live run of the highlights-refresh pass failed on all 4 previously-synced items**,
each with `Cannot read properties of null (reading 'split')`. Root cause chased to
ground: `app.createNote`'s returned uuid is not durable (`api-notes.md` finding 18, now
the canonical writeup) — it came back prefixed `local-...`, and by the time of this run
those ids no longer resolved to the real notes at all, confirmed by comparing one item's
stored `local-...` id against that same note's real uuid read straight out of Amplenote's
own URL bar (`https://www.amplenote.com/notes/<uuid>`) — completely different values, no
resemblance. The notes themselves were fine the whole time; only the plugin's remembered
identifier had gone stale.

Two fixes landed from this, in order:
1. `note-sections.js`'s `writeSection` and `sync-state.js`'s `loadSyncState` both fed
   `app.getNoteContent`'s result straight into `.split()` with no null check — turned a
   real failure into a useless raw `TypeError`. Both now treat a null/undefined read as
   "this note is unreadable" and report or recover accordingly.
2. The actual fix: `sync-library.js`'s `resolveNoteUUID` now confirms a stored uuid still
   resolves (`app.findNote({ uuid })`) before writing to it, and falls back to
   `app.findNote({ name })` to re-locate and self-heal the stored mapping if it doesn't —
   in both the main per-item loop and the highlights-refresh pass. Covered by tests
   (`test/sync-library.test.js`'s two "self-heals" tests) using a fake stale-uuid/
   real-uuid pair, since the mock app doesn't reproduce the actual id-drift behavior on
   its own.

**Re-verified live, 2026-09-06: the original 4 items now sync with zero failures** — but
the result complicates the diagnosis rather than closing it cleanly. The self-heal path
never triggered (the "Zotero Sync" note's stored `local-...` ids came back completely
unchanged), meaning `app.findNote({ uuid })` accepted the exact same id that
`getNoteContent` had returned null for a few minutes earlier. See `api-notes.md` finding
18's same-day correction for the full account — short version: "the uuid is not
durable" was too strong a claim; what's actually confirmed is narrower (one
`getNoteContent` call failed once, for a reason not pinned down), and the
`resolveNoteUUID` fallback stays as cheap insurance regardless, having correctly been a
no-op here.

The uuid-resolution failure turned out to be **intermittent, not one-time**: a repeat
run on the same 4 items later failed again with "no longer exists," even though they'd
resolved fine minutes before. Root cause of THAT: these 4 items predate title tracking,
so `resolveNoteUUID` had no name to fall back on when the uuid check failed — the
self-heal path existed but had nothing to work with. Fixed with `client.getItem(key)`,
which backfills a missing title straight from Zotero (the one identifier that's always
reliable) before attempting recovery. Re-run after that fix: **all 4 items recovered
with zero failures.**

**Annotation content confirmed live, 2026-09-07**, against a real highlighted PDF: the
item note showed its bibliography, abstract, "View in Zotero" link, and — under
`## Highlights & Notes` — the highlighted text as a blockquote with the correct page
number. One real formatting bug found here: a comment on that highlight rendered as an
unrelated-looking floating paragraph right after the quote, nothing tying the two
together but adjacency. Fixed by labeling it `_Comment: ..._` explicitly rather than
relying on position to imply the connection.

Phase 4 is done. What's still unconfirmed, lower priority: `image`/`ink` annotation
types (named-but-not-rendered placeholder path never exercised against a real one), and
an item with more than one attachment or more than a handful of annotations (ordering
and volume at scale untested).

Folded into the same `Zotero: Sync now` action rather than a separate one, since it
writes into the same per-item note. Each item note now also gets:
- A `[View "<filename>" in Zotero](...)` link per attachment, using that attachment's own
  `links.alternate.href` — same pattern as Phase 3's item-level "View in Zotero" link, no
  URL construction/guessing involved.
- A `## Highlights & Notes` section: every annotation (highlight text + any comment, or a
  sticky note's comment alone) under that item's attachments, in Zotero's own
  `annotationSortIndex` reading order. `image`/`ink` annotations are named but their
  content isn't rendered — same reason a PDF's own bytes can't be read
  (`zotero-findings.md`, no CORS on Zotero's file storage) applies equally to an
  annotation's extracted image.

**The reason this needed more than "reuse Phase 3's per-item loop":** Zotero's item-level
`since=` only reports a change to the TOP item's own metadata, not to a highlight added
two levels down (item -> attachment -> annotation) with nothing else about the item
touched — so an item genuinely unchanged since the last sync would never be revisited,
and a highlight added to it would silently never show up. The fix here is a second pass,
every run, over every OTHER already-known item (not touched by this run's item-level
sync) that re-fetches and rewrites just its Highlights section. This is a real,
deliberate cost — one extra Zotero request per previously-synced item, every manual
sync, not just for what changed — accepted because it's a user-initiated action (not
automatic/background) and because catching a highlight-only edit is the actual point of
this phase.

Unverified against the live app. Before trusting this phase, sync a library where at
least one item has a PDF with highlights, and check:
- The item's note shows the attachment link and the highlights, in the right order,
  including a comment on a highlight if one exists.
- Add or edit a highlight in Zotero on an item whose *bibliographic data you don't touch*,
  then re-sync — the alert's "highlights refreshed" count should include that item, and
  its note's Highlights section should show the change, with the rest of the note
  untouched.
