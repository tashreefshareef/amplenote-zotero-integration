# Roadmap

The build plan for the Zotero integration bounty, estimated bottom-up from the work
itself, with the fixed per-plugin overhead separated from the per-feature work.

Platform facts this plan rests on are in [`zotero-findings.md`](zotero-findings.md) and
[`api-notes.md`](api-notes.md). Nothing here should contradict those; if it does, they win.

## What it pays

**$600.** Recorded here on purpose: the first version of this roadmap planned 12–13 days
without the payout written down anywhere, and the scope was set against the problem rather
than against the price.

For calibration, the PDF Annotator paid **$2,000** and took 13 days — about $154/day. The
estimates below have to be read against that number, not in isolation.

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

---

## How this estimate is built

Two columns, because they behave differently when scope changes.

**The fixed floor** is what any Amplenote plugin costs regardless of how many features it
has. Cutting features barely moves it. This is the main reason a plugin with a third of
the Annotator's feature count does not cost a third of the Annotator's days.

**The per-feature work** is the part that actually scales with scope.

### Fixed floor

| | Days | Why it doesn't scale |
|---|---|---|
| Phase 0 spikes + intent email | 0.5 | Four spikes, ~1h each, but they're live round trips |
| Docs, screenshots, instructions cell | 1 | The Annotator's was ~150 lines and 8 captured screenshots. Per-plugin. |
| Four-host matrix + Android device testing | 1 | Per-plugin. Took multiple rounds of physical retesting last time. |
| Submission + the live-use tail | 1–1.5 | The Annotator spent 3 of its 13 days on post-"done" fixes |
| | **3.5–4** | |

### Per-feature work

| | Days | Notes |
|---|---|---|
| Toolchain lift from `reference/pdf-annotator/` | 0.5 | Copy and adapt, not build. esbuild, Plugin Builder assertions, mock `app`, harness. |
| Zotero API client | 0.5–0.75 | Auth header, `Link` pagination, `since=`, `Backoff`/`Retry-After`. Documented API, no unknowns. |
| Reference search + citation insertion | 0.75–1.5 | Low end if spike #4 says `app.prompt`'s `select` is enough. Upper end if search needs a full embed. |
| Content sync | 2–2.5 | The one genuinely meaty subsystem. |
| Annotation import | 0.75–1 | Ordinary API items → markdown. Reuses sync's note-writing. |
| Attachment linking | 0.25 | Deep link into Zotero's web reader. See Phase 4. |
| Configuration panel | 0.75 | Checkbox list + `setSetting`. Embed scaffolding is inherited. |
| | **5.5–7.25** | |

### Totals

| | Days | Per day at $600 |
|---|---|---|
| Full scope | **9–11** | $55–65 |
| Trimmed scope (below) | **7–8** | $75–85 |

**Why the old 12–13 was high, so nobody re-derives it.** It took a "solo estimate" of 29
days and applied a 0.5× correction factor. That factor came from one data point — the
Annotator's spec guessed 3–4 weeks and it took 13 days — applied to a fresh set of guesses
with no reason to carry the same optimism bias. The per-phase figures then read as assigned
top-down to sum to the total rather than built up from the work: "search + citations, 2
days" for *type a query, call an endpoint that returns preformatted text, insert it* is not
a bottom-up number. A calendar buffer for the intent email's publish date was also sitting
inside the work estimate; those are now two separate numbers (see the bottom of this file).

The correction is real but smaller than it first looks: **9–11, not 7.** The fixed floor is
what stops it going lower.

---

## The trimmed build

All five named bounty features present, minimum honest depth each. This is the
recommended scope at $600.

| Feature | Full | Trimmed |
|---|---|---|
| Content sync | Automatic / background, always up to date | Manual **Sync now** with `since=` versioning. Keeps the incremental machinery, drops most of the tail. |
| Citation insertion | — | Unchanged. Already thin. |
| Reference search | — | Unchanged, assuming spike #4 lands well. |
| Attachment integration | — | Unchanged — deep link is likely the only option regardless. |
| Config + tag mapping | Full picker | Checkboxes over collections and tags, nothing more. |
| Mobile | Four-host matrix | Smoke test on one Android device. |
| Docs | Full screenshot set | Trimmed set. |

The bounty note says sync "automatically imports... ensuring all your research content is
always up to date," so manual-trigger sync is the one place trimmed scope is visibly
narrower than the text. Flag it in the intent email rather than at submission.

---

## Phases

### Phase 0 — De-risk (0.5 d)

Four spikes, listed in full at the bottom of `zotero-findings.md`. Each is about an hour,
each changes the design if it goes the wrong way, and none of them is coding work — they
are live-app round trips, which is the floor on this platform.

Spike #4 is worth its own note: if `app.prompt`'s `select` is enough for the citation
picker, the config panel becomes the **only** embed in the plugin, which shrinks the
four-host matrix in the fixed floor. That one spike is worth roughly three quarters of a
day downstream.

Then send the intent email. `reference/pdf-annotator/bounty-intent-email.md` is the
template; the payment-eligibility question in it is presumably already settled from the
last bounty, so what is left is the parity caveat above, the sync-depth caveat, and a
publish date.

Two things worth asking in that email, given the payout: whether $600 is fixed, and
whether partial delivery pays partially. The bounty names five features as flat bullets
with no indication of how it's graded, and the answer changes the scope decision more than
anything derivable from here.

### Phase 1 — Foundation (1–1.25 d)

Toolchain lift plus the API client.

Lifts the PDF Annotator's tooling from `reference/pdf-annotator/` — esbuild to a single
expression, the Plugin Builder format assertions, the mock `app` for tests, the harness
pattern. This is adaptation, not construction, which is why it's half a day.

The API key lands as a `setting | Zotero API key` row. **Recommend a read-only key**: the
settings value is visible in a metadata table in the user's own note.

Build the client with `since=` versioning, `Link` pagination and `Backoff` / `Retry-After`
honoured from the first commit. Retrofitting rate-limit handling is how you get banned
mid-demo.

### Phase 2 — Reference search + citation insertion (0.75–1.5 d)

Ship this first. Fewest unknowns, most obvious demo value, and it is a useful plugin by
itself if later phases hit a wall.

`appOption` for quick search, `include=citation,bib&style=` for formatted output,
`insertText` to place it at the cursor — remembering that `insertText` is a **plain text
macro** (`api-notes.md` #11), so citations go in as text and nothing richer.

Cheap because Zotero formats the citation server-side. There is no CSL engine to ship, and
`zotero-findings.md` explains why that matters far more than it sounds.

### Phase 3 — Content sync (2–2.5 d)

Items → notes, incremental against a stored `Last-Modified-Version`. Zotero tags →
Amplenote tags.

Two hard constraints from `api-notes.md`, both of which cost real debugging last time:

- Persisted sync state goes in a **fenced code block** (#4). Anything else is exposed to
  the editor reformatting it.
- **Never assume a heading-addressed write and your own heading-addressed read resolve to
  the same section** (#4b). Count matching headings before writing; if there are two,
  stop and tell the user.

This phase resists compression more than any other — sync bugs surface on run three
against a real library, not on run one. It is also the single worst value on the board at
$600, which is why the trimmed build cuts its depth rather than any other phase's.

### Phase 4 — Attachments and annotations (1–1.25 d)

Scope decided by Phase 0 spike #2.

**Regardless of how the file question lands, Zotero annotations are ordinary API items.**
Importing highlights and notes out of Zotero's PDF reader needs no file access at all, and
it is the Obsidian plugin's best feature. That is the half to guarantee.

The attachment itself degrades to a deep link into Zotero's web reader —
`attachNoteMedia` rejects PDFs outright, so "import the PDF into Amplenote" as a real
attachment probably does not exist as an option. The expensive-sounding requirement is
forced into its cheapest form by the platform, not by choosing to cut it.

### Phase 5 — Configuration panel (0.75 d)

Collections, tags and categories selection. Must be an embed: Amplenote renders settings
as plain text inputs with no picker, no dropdown, no validation (`api-notes.md` #9c).
Write back through `app.setSetting`, and **store what a human would have typed, not JSON**
— the text field stays visible and editable, so the two surfaces have to be two views of
one value.

Treat the `setSetting` write as fallible and apply the choice locally either way.

### Phase 6 — Mobile, docs, submission (the fixed floor, 3–3.5 d)

This is the floor table above, spent. It is the largest single block in the plan and the
one least affected by how many features shipped.

The Android app strips vertical drag from embeds and blocks downloads; budget on-screen
controls rather than gestures, and ship them on every platform rather than sniffing for a
device. The full four-host matrix is in `api-notes.md` #13.

---

## Calendar vs work days

These are different numbers and the old roadmap mixed them.

**Work: 7–8 days trimmed, 9–11 full.** That assumes the Annotator's pace — which was 198
commits across 13 consecutive days including two 29-commit days. That is a sprint, not a
baseline.

**Calendar: evenings only, roughly double it.** For the intent email's publish date, quote
**3 weeks out** rather than 2 — first-come-first-serve rewards speed, but an inflated date
costs credibility and a missed one costs more. The buffer belongs here, in the quoted
date, not in the work estimate.

## Sequencing for a partial win

Phases 2 and 4 alone — search, citations, annotation import — are a genuinely useful
plugin, and land in about 4 days including a share of the floor. If sync or attachments
hit a platform wall, that is still publishable.
