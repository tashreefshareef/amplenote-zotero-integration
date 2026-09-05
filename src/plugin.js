import { testConnection } from "./actions/test-connection.js";

const plugin = {
  name: "Zotero Integration",

  appOption: {
    "Zotero: Test connection": testConnection,
  },
};

export default plugin;
