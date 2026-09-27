import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

async function extract(html) {
  const dom = new JSDOM(html, { url: 'https://x.com/alice/status/123?s=tracking', runScripts: 'outside-only' });
  const source = await readFile(new URL('../extension/extract.js', import.meta.url), 'utf8').catch(() => '');
  dom.window.eval(source.replace('export function', 'function'));
  assert.equal(typeof dom.window.extractArticle, 'function', 'article extractor must exist');
  try { return dom.window.extractArticle(); } finally { dom.window.close(); }
}

const page = (body) => `<main><article>
  <div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>
  <time datetime="2026-09-19T10:00:00Z"></time>
  <div data-testid="twitterArticleReadView">
    <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/cover?format=jpg&name=small" alt="Cover"></div>
    <div data-testid="twitter-article-title">An article</div>
    <div data-testid="twitterArticleRichTextView"><div data-contents="true">${body}</div></div>
  </div></article></main><aside>Do not copy the sidebar</aside>`;

test('preserves article boundaries, nested lists, code, links and media in order', async () => {
  const result = await extract(page(`
    <h2 data-block="true">A heading</h2>
    <div class="longform-unstyled"><div class="public-DraftStyleDefault-block">Hello <span style="font-weight:700">bold</span>, <em>italic</em> and literal [x] * y.
    <a href="https://example.org/a_(b)">a link</a></div></div>
    <ol start="3"><li>Parent<ul><li>Child</li></ul></li><li>Second</li></ol>
    <blockquote>Quoted<br>second line</blockquote>
    <section data-testid="markdown-code-block"><span>javascript</span><pre><code class="language-js">const x = "\u0060\u0060\u0060\u0060";\n\n\nend();</code></pre></section>
    <figure><a href="/i/article/9/media/10"><img src="https://pbs.twimg.com/media/body?format=png&name=small" alt="A chart"></a><figcaption>Chart caption</figcaption></figure>
    <p>Last paragraph.</p>`));
  assert.equal(result.ok, true);
  assert.match(result.markdown, /^# An article\n/);
  assert.match(result.markdown, /Alice.*@alice/);
  assert.match(result.markdown, /https:\/\/x.com\/alice\/status\/123/);
  assert.doesNotMatch(result.markdown, /tracking|sidebar/);
  assert.match(result.markdown, /name=orig/);
  assert.match(result.markdown, /## A heading/);
  assert.match(result.markdown, /\*\*bold\*\*/);
  assert.match(result.markdown, /literal \\\[x\\\] \\\* y/);
  assert.match(result.markdown, /\[a link\]\(<https:\/\/example.org\/a_\(b\)>\)/);
  assert.match(result.markdown, /3\. Parent\n   - Child\n4\. Second/);
  assert.match(result.markdown, /> Quoted/);
  assert.match(result.markdown, /`````js\nconst x = "````";\n\n\nend\(\);\n`````/);
  assert.match(result.markdown, /!\[A chart\]\([^\n]+\)\n\nChart caption/);
  assert.ok(result.markdown.indexOf('Cover') < result.markdown.indexOf('A heading'));
  assert.ok(result.markdown.indexOf('A chart') < result.markdown.indexOf('Last paragraph.'));
  assert.equal(result.stats.images, 2);
});

test('keeps embedded post attribution, permalink and images without UI or avatars', async () => {
  const result = await extract(page(`<p>Before</p><div data-testid="simpleTweet">
    <img src="https://pbs.twimg.com/profile_images/avatar.jpg" alt="Avatar">
    <div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div>
    <div data-testid="tweetText">Embedded <b>context</b></div>
    <a href="/bob/status/456"><time>Sep 18</time></a>
    <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/embed?format=jpg" alt="Evidence"></div>
    <button>Like</button></div><p>After</p>`));
  assert.match(result.markdown, /> .*Bob.*@bob/);
  assert.match(result.markdown, /> Embedded \*\*context\*\*/);
  assert.match(result.markdown, /https:\/\/x.com\/bob\/status\/456/);
  assert.match(result.markdown, /Evidence/);
  assert.doesNotMatch(result.markdown, /Avatar|Like/);
  assert.equal(result.stats.embeds, 1);
});

test('handles Draft list depths, tables, strikethrough, math, emoji and video fallback', async () => {
  const result = await extract(page(`<ul>
    <li class="public-DraftStyleDefault-depth0">Top</li>
    <li class="public-DraftStyleDefault-depth1">Nested</li></ul>
    <table><tr><th>Key</th><th>Value</th></tr><tr><td>a|b</td><td><s>old</s></td></tr></table>
    <p>Math <span class="katex"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span> and <img src="https://abs.twimg.com/emoji/v2/svg/1f600.svg" alt="😀"></p>
    <div data-testid="videoPlayer"><video src="blob:unusable" poster="https://pbs.twimg.com/media/poster.jpg"></video></div>`));
  assert.match(result.markdown, /- Top\n  - Nested/);
  assert.match(result.markdown, /\| Key \| Value \|/);
  assert.match(result.markdown, /a\\\|b/);
  assert.match(result.markdown, /~~old~~/);
  assert.match(result.markdown, /\$x\^2\$/);
  assert.match(result.markdown, /😀/);
  assert.match(result.markdown, /Watch video/);
  assert.doesNotMatch(result.markdown, /blob:/);
  assert.ok(result.warnings.some(x => /video/i.test(x)));
});

test('rejects missing, empty and ambiguous articles instead of copying timelines', async () => {
  for (const html of ['<article data-testid="tweet"><p>A regular post</p></article>', page(''), page('<div role="progressbar"></div>')]) {
    assert.equal((await extract(html)).ok, false);
  }
  assert.equal((await extract(page('<p>one</p>') + page('<p>two</p>'))).ok, false);
});

test('preserves combined span styles and isolates image captions and later paragraphs', async () => {
  const result = await extract(page('<p><span style="font-weight:700;font-style:italic">Both</span></p><div data-block="true"><a href="/i/article/1/media/2"><img src="https://pbs.twimg.com/media/chart.jpg" alt="Chart"></a><div>Caption</div></div><p>Ending</p>'));
  assert.match(result.markdown, /\*\*\*Both\*\*\*/);
  assert.match(result.markdown, /!\[Chart\]\([^\n]+\)\n\nCaption\n\nEnding/);
});

test('keeps media and embedded content inside interactive wrappers', async () => {
  const result = await extract(page('<div role="button" data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/picture.jpg" alt="Interactive image"></div><div role="button" data-testid="simpleTweet"><div data-testid="tweetText">Embedded text</div></div><div role="button">Like</div>'));
  assert.match(result.markdown, /Interactive image/);
  assert.match(result.markdown, /> Embedded text/);
  assert.doesNotMatch(result.markdown, /Like/);
  assert.equal(result.stats.images, 2);
});

test('does not use an embedded post author or date as article metadata', async () => {
  const html = page('<p>Main article</p><div data-testid="simpleTweet"><div data-testid="User-Name"><a href="/bob">Bob</a><a href="/bob">@bob</a></div><time datetime="2000-01-01">Old date</time><div data-testid="tweetText">An embedded quote</div></div>')
    .replace('<div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice">@alice</a></div>', '')
    .replace('<time datetime="2026-09-19T10:00:00Z"></time>', '');
  const result = await extract(html);
  assert.equal(result.author, '@alice');
  assert.doesNotMatch(result.markdown, /Published: 2000/);
});

test('rejects a still-busy article root even when partial text is present', async () => {
  const html = page('<p>Partial content</p>').replace('data-testid="twitterArticleRichTextView"', 'data-testid="twitterArticleRichTextView" aria-busy="true"');
  const result = await extract(html);
  assert.equal(result.ok, false);
  assert.match(result.error, /loading/i);
});

test('drops scripts and javascript: links from the Markdown', async () => {
  const result = await extract(page('<p>Safe <a href="javascript:alert(1)">label</a></p><script>secret()</script>'));
  assert.match(result.markdown, /Safe label/);
  assert.doesNotMatch(result.markdown, /javascript:|secret/);
});
