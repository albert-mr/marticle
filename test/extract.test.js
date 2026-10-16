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

// Status pages: cells of article[data-testid="tweet"]; the focal post has tabindex="-1" and a date link to its own URL.
const post = ({ handle = 'alice', name = 'Alice', id = '123', focal = false, time = '2026-09-19T10:00:00Z', body = '' } = {}) =>
  `<div data-testid="cellInnerDiv"><article data-testid="tweet" tabindex="${focal ? -1 : 0}">
    <div data-testid="Tweet-User-Avatar"><a href="/${handle}"><img src="https://pbs.twimg.com/profile_images/${handle}.jpg" alt="Avatar"></a></div>
    <div data-testid="User-Name"><a href="/${handle}"><span>${name}</span></a><a href="/${handle}"><span>@${handle}</span></a>
      ${focal ? '' : `<a href="/${handle}/status/${id}"><time datetime="${time}">7h</time></a>`}</div>
    <button aria-label="Grok actions"></button>
    ${body}
    ${focal ? `<a href="/${handle}/status/${id}"><time datetime="${time}">10:00 AM · Sep 19, 2026</time></a><span>1M</span><span>Views</span>` : ''}
    <div role="group"><button>Reply</button><button>Like</button></div>
  </article></div><div data-testid="cellInnerDiv"></div>`;
const text = (html) => `<div data-testid="tweetText" lang="en">${html}</div>`;
const photo = (name, alt = 'Image') => `<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/${name}?format=jpg&name=small" alt="${alt}"></div>`;

test('copies a single post with line breaks, links, media and metadata and no title heading', async () => {
  const result = await extract(`<main>${post({ focal: true, body: `
    ${text('<span>First line \n\nSecond paragraph with </span><a href="/hashtag/tag">#tag</a><span> and </span><a href="https://t.co/abc">example.com/page…</a><img src="https://abs-0.twimg.com/emoji/v2/svg/1f600.svg" alt="😀"><span>\nthird line</span>')}
    <a href="/alice/status/123/photo/1">${photo('pic', 'A photo')}</a>
    <div data-testid="videoPlayer"><video src="blob:x" poster="https://pbs.twimg.com/amplify_video_thumb/1/img/thumb.jpg"></video></div>` })}</main>`);
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'post');
  assert.equal(result.title, 'First line');
  assert.equal(result.author, 'Alice @alice');
  assert.match(result.markdown, /^By Alice @alice\n\nPublished: 2026-09-19T10:00:00Z\n\nSource: https:\/\/x\.com\/alice\/status\/123\n\nFirst line/);
  assert.match(result.markdown, /First line\n\nSecond paragraph with \[\\#tag\]\(<https:\/\/x\.com\/hashtag\/tag>\) and \[example\.com\/page…\]\(<https:\/\/t\.co\/abc>\)😀\nthird line\n\n!\[A photo\]/);
  assert.match(result.markdown, /name=orig/);
  assert.match(result.markdown, /!\[Video\]\(<https:\/\/pbs\.twimg\.com\/amplify_video_thumb\/1\/img\/thumb\.jpg>\)\n\n\[Watch video\]\(<https:\/\/x\.com\/alice\/status\/123>\)/);
  assert.doesNotMatch(result.markdown, /Avatar|Views|Reply|Like|Grok|1M/);
  assert.deepEqual({ ...result.stats }, { words: result.stats.words, images: 1, embeds: 0, posts: 1 });
});

test('unrolls a thread: same-author posts around the focal one, with the other-author parent as reply context', async () => {
  const html = `<main>
    ${post({ handle: 'bob', name: 'Bob', id: '100', time: '2026-09-19T09:00:00Z', body: text('<span>The original question</span>') })}
    ${post({ id: '121', time: '2026-09-19T09:30:00Z', body: text('<span>1/ Thread start</span>') })}
    ${post({ id: '122', time: '2026-09-19T09:31:00Z', body: text('<span>2/ Middle</span>') })}
    ${post({ id: '123', focal: true, body: text('<span>3/ Focal</span>') })}
    ${post({ id: '124', time: '2026-09-19T10:01:00Z', body: text('<span>4/ After</span><button data-testid="tweet-text-show-more-link">Show more</button>') })}
    ${post({ handle: 'carol', name: 'Carol', id: '200', body: text('<span>Nice thread</span>') })}
    ${post({ id: '125', time: '2026-09-19T10:02:00Z', body: text('<span>Thanks Carol</span>') })}
  </main>`;
  const result = await extract(html);
  assert.equal(result.kind, 'thread');
  assert.equal(result.title, '1/ Thread start');
  assert.match(result.markdown, /^By Alice @alice\n\nPublished: 2026-09-19T09:30:00Z\n\nSource: https:\/\/x\.com\/alice\/status\/123\n\n/);
  assert.match(result.markdown, /In reply to:\n\n> \[Bob @bob\]\(<https:\/\/x\.com\/bob\/status\/100>\)\n>\n> The original question\n\n1\/ Thread start\n\n---\n\n2\/ Middle\n\n---\n\n3\/ Focal\n\n---\n\n4\/ After\n$/);
  assert.doesNotMatch(result.markdown, /Nice thread|Thanks Carol|Show more/);
  assert.equal(result.stats.posts, 4);
  assert.equal(result.stats.embeds, 0, "the post being replied to is context, not a quoted post");
  assert.ok(result.warnings.some(x => /Show more/.test(x)));
});

test('quotes the embedded post by its span-only byline and renders polls and link cards as text', async () => {
  const result = await extract(`<main>${post({ focal: true, body: `
    ${text('<span>Look at this</span>')}
    <span>Quote</span>
    <div role="link" tabindex="0">
      <div data-testid="Tweet-User-Avatar"><img src="https://pbs.twimg.com/profile_images/d.jpg" alt=""></div>
      <div data-testid="User-Name"><span><span>Dana</span></span><div tabindex="-1"><span>@dana</span></div><span>·</span><time datetime="2026-01-01T00:00:00Z">Jan 1</time></div>
      ${text('<span>Quoted words</span>')}
      ${photo('q', 'Quoted photo')}
    </div>
    <div data-testid="cardPoll"><div><span>Yes</span><span>60%</span></div><div><span>No</span><span>40%</span></div><span>10 votes</span></div>
    <div data-testid="card.wrapper"><a href="https://t.co/card"><img src="https://pbs.twimg.com/card_img/1/x?format=jpg"><span>example.com</span><span>Card title</span></a></div>` })}</main>`);
  assert.match(result.markdown, /Look at this\n\n> \[Dana @dana\]\(<https:\/\/x\.com\/dana>\)\n>\n> Quoted words\n>\n> !\[Quoted photo\]/);
  assert.match(result.markdown, /- Yes 60%\n- No 40%\n- 10 votes/);
  assert.match(result.markdown, /\[example\.com · Card title\]\(<https:\/\/t\.co\/card>\)/);
  assert.doesNotMatch(result.markdown, /card_img|Quote\n/);
  assert.equal(result.stats.embeds, 1);
});

test('finds the focal post by its date link when nothing is focused, and reports loading and wrong pages', async () => {
  const byLink = await extract(`<main>${post({ focal: true, body: text('<span>Hi</span>') }).replace('tabindex="-1"', 'tabindex="0"')}</main>`);
  assert.equal(byLink.ok, true);
  assert.equal(byLink.title, 'Hi');
  const loading = await extract(`<main>${post({ id: '999', body: text('<span>Other</span>') })}</main>`);
  assert.equal(loading.ok, false);
  assert.match(loading.error, /loading/i);
  const dom = new JSDOM(`<main>${post({ focal: true, body: text('<span>Hi</span>') })}</main>`, { url: 'https://x.com/alice', runScripts: 'outside-only' });
  const source = await readFile(new URL('../extension/extract.js', import.meta.url), 'utf8');
  dom.window.eval(source.replace('export function', 'function'));
  const profile = dom.window.extractArticle();
  dom.window.close();
  assert.equal(profile.ok, false);
  assert.match(profile.error, /own tab/i);
});
