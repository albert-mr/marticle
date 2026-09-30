import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { marked } from '../extension/vendor/marked.esm.js';

const markdown = `# Test \\*article\\*: draft/final?

By Alice Example @alice

Published: 2026-09-19T10:00:00Z

Source: https://x.com/alice/status/123

![Cover](<https://pbs.twimg.com/media/cover?format=jpg&name=orig>)

## A heading

Hello **bold** with a [link](<https://example.org/a_(b)>) and literal \\[x\\].

> [Bob @bob](<https://x.com/bob/status/456>)
>
> Embedded text

Safe <a href="javascript:alert(1)">label</a><script>bad()</script><img src="x" onerror="bad()">
`;
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function page(hash = markdown) {
  const html = await readFile(new URL('../extension/print.html', import.meta.url), 'utf8');
  const url = 'https://extension.example/print.html' + (hash ? `#${encodeURIComponent(hash)}` : '');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const state = { prints: 0 };
  dom.window.print = () => state.prints++;
  dom.window.marked = marked;
  const source = await readFile(new URL('../extension/print.js', import.meta.url), 'utf8');
  dom.window.eval(`(async () => { ${source.replace(/^import .*;$/m, '')} })()`);
  await tick();
  const $ = selector => dom.window.document.querySelector(selector);
  const loadImages = async () => { for (const img of dom.window.document.images) img.dispatchEvent(new dom.window.Event('load')); await tick(); };
  return { dom, state, $, loadImages, close: () => dom.window.close() };
}

test('renders the article header, body and source from the Markdown', async () => {
  const p = await page();
  try {
    assert.equal(p.$('#title').innerHTML, 'Test *article*: draft/final?');
    assert.equal(p.dom.window.document.title, 'Test *article*: draft/final?');
    assert.equal(p.$('#name').textContent, 'Alice Example');
    assert.match(p.$('#byline').textContent, /^@alice · .*2026$/);
    assert.equal(p.$('#avatar').textContent, 'A');
    assert.equal(p.$('#source').href, 'https://x.com/alice/status/123');
    const body = p.$('#body');
    assert.equal(body.querySelector('h2').textContent, 'A heading');
    assert.equal(body.querySelector('strong').textContent, 'bold');
    assert.equal(body.querySelector('a[href^="https://example.org"]').href, 'https://example.org/a_(b)');
    assert.match(body.textContent, /literal \[x\]/);
    assert.match(body.querySelector('blockquote').textContent, /Bob @bob[\s\S]*Embedded text/);
    assert.doesNotMatch(body.textContent, /^# |By Alice|Published:|Source:/m);
  } finally { p.close(); }
});

test('downsizes X images to "large" and swaps broken ones for a link', async () => {
  const p = await page();
  try {
    const img = p.$('#body img');
    assert.equal(img.src, 'https://pbs.twimg.com/media/cover?format=jpg&name=large');
    img.dispatchEvent(new p.dom.window.Event('error'));
    assert.equal(p.$('#body img'), null);
    assert.match(p.$('#body a.broken').textContent, /Image unavailable/);
  } finally { p.close(); }
});

test('strips scripts, inline handlers and non-http URLs from the body', async () => {
  const p = await page();
  try {
    const body = p.$('#body');
    assert.equal(body.querySelector('script'), null);
    assert.equal(body.querySelector('[onerror]'), null);
    assert.equal(body.querySelector('a[href^="javascript"]'), null);
    assert.equal(body.querySelector('img[src="x"]'), null);
    assert.match(body.textContent, /Safe label/);
  } finally { p.close(); }
});

test('prints once the images have loaded, keeps the Markdown for a reload and drops the hash', async () => {
  const p = await page();
  try {
    assert.equal(p.state.prints, 0);
    await p.loadImages();
    assert.equal(p.state.prints, 1);
    assert.match(p.$('#hint').textContent, /Save as PDF/);
    assert.equal(p.dom.window.location.hash, '');
    assert.equal(p.dom.window.sessionStorage.getItem('markdown'), markdown);
    p.$('#print').click();
    assert.equal(p.state.prints, 2);
  } finally { p.close(); }
});

test('explains itself instead of printing an empty page', async () => {
  const p = await page('');
  try {
    assert.match(p.$('#hint').textContent, /Nothing to print/);
    await p.loadImages();
    assert.equal(p.state.prints, 0);
    assert.equal(p.$('#title').textContent, '');
  } finally { p.close(); }
});
