import { SETTING_ZOTERO_API_KEY, SETTING_ZOTERO_SYNC_FILTER } from "../constants.js";
import { createZoteroClient, describeZoteroError } from "../zotero-client.js";
import { renderFilterSetting } from "../sync-filter.js";

/**
 * "Zotero: Configure sync" (Phase 5). Bounty's own wording: "select which collections,
 * tags... should be synced."
 *
 * CONFIRMED LIVE, 2026-09-07: `app.prompt`'s `checkbox` input type is a single ON/OFF
 * toggle — it does NOT take an `options` array the way `select` does (Phase 0 spike #4).
 * Declaring one checkbox input labeled "Collections" with an `options` array rendered as
 * exactly one checkbox named "Collections", the array silently ignored. So this declares
 * one checkbox input PER selectable name (prefixed "Collection: "/"Tag: " since
 * `app.prompt` has no section-heading input to visually group them), and reads the
 * result positionally — collections first, then tags, matching declaration order.
 * `app.prompt` still didn't need an embed after all; it just needed the right input
 * shape.
 *
 * Doesn't pre-fill the picker with the currently-active selection — a `value` pre-fill
 * for a prompt input is a separate, still-unconfirmed assumption.
 */
export async function configureSync(app) {
  const apiKey = (app.settings[SETTING_ZOTERO_API_KEY] || "").trim();
  if (!apiKey) {
    await app.alert(`Set the "${SETTING_ZOTERO_API_KEY}" row in this plugin note's metadata table first.`);
    return;
  }

  const client = createZoteroClient({ apiKey });
  let collections;
  let tags;
  try {
    [collections, tags] = await Promise.all([client.listCollections(), client.listTags()]);
  } catch (e) {
    await app.alert(describeZoteroError(e));
    return;
  }

  if (!collections.length && !tags.length) {
    await app.alert("No collections or tags found in your Zotero library — nothing to filter by.");
    return;
  }

  const inputs = [
    ...collections.map((c) => ({ label: `Collection: ${c.name}`, type: "checkbox" })),
    ...tags.map((t) => ({ label: `Tag: ${t}`, type: "checkbox" })),
  ];

  const result = await app.prompt("Choose what to sync — leave everything unchecked to sync your whole library", { inputs });
  if (result === null) return;

  const checked = Array.isArray(result) ? result : [result];
  const selectedCollections = collections.filter((_, i) => checked[i]).map((c) => c.name);
  const selectedTags = tags.filter((_, i) => checked[collections.length + i]).map((t) => t);

  const settingValue = renderFilterSetting({ collections: selectedCollections, tags: selectedTags });

  try {
    await app.setSetting(SETTING_ZOTERO_SYNC_FILTER, settingValue);
  } catch (e) {
    await app.alert(`Could not save the setting: ${e.message}`);
    return;
  }

  await app.alert(
    settingValue ? `Sync will now be limited to:\n${settingValue}` : "No filter set — sync will pull your whole library."
  );
}
