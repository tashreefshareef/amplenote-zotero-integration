# The bounty note, verbatim

Source: <https://public.amplenote.com/u1ivsVxuqee3TntAwJ5Pvca8>
Retrieved 2026-08-28 as raw markdown by appending `.md` to the public note URL —
the rendered page drops the footnote body, which is the load-bearing part.

```markdown
---
name: 'Amplenote Plugin Bounty: Zotero integration'
published: Thu, 20 Feb 2025 10:29:22 GMT
updated: Thu, 13 Feb 2025 09:10:31 GMT
---

- This plugin is an integration with the Zotero service

- This plugin will have [feature parity][^1] to [this Obsidian integration](https://github.com/mgmeyers/obsidian-zotero-integration) 

- And some specific features:

    - **Content Sync**: Articles and PDFs

        - Automatically imports articles, summaries, and PDF files stored in Zotero into Amplenote, ensuring that all your research content is always up to date.

    - **Smart Citation Insertion and Formatting**

        - Enables you to insert fully formatted citations directly into your Amplenote notes by leveraging the reference data stored in Zotero.

    - **Integrated Reference Search**

        - Offers a built-in search tool within Amplenote that allows you to quickly find any article or reference from Zotero without switching between apps.

    - **Document Attachment Integration**

        - Links PDF files and other documents from Zotero directly to your Amplenote notes, allowing for seamless viewing and access within the same interface.

    - **Custom Configuration and Tag Mapping**

        - Provides a configuration panel that lets you select which collections, tags, and categories from Zotero should be synced with Amplenote. This includes importing Zotero tags to help organize and categorize your notes effectively.

[^1]: [feature parity]()

    Or as close as possible

```

## The line that decides the scope

The "feature parity" footnote resolves to **"Or as close as possible"**. The Obsidian
plugin it points at requires Zotero desktop and Better BibTeX over `localhost:23119`,
neither of which a plugin can reach — so that footnote is what makes a Web API
implementation a compliant answer rather than a shortfall. See `zotero-findings.md`.
