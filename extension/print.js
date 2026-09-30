import { marked } from './vendor/marked.esm.js';

const $ = selector => document.querySelector(selector);
const hint = $('#hint');

// The popup hands the Markdown over in the URL hash. Keep a per-tab copy and drop the hash so a reload
// still works and Chrome's print footer shows a short URL instead of the whole article.
const hash = location.hash.slice(1);
const markdown = hash ? decodeURIComponent(hash) : sessionStorage.getItem('markdown') || '';
if (hash) {
  sessionStorage.setItem('markdown', markdown);
  history.replaceState(null, '', location.pathname);
}

$('#print').addEventListener('click', () => window.print());

if (!markdown.trim()) {
  hint.textContent = 'Nothing to print. Open an article on x.com and click Marticle → PDF.';
  $('.article').hidden = true;
} else {
  render(parse(markdown));
  await settled(document.images);
  hint.textContent = 'In the print dialog choose “Save as PDF”. Untick “Headers and footers” for a clean page.';
  window.print();
}

// extract.js writes "# Title", "By …", "Published: …", "Source: …" as the leading blocks, in that order.
function parse(text) {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const meta = { title: '', author: '', published: '', source: '' };
  const fields = [['title', /^# (.+)$/], ['author', /^By (.+)$/], ['published', /^Published: (\S+)$/], ['source', /^Source: (https?:\/\/\S+)$/]];
  while (blocks.length) {
    const found = fields.find(([, pattern]) => pattern.test(blocks[0].trim()));
    if (!found) break;
    meta[found[0]] = blocks.shift().trim().match(found[1])[1];
  }
  return { ...meta, body: blocks.join('\n\n') };
}

function render({ title, author, published, source, body }) {
  $('#title').innerHTML = marked.parseInline(title) || 'Untitled';
  document.title = $('#title').textContent;

  const [, name, handle] = author.match(/^(.*?)\s*(@\S+)?$/);
  const date = published && (Number.isNaN(Date.parse(published)) ? published
    : new Date(published).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }));
  $('#name').innerHTML = marked.parseInline(name || handle || 'Unknown author');
  $('#byline').textContent = [name && handle, date].filter(Boolean).join(' · ');
  $('#avatar').textContent = $('#name').textContent.replace(/^@/, '').charAt(0).toUpperCase();

  const container = $('#body');
  container.innerHTML = marked.parse(body);
  // The Markdown was escaped by extract.js, so this is belt and braces: extension CSP already blocks inline scripts.
  container.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form').forEach(el => el.remove());
  for (const el of container.querySelectorAll('*')) {
    for (const { name: attr } of [...el.attributes]) if (/^on/i.test(attr)) el.removeAttribute(attr);
    for (const attr of ['href', 'src', 'srcset']) {
      if (el.hasAttribute(attr) && !/^https?:\/\//i.test(el.getAttribute(attr).trim())) el.removeAttribute(attr);
    }
  }
  container.querySelectorAll('img:not([src])').forEach(el => el.remove());
  for (const img of container.querySelectorAll('img')) {
    // ponytail: "large" is 2048px, plenty for an A4 column and several times smaller than "orig".
    img.src = img.src.replace(/^(https:\/\/pbs\.twimg\.com\/media\/[^?]+\?[^#]*?\bname=)orig\b/, '$1large');
    img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('a'),
      { href: img.src, className: 'broken', textContent: `Image unavailable: ${img.src}` })), { once: true });
  }

  if (source) {
    $('#source').href = source;
    $('#source').textContent = source;
    $('#foot').hidden = false;
  }
}

// Print preview snapshots the page, so wait for the images; a stalled CDN gets 15 seconds, not forever.
function settled(images) {
  const done = img => img.complete ? Promise.resolve()
    : new Promise(resolve => ['load', 'error'].forEach(type => img.addEventListener(type, resolve, { once: true })));
  return Promise.race([Promise.all([...images].map(done)), new Promise(resolve => setTimeout(resolve, 15000))]);
}
