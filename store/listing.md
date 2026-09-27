# Chrome Web Store listing

Upload `marticle-<version>.zip` from the GitHub release (manifest.json at the zip root). Everything below is paste-ready.

## Store listing

**Name:** Marticle

**Summary** (132 chars max):
Copy any X Article as clean Markdown in one click. Paste it into Claude, ChatGPT, Obsidian, or a note.

**Category:** Productivity → Tools

**Language:** English

**Description:**
Marticle turns the X Article you're reading into clean Markdown with one click.

Open an article on x.com, click Marticle, click Copy as Markdown. Paste it into Claude, ChatGPT, Obsidian, Notion, or any text file. Or save it straight to a .md file named after the title.

What you get:
• Title, author, publish date, and source URL at the top
• Headings, bold, italic, strikethrough, links, quotes, lists, code blocks, tables, and math
• Images as direct full-resolution URLs with alt text and captions
• Embedded posts as quoted blocks with attribution and links
• Videos as links. Nothing is transcribed or invented.

Private by design. Marticle reads the current tab only when you click it, converts the article in memory, and hands you the result. It makes no network requests, stores nothing, and has no analytics.

Open source under the MIT license: https://github.com/albert-mr/marticle

Not affiliated with X Corp.

**Screenshots:** `screenshot-1.png`, `screenshot-2.png` (1280×800). Replace with captures from the live extension when convenient.
**Small promo tile:** `promo-440x280.png`.

## Privacy practices tab

**Single purpose:** Converts the X Article open in the current tab into Markdown and copies or saves it.

**Permission justifications:**
- `activeTab`: read the article in the tab the user clicked the extension on, and only then.
- `scripting`: inject the extractor function into that tab to read the article's DOM.
- `clipboardWrite`: put the generated Markdown on the clipboard.

**Remote code:** No, all code ships in the package.

**Data usage:** Does not collect or transmit any user data. Certify: not sold to third parties, not used for unrelated purposes, not used for creditworthiness.

**Privacy policy URL:** https://github.com/albert-mr/marticle#privacy

## Distribution

Visibility: Public. Regions: all.
