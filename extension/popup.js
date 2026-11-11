import { extractArticle } from './extract.js';

const $ = selector => document.querySelector(selector);
const card = $('#card'), kind = $('#kind'), title = $('#title'), status = $('#status'), live = $('#live');
const actions = $('.actions'), copyButton = $('#copy'), saveButton = $('#save'), pdfButton = $('#pdf');
const warnings = $('#warnings'), details = $('details'), preview = $('#preview');
let article;

function show(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function label(icon, text) {
  copyButton.querySelector('use').setAttribute('href', `#i-${icon}`);
  copyButton.querySelector('span').textContent = text;
  copyButton.classList.toggle('done', icon === 'check');
}
const plural = (n, word) => n && `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

async function load() {
  article = null;
  card.setAttribute('aria-busy', 'true');
  kind.textContent = '';
  title.textContent = 'Reading this page…';
  show('');
  label('copy', 'Copy as Markdown');
  copyButton.disabled = saveButton.disabled = pdfButton.disabled = true;
  actions.hidden = saveButton.hidden = pdfButton.hidden = details.hidden = false;
  warnings.hidden = true;
  preview.value = '';
  // Only a long thread takes this long: Marticle is scrolling the page to collect it, so say why it moves.
  const slow = setTimeout(() => show('Collecting the whole thread. The page scrolls down, then back to where you were.'), 1200);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const host = tab?.url ? new URL(tab.url).hostname : '';
    if (!/^(www\.|mobile\.)?(x|twitter)\.com$/.test(host)) {
      title.textContent = 'Open a post on X';
      show('Marticle turns posts, threads and Articles on x.com into Markdown. Open one, then click Marticle again.');
      actions.hidden = details.hidden = true;
      return;
    }
    const [response] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractArticle });
    const result = response?.result;
    if (!result?.ok) throw new Error(result?.error || 'The page gave nothing back. Reload it, then try again.');
    article = result;
    const { words, images, embeds, posts } = article.stats;
    const isArticle = article.kind === 'article';
    const stats = [isArticle ? `${Math.max(1, Math.round(words / 200))} min read` : plural(posts > 1 && posts, 'post'),
      plural(images, 'image'), plural(embeds, isArticle ? 'embedded post' : 'quoted post')].filter(Boolean).join(' · ');
    kind.textContent = article.kind[0].toUpperCase() + article.kind.slice(1);
    title.textContent = article.title;
    show([article.author, stats].filter(Boolean).join('\n'));
    preview.value = article.markdown;
    warnings.querySelector('ul').replaceChildren(...article.warnings.map(text => Object.assign(document.createElement('li'), { textContent: text })));
    warnings.hidden = !article.warnings.length;
    copyButton.disabled = saveButton.disabled = pdfButton.disabled = false;
  } catch (error) {
    title.textContent = 'Couldn’t read this page';
    show(error.message, true);
    label('retry', 'Try again');
    copyButton.disabled = false;
    saveButton.hidden = pdfButton.hidden = details.hidden = true;
  } finally {
    clearTimeout(slow);
    card.removeAttribute('aria-busy');
    copyButton.focus(); // Enter copies, as the default button of a dialog would
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(article.markdown);
    label('check', 'Copied');
    live.textContent = 'Copied to the clipboard';
    setTimeout(() => { label('copy', 'Copy as Markdown'); live.textContent = ''; }, 1500);
  } catch {
    details.open = true;
    preview.focus();
    preview.select();
    show('Chrome blocked the clipboard. The Markdown is selected below, ready to copy by hand.', true);
  }
}

function save() {
  const name = [...article.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, 80).join('') || article.kind;
  const link = Object.assign(document.createElement('a'), { download: `${name}.md`,
    href: URL.createObjectURL(new Blob([article.markdown], { type: 'text/markdown' })) });
  link.click();
}

// The print page renders the Markdown and opens Chrome's print dialog; "Save as PDF" is a native destination.
function pdf() {
  chrome.tabs.create({ url: `${chrome.runtime.getURL('print.html')}#${encodeURIComponent(article.markdown)}` });
}

copyButton.addEventListener('click', () => (article ? copy() : load()));
saveButton.addEventListener('click', save);
pdfButton.addEventListener('click', pdf);
document.addEventListener('keydown', () => document.body.classList.add('keys'), { once: true });
load();
