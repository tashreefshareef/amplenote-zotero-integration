import { SETTING_ZOTERO_LIBRARY, SETTING_ZOTERO_SYNC_FILTER } from "../constants.js";
import { describeZoteroError } from "../zotero-client.js";
import { libraryStateKey, renderLibrarySetting, describeLibrary } from "../library.js";
import { connect } from "../setup.js";

const MY_LIBRARY = "user";

/**
 * "Zotero: Choose library". Picks which library every other action reads: My Library or
 * one of the groups the key can see. Writes the "Zotero library" setting as text a human
 * would type (library.js), so the settings page and this dialog stay two views of one
 * value (api-notes.md #9c).
 *
 * A switch clears the sync filter. The filter names collections and tags of the library
 * it was made for; carried over, it would quietly match nothing — or the wrong things —
 * in the new one.
 */
export async function chooseLibrary(app) {
  const connection = await connect(app);
  if (!connection) return;
  const { client, library } = connection;

  let groups;
  try {
    groups = await client.listGroups();
  } catch (e) {
    await app.alert(describeZoteroError(e));
    return;
  }
  if (!groups.length) {
    await app.alert(
      "Your key can only see My Library. To use a group library, edit the key at zotero.org/settings/keys and give it read access to that group (or to all groups)."
    );
    return;
  }

  const result = await app.prompt("Which Zotero library should the plugin use?", {
    inputs: [
      {
        label: "Library",
        type: "select",
        options: [
          { label: "My Library", value: MY_LIBRARY },
          ...groups.map((g) => ({ label: `Group: ${g.name}`, value: String(g.id) })),
        ],
      },
    ],
  });
  if (result === null) return;
  const value = String(Array.isArray(result) ? result[0] : result);
  const group = groups.find((g) => String(g.id) === value) || null;

  const chosen = group ? { type: "group", id: group.id } : { type: "user" };
  const changed = libraryStateKey(chosen) !== libraryStateKey(library);
  const hadFilter = Boolean((app.settings[SETTING_ZOTERO_SYNC_FILTER] || "").trim());

  try {
    await app.setSetting(SETTING_ZOTERO_LIBRARY, renderLibrarySetting(group));
    if (changed && hadFilter) await app.setSetting(SETTING_ZOTERO_SYNC_FILTER, "");
  } catch (e) {
    await app.alert(`Could not save the setting: ${e.message}`);
    return;
  }

  const name = describeLibrary(chosen, group?.name);
  if (!changed) {
    await app.alert(`Already using ${name}.`);
    return;
  }
  const filterNote = hadFilter ? " Your sync filter was for the other library, so it's cleared — run Configure sync to set one here." : "";
  await app.alert(`Now using ${name}. The next Sync now is a full one.${filterNote}`);
}
