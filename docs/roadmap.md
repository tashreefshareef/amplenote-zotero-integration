# Roadmap

The build plan for the Zotero integration bounty, with day estimates calibrated against
the PDF Annotator's actual git history rather than guessed.

Platform facts this plan rests on are in [`zotero-findings.md`](zotero-findings.md) and
[`api-notes.md`](api-notes.md). Nothing here should contradict those; if it does, they win.

---

## The one architectural decision

The bounty asks for parity with an Obsidian plugin that **cannot be replicated** — it
requires Zotero desktop plus Better BibTeX over `localhost:23119`, and a plugin embed
running on `https://plugins.amplenote.com` can reach neither.

**So: parity by outcome, over the Zotero Web API.** The bounty's own footnote — *"Or as
close as possible"* — is what makes that compliant rather than short. Say so in the intent
email, in week zero.

The Web API turned out to be fully CORS-open with the sync and rate-limit headers exposed,
which is what makes this viable at all. See `zotero-findings.md`.

## Phases

### Phase 0 — De-risk (1 day)

Four spikes, listed in full at the bottom of `zotero-findings.md`. Each is about an hour,
each changes the design if it goes the wrong way, and none of them is coding work — they
are live-app round trips, which is the floor on this platform.

Then send the intent email. `reference/pdf-annotator/bounty-intent-email.md` is the
template; the payment-eligibility question in it is presumably already settled from the
last bounty, so what is left is the parity caveat above and a publish date.

### Phase 1 — Foundation (1–1.5 days)

Repo, build pipeline, API client. Lifts the PDF Annotator's tooling from
`reference/pdf-annotator/` — esbuild to a single expression, the Plugin Builder format
assertions, the mock `app` for tests, the harness pattern.

The API key lands as a `setting | Zotero API key` row. **Recommend a read-only key**: the
settings value is visible in a metadata table in the user's own note.

Build the client with `since=` versioning, `Link` pagination and `Backoff` / `Retry-After`
honoured from the first commit. Retrofitting rate-limit handling is how you get banned
mid-demo.

### Phase 2 — Reference search + citation insertion (2 days)

Ship this first. Fewest unknowns, most obvious demo value, and it is a useful plugin by
itself if later phases hit a wall.

`appOption` for quick search, `include=citation,bib&style=` for formatted output,
`insertText` to place it at the cursor — remembering that `insertText` is a **plain text
macro** (`api-notes.md` #11), so citations go in as text and nothing richer.

### Phase 3 — Content sync (2.5–3 days)

Items → notes, incremental against a stored `Last-Modified-Version`. Zotero tags →
Amplenote tags.

Two hard constraints from `api-notes.md`, both of which cost real debugging last time:
- Persisted sync state goes in a **fenced code block** (#4). Anything else is exposed to
  the editor reformatting it.
- **Never assume a heading-addressed write and your own heading-addressed read resolve to
  the same section** (#4b). Count matching headings before writing; if there are two,
  stop and tell the user.

This phase resists compression more than any other — sync bugs surface on run three
against a real library, not on run one.

### Phase 4 — Attachments and annotations (2 days)

Scope decided by Phase 0 spike #2.

**Regardless of how the file question lands, Zotero annotations are ordinary API items.**
Importing highlights and notes out of Zotero's PDF reader needs no file access at all, and
it is the Obsidian plugin's best feature. That is the half to guarantee.

The attachment itself may degrade to a deep link into Zotero's web reader —
`attachNoteMedia` rejects PDFs outright, so "import the PDF into Amplenote" as a real
attachment may simply not exist as an option.

### Phase 5 — Configuration panel (1.5 days)

Collections, tags and categories selection. Must be an embed: Amplenote renders settings
as plain text inputs with no picker, no dropdown, no validation (`api-notes.md` #9c).
Write back through `app.setSetting`, and **store what a human would have typed, not JSON**
— the text field stays visible and editable, so the two surfaces have to be two views of
one value.

Treat the `setSetting` write as fallible and apply the choice locally either way.

### Phase 6 — Mobile, docs, submission (2 days)

The Android app strips vertical drag from embeds and blocks downloads; budget on-screen
controls rather than gestures, and ship them on every platform rather than sniffing for a
device. The full four-host matrix is in `api-notes.md` #13.

## Estimates, and where they come from

The PDF Annotator went from Phase 0 scaffold to 1.0.0 in **13 calendar days** — 198
commits, with commits on every single day from 2026-08-06 to 2026-08-18. Its own spec had
estimated "roughly 3–4 weeks of focused work." That is the calibration: about **0.5×**.

| Phase | Solo estimate | With Claude Code |
|---|---|---|
| 0 — De-risk spikes | 3 d | **1 d** |
| 1 — Foundation | 4 d | **1–1.5 d** |
| 2 — Search + citations | 5 d | **2 d** |
| 3 — Content sync | 5 d | **2.5–3 d** |
| 4 — Attachments + annotations | 5 d | **2 d** |
| 5 — Config panel | 3 d | **1.5 d** |
| 6 — Mobile, docs, submission | 4 d | **2 d** |
| | 29 d | **~12–13 d** |

**Why this should land at the fast end:** no PDF.js coordinate geometry. The harness in
the PDF Annotator's `spike/` exists *because* rect arithmetic was only debuggable against
a real text layer — that whole category of work is absent here. And `api-notes.md` means
the embed, CORS, paste-schema and mobile traps are already paid for.

**What does not compress, roughly 40% of the days:**

- Every phase ends with build → push → Plugin Builder refresh → reload the note → test.
- Android device testing. The four-host matrix took multiple rounds of physical retesting.
- Sync correctness against a real Zotero library.
- The tail. 2026-08-16 to 08-18 on the PDF Annotator was three days of post-"done" fixes
  from live use.

**Caveat on the 13 days:** that meant commits every day, including two 29-commit days.
Evenings only, roughly double it.

For the intent email's publish date, **3 weeks out** rather than 2 — first-come-first-serve
rewards speed, but an inflated date costs credibility and a missed one costs more.

## Sequencing for a partial win

Phases 2 and 4 alone — search, citations, annotation import — are a genuinely useful
plugin. If sync or attachments hit a platform wall, that is still publishable.
