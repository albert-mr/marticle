import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const article = { ok: true, title: 'Test article', author: 'Alice @alice', markdown: '# Test article\n\nContent\n', source: 'https://x.com/alice/status/123', stats: { words: 3, images: 1, embeds: 0 }, warnings: ['A table uses merged cells; its Markdown layout is simplified.'] };
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

async function popup({ url = article.source, extraction = article, clipboard = true } = {}) {
  const html = await readFile(new URL('../extension/popup.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://extension.example/popup.html', runScripts: 'outside-only' });
  const state = { writes: [], injected: false };
  dom.window.chrome = {
    tabs: { query: async () => [{ id: 7, url }] },
    scripting: { executeScript: async ({ target }) => { assert.equal(target.tabId, 7); state.injected = true; return [{ result: extraction }]; } },
  };
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async text => {
    if (!clipboard) throw new Error('denied');
    state.writes.push(text);
  } } });
  dom.window.extractArticle = () => {};
  const source = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  dom.window.eval(`(async () => { ${source.replace(/^import .*;$/m, '')} })()`);
  await tick();
  const $ = selector => dom.window.document.querySelector(selector);
  return { ...state, $, click: async selector => { $(selector).click(); await tick(); }, close: () => dom.window.close(), get injected() { return state.injected; } };
}

test('copies the article as Markdown', async () => {
  const p = await popup();
  try {
    assert.equal(p.$('#title').textContent, 'Test article');
    assert.equal(p.$('#status').textContent, 'by Alice @alice\n3 words · 1 image');
    assert.equal(p.$('#warnings').hidden, false);
    await p.click('#copy');
    assert.deepEqual(p.writes, [article.markdown]);
    assert.match(p.$('#copy').textContent, /Copied/);
  } finally { p.close(); }
});

test('falls back to a selectable preview when the clipboard is blocked', async () => {
  const p = await popup({ clipboard: false });
  try {
    await p.click('#copy');
    assert.equal(p.writes.length, 0);
    assert.equal(p.$('details').open, true);
    assert.equal(p.$('#preview').value, article.markdown);
    assert.match(p.$('#status').textContent, /clipboard/i);
  } finally { p.close(); }
});

test('shows the extraction error and offers a retry', async () => {
  const p = await popup({ extraction: { ok: false, error: 'No full article found.' } });
  try {
    assert.match(p.$('#status').textContent, /No full article/);
    assert.equal(p.$('#copy').textContent, 'Try again');
    assert.equal(p.$('#copy').disabled, false);
    assert.equal(p.$('#preview').value, '');
  } finally { p.close(); }
});

test('does not inject into tabs that are not on X', async () => {
  const p = await popup({ url: 'https://example.com/' });
  try {
    assert.equal(p.injected, false);
    assert.match(p.$('#status').textContent, /x\.com/);
  } finally { p.close(); }
});
