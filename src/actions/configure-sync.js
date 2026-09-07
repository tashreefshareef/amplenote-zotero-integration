import { SETTING_ZOTERO_API_KEY, SETTING_ZOTERO_SYNC_FILTER } from "../constants.js";
import { createZoteroClient, describeZoteroError } from "../zotero-client.js";
import { renderFilterSetting } from "../sync-filter.js";

/**
 * "Zotero: Configure sync" (Phase 5). Bounty's own wording: "select which collections,
 * tags... should be synced." Picks between two mechanisms api-notes.md #9c names for a
 * real picker UI (an embed is the only one #9c had confirmed at the time): `app.prompt`
 * declares a `checkbox` input type, untested anywhere in this project before now.
 * ⚠️ UNVERIFIED, first live test of this action IS the check: does `checkbox` render as
 * a multi-select list (given an `options` array, like `select` does — Phase 0 spike #4)
 * and return an array of the selected values? If not, this needs rebuilding as an embed.
 *
 * Doesn't pre-fill the picker with the currently-active selection — a `value` pre-fill
 * for a prompt input isn't confirmed to work either, and stacking two unverified
 * assumptions into one live test makes a failure harder to diagnose. Worth adding once
 * the checkbox mechanism itself is confirmed.
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

  const result = await app.prompt("Choose what to sync — leave everything unchecked to sync your whole library", {
    inputs: [
      { label: "Collections", type: "checkbox", options: collections.map((c) => ({ label: c.name, value: c.name })) },
      { label: "Tags", type: "checkbox", options: tags.map((t) => ({ label: t, value: t })) },
    ],
  });
  if (result === null) return;

  const [selectedCollections, selectedTags] = result;
  const settingValue = renderFilterSetting({
    collections: Array.isArray(selectedCollections) ? selectedCollections : [],
    tags: Array.isArray(selectedTags) ? selectedTags : [],
  });

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
