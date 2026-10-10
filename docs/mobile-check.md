# Mobile check — Phase 6

The plugin registers **no embed**, which is what broke on mobile for the PDF Annotator
(`api-notes.md` #13: embeds render, but the host note claims the vertical drag gesture and
Android blocks downloads). None of that can apply here. What is genuinely untested is
**`app.prompt` and `app.alert` on a phone** — every action in this plugin is a dialog, and
`Zotero: Configure sync` builds one with as many checkboxes as the library has collections,
tags and item types. Nothing has confirmed those render, scroll or submit on a small screen.

Run every action once on a phone and fill the Result column in. Anything that renders but
is awkward still counts as a pass — record it as a note, not a failure; the fix for a
cramped prompt is copy, not code.

Only `Insert citation` is in the `/` menu — it is the one `insertText` action. The other four
are `appOption`s: on Android they are reached from the **search icon → Note Lookup**, typing
`zotero` (the same list desktop shows under Ctrl+O).

**Run 2026-10-10, Samsung Galaxy Note20 Ultra (SM-N986U), Amplenote Android app**, driven
over `adb` (injected taps/swipes, screenshots, `uiautomator` dumps — not a finger).

| # | Action | How to run it | Expected | Result |
|---|---|---|---|---|
| 1 | `Zotero: Test connection` | Search → `zotero` | Alert: username, userID, access scope | **Pass.** Alert shows username, userID, scope. |
| 2 | `Zotero: Insert citation` | `/zotero`, under **Insert** | Search box → results list → citation lands **at the cursor** | **Pass.** Prompt is full-screen; Submit stays above the soft keyboard. Results `select` opens as a native bottom sheet. Cite key replaced the `/zotero` token in place. |
| 3 | `Zotero: Search citation` | Search → `zotero` | Same, appended to the note's end | **FAIL, then fixed.** First run: alert said "Appended", but the open note was unchanged — a **new "untitled note"** was created holding the citation (`api-notes.md` #19). After the fix, rerun the same way (test note open, action from search): the "No open note…" alert appears before any search prompt, note count unchanged at 601, no stray note. So on Android this action can't append at all from search; `/zotero` (row 2) is the mobile path. |
| 4 | `Zotero: Sync now` | Search → `zotero` | Runs to completion, `Zotero Sync` note updates | **Pass.** "0 new, 0 updated, 4 highlights refreshed" in under 5 s. Library was already in sync, so a long backgrounded first sync is still untested. |
| 5 | `Zotero: Configure sync` | Search → `zotero configure` | Every collection/tag/category checkbox reachable and tappable | **Pass.** ~40 rows scroll to the last item type; a tap toggles a checkbox; Submit/Cancel reachable at the bottom. Cancelled, filter unchanged. |
| 6 | Settings page | Side menu → account name → Settings → Installed plugins → Zotero Integration → Plugin settings | All six settings editable | **Pass, with one awkward step.** Six fields (the note's seventh row is `name`, not a setting), all rendered. A long template is editable: tapping it opens the keyboard, and moving the cursor to the start scrolls the field to `**{{authors}}** …`. But the page does **not** scroll the focused field into view — the keyboard covers it until you scroll the page yourself, which works. Edits need an explicit **Save settings**; this run typed nothing and left via Cancel. The API key shows in plain text here, same as in the note. |
| 7 | `zotero://` deep link | Tap **Open in Zotero** on a highlight (no item had an Open PDF link) | Unknown — see below | **No-op, as predicted.** Tapping the link opens Amplenote's link popup; its open icon fires a `VIEW` intent for `zotero://open-pdf/…` (logcat), no app handles it, nothing visible happens, no error. Rechecked with the Zotero Android app installed: still unresolved (see note 7). `View in Zotero` is an https zotero.org link and is unaffected. |

Synced item notes render correctly on the phone: Reference, Zotero Notes, highlights with
color label and comment, and the user-owned My Notes section.

## What each one is actually testing

1. **Test connection** — network + settings read from the mobile client. If the key reads
   back fine here, settings are not device-specific and rows 2–6 start from solid ground.
2. **Insert citation** — the only `insertText` action, and the only one whose output
   position depends on a cursor the mobile editor owns. Type a few characters and watch the
   soft keyboard: a prompt that the keyboard covers is the most likely failure on this list.
3. **Search citation** — same picker through the `appOption` path, so a difference between
   2 and 3 isolates `insertText` rather than the prompt.
4. **Sync now** — the long one. Don't switch apps while it runs; if a backgrounded mobile
   client suspends the action mid-way, that is worth knowing and is not reproducible on
   desktop. A partial sync is safe to re-run — sync is incremental and idempotent.
5. **Configure sync** — the real question. One checkbox per collection, tag and item type
   (`configure-sync.js`), which on a full library is dozens of rows in one dialog. Desktop
   scrolls it fine. If a phone truncates it with no scroll, the filter cannot be edited on
   mobile at all, and the honest fix is a documented "configure on desktop", not a rebuild.
6. **Settings page** — six single-line settings (#9c), two of which hold templates written
   with literal `\n`. Check that a long template is *editable*, not just visible.
7. **Deep link** — `zotero://open-pdf/...` needs an app registered for the scheme. **There
   IS a Zotero app for Android (`org.zotero.android`), but it does not register `zotero://`.**
   Checked 2026-10-10 with it installed: its manifest declares `VIEW` only for `content:`/
   `file:` PDFs and EPUBs, and `am start` with both `zotero://open-pdf/...` and
   `zotero://select/...` fails with "unable to resolve Intent". So installing Zotero changes
   nothing — the link still goes nowhere on Android. iOS Zotero's scheme support is
   unconfirmed. This is a documentation outcome, not a bug: the user-facing instructions
   should say highlights link back to a desktop Zotero.
