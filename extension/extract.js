/* Markdown conversion adapted from everettjf/x-article-export-pdf (MIT).
 * Copyright (c) 2026 everettjf. See LICENSE.
 */

// Self-contained: Chrome serializes this function into the selected tab's
// isolated world. No page globals, credentials, API calls, or persistent hooks.
export function extractArticle() {
  const warnings = new Set();
  const images = new Set();
  let embeds = 0;
  const source = `${location.origin}${location.pathname}`;
  const isX = ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(location.hostname);
  const fail = (error) => ({ ok: false, error, source });
  if (!isX) {
    return fail('Open an X article first.');
  }
  const bodySelector = '[data-testid="twitterArticleRichTextView"], [data-testid="twitterArticleRichText"]';
  const visible = (el) => !el.closest('[hidden], [aria-hidden="true"]') &&
    ![el, ...ancestors(el)].some(x => x.style?.display === 'none' || x.style?.visibility === 'hidden');
  const candidates = [...document.querySelectorAll(bodySelector)].filter(visible);
  if (candidates.length !== 1) {
    return fail(candidates.length ? 'More than one article is open. Open the article in its own tab.' :
      'No full article found. Open the article (not its preview), wait for it to load, and retry.');
  }
  const body = candidates[0];
  const readView = body.closest('[data-testid="twitterArticleReadView"]') || body;
  const context = readView.closest('article') || readView;
  if (body.closest('[aria-busy="true"]') || body.querySelector('[role="progressbar"], [aria-busy="true"]')) {
    return fail('The article is still loading. Wait and retry.');
  }
  const titleEl = readView.querySelector('[data-testid="twitter-article-title"]') || context.querySelector('h1');
  const title = titleEl?.textContent.trim();
  if (!title) return fail('The article title is missing. Wait for the article to load and retry.');
  const byline = [...context.querySelectorAll('[data-testid="User-Name"]')].find(el => !body.contains(el));
  const name = byline ? [...byline.querySelectorAll('a')].map(x => x.textContent.trim()).filter(Boolean) : [];
  const authorMeta = [...context.querySelectorAll('[itemprop="author"]')].find(el => !body.contains(el) || el.parentElement === body);
  if (!name.length && authorMeta) {
    const n = authorMeta.querySelector('[itemprop="name"]')?.getAttribute('content');
    const h = authorMeta.querySelector('[itemprop="additionalName"]')?.getAttribute('content');
    if (n) name.push(n);
    if (h) name.push(`@${h.replace(/^@/, '')}`);
  }
  const handle = location.pathname.match(/^\/([\w]{1,15})\/(?:status|article)\//)?.[1];
  const author = [...new Set(name)].join(' ') || (handle && handle !== 'i' ? `@${handle}` : '');
  const timeEl = [...context.querySelectorAll('time[datetime]')].find(el => !body.contains(el));
  const published = timeEl?.getAttribute('datetime') || '';
  const content = render(body).trim();
  if (!content) return fail('The article body is empty. Wait for it to load and retry.');
  const cover = [...readView.querySelectorAll('img')].filter(img => !body.contains(img)).map(renderImage).filter(Boolean).join('\n\n');
  const markdown = [
    `# ${escape(title)}`, author ? `By ${escape(author)}` : '',
    published ? `Published: ${escape(published)}` : '', `Source: ${source}`,
    cover, content,
  ].filter(Boolean).join('\n\n') + '\n';
  // ponytail: word count includes link URLs and Markdown syntax; close enough for a summary line.
  const words = content.split(/\s+/).filter(Boolean).length;
  return { ok: true, title, author, source, markdown, stats: { words, images: images.size, embeds }, warnings: [...warnings] };

  function ancestors(el) {
    const out = [];
    for (let parent = el.parentElement; parent; parent = parent.parentElement) out.push(parent);
    return out;
  }
  function escape(text) {
    return String(text).replace(/[\\`*_[\]<>|#!]/g, '\\$&');
  }
  function url(value) {
    try {
      const parsed = new URL(value, location.href);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  }
  function destination(href) {
    return `<${href.replace(/</g, '%3C').replace(/>/g, '%3E').replace(/\s/g, '%20')}>`;
  }
  function fenced(text, language = '') {
    const length = Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1));
    const fence = '`'.repeat(length);
    return `${fence}${language.replace(/[^\w+-]/g, '')}\n${text.replace(/\n$/, '')}\n${fence}\n\n`;
  }
  function inlineCode(text) {
    const fence = '`'.repeat(Math.max(1, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));
    const pad = /^`|`$|^ .* $/.test(text) ? ' ' : '';
    return `${fence}${pad}${text}${pad}${fence}`;
  }
  function children(el) { return [...el.childNodes].map(render).join(''); }
  function block(value) {
    const text = value.trim();
    return text ? `${text}\n\n` : '';
  }
  function renderImage(img) {
    const raw = img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (/\/emoji\//.test(raw)) return img.alt || '';
    if (/\/profile_images\/|\/hashflags\//.test(raw)) return '';
    let src = raw ? url(raw) : '';
    if (!src) { warnings.add('An image has no usable URL. Scroll to it and retry.'); return '[Image unavailable]'; }
    const parsed = new URL(src);
    if (parsed.hostname === 'pbs.twimg.com' && parsed.pathname.startsWith('/media/')) {
      parsed.searchParams.set('name', 'orig');
      src = parsed.href;
    }
    images.add(src);
    return `![${escape(img.alt || '')}](${destination(src)})`;
  }
  function list(el) {
    let number = Number(el.getAttribute('start')) || 1;
    const rows = [...el.children].filter(x => x.tagName === 'LI').map(li => {
      const depth = Math.min(12, Number(li.className.match(/depth(\d+)/)?.[1]) || 0);
      const indent = '  '.repeat(depth);
      if (li.hasAttribute('value')) number = Number(li.getAttribute('value')) || number;
      const marker = el.tagName === 'OL' ? `${number++}. ` : '- ';
      const text = [...li.childNodes].map(child => /^(UL|OL)$/.test(child.nodeName) ? `\n${render(child).trimEnd()}` : render(child)).join('').trim();
      const lines = text.split('\n');
      return indent + marker + lines[0] + lines.slice(1).map(line => `\n${indent}${' '.repeat(marker.length)}${line}`).join('');
    });
    return rows.join('\n') + '\n\n';
  }
  function table(el) {
    const rows = [...el.querySelectorAll('tr')].map(tr => [...tr.children].filter(c => /^(TD|TH)$/.test(c.tagName))
      .map(c => children(c).trim().replace(/\n+/g, '<br>'))).filter(r => r.length);
    if (!rows.length) return '';
    if (el.querySelector('[rowspan], [colspan]')) warnings.add('A table uses merged cells; its Markdown layout is simplified.');
    const width = Math.max(...rows.map(r => r.length));
    if (!el.querySelector('tr th')) rows.unshift(Array(width).fill(''));
    rows.splice(1, 0, Array(width).fill('---'));
    return rows.map(row => `| ${Array.from({ length: width }, (_, i) => row[i] || '').join(' | ')} |`).join('\n') + '\n\n';
  }
  function embedded(el) {
    embeds++;
    const by = el.querySelector('[data-testid="User-Name"]');
    const attribution = by ? [...by.querySelectorAll('a')].map(a => a.textContent.trim()).filter(Boolean).join(' ') : 'Embedded post';
    const permalink = [...el.querySelectorAll('a[href]')].map(a => url(a.getAttribute('href')))
      .find(h => /^https:\/\/(?:www\.)?(?:x|twitter)\.com\//.test(h));
    const statusLink = [...el.querySelectorAll('a[href]')].map(a => url(a.getAttribute('href')))
      .find(h => /\/(?:status|article)\/\d+(?:[?#]|$)/.test(h));
    const text = el.querySelector('[data-testid="tweetText"]');
    let content = text ? children(text).trim() : '';
    if (!text) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('[data-testid="User-Name"], img, time, button, svg, script, style').forEach(x => x.remove());
      content = children(clone).trim();
      if (!content) warnings.add('An embedded post has no loaded text; its available link/media were retained.');
    }
    const media = [...el.querySelectorAll('img')].map(renderImage).filter(Boolean).join('\n\n');
    const href = statusLink || permalink;
    const quote = [href ? `[${escape(attribution)}](${destination(href)})` : escape(attribution), content, media].filter(Boolean).join('\n\n');
    return quote.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';
  }
  function render(node) {
    if (node.nodeType === 3) {
      if (!node.nodeValue.trim() && /[\r\n]/.test(node.nodeValue)) return '';
      return escape(node.nodeValue.replace(/[\t\r\n ]+/g, ' '));
    }
    if (node.nodeType !== 1) return '';
    const el = node;
    const tag = el.tagName;
    const id = el.getAttribute('data-testid');
    if (el === titleEl || el === authorMeta || /^(SCRIPT|STYLE|NOSCRIPT|SVG|BUTTON|INPUT|TEXTAREA|FORM|NAV|IFRAME)$/.test(tag) ||
      el.matches('[hidden], [aria-hidden="true"]') || el.style.display === 'none') return '';
    if (el.matches('[role="button"]') && !el.matches('[data-testid="tweetPhoto"], [data-testid="simpleTweet"], [data-testid="videoPlayer"]') &&
      !el.querySelector('img, video, [data-testid="simpleTweet"], [data-testid="videoPlayer"]')) return '';
    if (id === 'simpleTweet' || (id === 'tweet' && el !== context)) return embedded(el);
    if (id === 'markdown-code-block') {
      const code = el.querySelector('pre code') || el.querySelector('pre');
      const language = code?.className.match(/language-([\w+-]+)/)?.[1] || el.querySelector('span')?.textContent.trim() || '';
      return code ? fenced(code.textContent, language) : block(children(el));
    }
    if (tag === 'PRE') return fenced(el.textContent, el.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1]);
    if (el.classList.contains('katex')) {
      const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      return tex ? (el.querySelector('math[display="block"]') ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`) : escape(el.textContent);
    }
    if (id === 'videoPlayer' || tag === 'VIDEO') {
      warnings.add('Videos are linked; video/audio content is not transcribed.');
      const video = tag === 'VIDEO' ? el : el.querySelector('video');
      const raw = video?.getAttribute('src') || video?.querySelector('source')?.getAttribute('src');
      const href = (raw && url(raw)) || source;
      return block(`[Watch video](${destination(href)})`);
    }
    if (tag === 'IMG') return /\/emoji\//.test(el.getAttribute('src') || '') ? renderImage(el) : block(renderImage(el));
    if (tag === 'BR') return '\n';
    if (tag === 'HR' || el.getAttribute('role') === 'separator') return '\n\n---\n\n';
    if (tag === 'UL' || tag === 'OL') return list(el);
    if (tag === 'TABLE') return table(el);
    const text = children(el);
    if (tag === 'FIGCAPTION') return block(text);
    if (id === 'tweetPhoto') return block(text);
    if (tag === 'A') {
      // Images retain their direct media URLs, not X's lightbox links.
      if (el.querySelector('img')) return text;
      const raw = el.getAttribute('href');
      const href = raw && url(raw);
      if (!href) return text;
      let expanded = href;
      if (new URL(href).hostname === 't.co') {
        const label = el.getAttribute('title') || el.textContent.trim();
        if (/^https?:\/\//.test(label) && !label.includes('…') && !label.includes('...')) expanded = url(label) || href;
      }
      return `[${text || escape(expanded)}](${destination(expanded)})`;
    }
    if (tag === 'CODE') return inlineCode(el.textContent);
    const wrap = (marker) => text.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, start, value, end) => value ? `${start}${marker}${value}${marker}${end}` : text);
    const bold = tag === 'STRONG' || tag === 'B' || /^(bold|[7-9]00)$/.test(el.style.fontWeight);
    const italic = tag === 'EM' || tag === 'I' || el.style.fontStyle === 'italic';
    if (bold || italic) return wrap((bold ? '**' : '') + (italic ? '*' : ''));
    if (tag === 'S' || tag === 'DEL' || /line-through/.test(el.style.textDecoration)) return wrap('~~');
    if (/^H[1-6]$/.test(tag)) return block(`${'#'.repeat(Number(tag[1]))} ${text.trim()}`);
    if (tag === 'BLOCKQUOTE') return block(text.trim().split('\n').map(line => `> ${line}`).join('\n'));
    if (tag === 'P' || tag === 'FIGCAPTION' || tag === 'FIGURE' || el.getAttribute('data-block') === 'true' ||
      /(?:^|\s)(?:longform-unstyled(?:-narrow)?|public-DraftStyleDefault-block)(?:\s|$)/.test(el.className || '')) return block(text);
    return text;
  }
}
