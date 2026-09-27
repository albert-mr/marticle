# Marticle

Copy an [X Article](https://help.x.com/en/using-x/articles) as clean Markdown in one click.
Paste it into Claude, ChatGPT, Obsidian, or anything else that speaks Markdown.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/popup-dark.png">
    <img src="docs/popup-light.png" width="320" alt="Marticle popup showing an article title, author, word count, and a Copy as Markdown button">
  </picture>
</p>

Plain JavaScript, Manifest V3, no build step, no dependencies, no network access.

## Install

Marticle isn't on the Chrome Web Store yet, so load it as an unpacked extension:

1. [Download this repo as a zip](https://github.com/albert-mr/marticle/archive/refs/heads/main.zip) and unzip it, or `git clone` it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `extension` folder.
3. Pin Marticle from the puzzle-piece menu so it's one click away.

Works in any Chromium browser: Chrome, Brave, Edge, Arc.

## Use

Open an article on x.com, click Marticle, click **Copy as Markdown**. Done.

## What you get

- Title, author, publish date, and source URL at the top
- Headings, bold, italic, strikethrough, links, quotes, lists, code blocks, tables, and math
- Images as direct full-resolution URLs with alt text and captions
- Embedded posts as quoted blocks with attribution and links
- Videos as links. Nothing is transcribed or invented.

Marticle copies what the page has loaded. If X hasn't finished rendering the article, wait a moment and click **Try again**.
Image links don't attach the actual images to an AI chat; upload those separately when the model needs to see them.

## Privacy

Marticle reads the current tab only when you click it, converts the article in memory, and writes the result to your clipboard.
It makes no network requests and stores nothing.

Permissions: `activeTab` and `scripting` to read the open article, `clipboardWrite` to copy it.

## Development

```sh
npm ci
npm test
```

The extractor is `extension/extract.js`, a single self-contained function that Chrome injects into the article tab.
The popup is `extension/popup.js`. Tests run both against fixture DOMs in jsdom.

## Credits and license

The extraction and Markdown conversion were adapted from [X Article Export](https://github.com/everettjf/x-article-export-pdf) by everettjf (MIT).
X's DOM structure was cross-checked against [Defuddle](https://github.com/kepano/defuddle)'s test fixtures.
The icon uses the public-domain [Markdown Mark](https://github.com/dcurtis/markdown-mark).

[MIT](LICENSE). Not affiliated with X Corp.
