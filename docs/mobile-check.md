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

| # | Action | How to run it | Expected | Result |
|---|---|---|---|---|
| 1 | `Zotero: Test connection` | `/zotero` in any note | Alert: username, userID, access scope | |
| 2 | `Zotero: Insert citation` | `/zotero`, under **Insert** | Search box → results list → citation lands **at the cursor** | |
| 3 | `Zotero: Search citation` | `/zotero` | Same, appended to the note's end | |
| 4 | `Zotero: Sync now` | `/zotero` | Runs to completion, `Zotero Sync` note updates | |
| 5 | `Zotero: Configure sync` | `/zotero` | Every collection/tag/category checkbox reachable and tappable | |
| 6 | Settings page | Account Settings → Plugins → Zotero Integration → Settings | All seven rows editable | |
| 7 | `zotero://` deep link | Tap **Open PDF** in a synced item note | Unknown — see below | |

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
6. **Settings page** — seven single-line rows (#9c), two of which hold templates written
   with literal `\n`. Check that a long template is *editable*, not just visible.
7. **Deep link** — `zotero://open-pdf/...` needs an app registered for the scheme. There is
   **no Zotero app for Android at all**, and iOS Zotero's scheme support is unconfirmed, so
   expect nothing to happen on Android. This is a documentation outcome, not a bug: the
   user-facing instructions should say highlights link back to a desktop Zotero.
