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
  constants.js        Zotero API base/version, settings-row labels
  zotero-client.js     Zotero Web API v3 client: auth header, since= pagination,
                       Backoff/Retry-After
  actions/
    test-connection.js  "Zotero: Test connection" — the Phase 1 smoke test
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
   <https://www.zotero.org/settings/keys>) — the settings value is visible in a metadata
   table in your own note.

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
