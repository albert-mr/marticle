import { extractArticle } from './extract.js';

const $ = selector => document.querySelector(selector);
const title = $('#title'), status = $('#status'), copyButton = $('#copy'), saveButton = $('#save'), pdfButton = $('#pdf'), warnings = $('#warnings'), preview = $('#preview');
let article;

function show(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
const plural = (n, word) => n && `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;

async function load() {
  article = null;
  copyButton.disabled = saveButton.disabled = pdfButton.disabled = true;
  copyButton.textContent = 'Copy as Markdown';
  copyButton.classList.remove('done');
  title.textContent = 'Reading article…';
  show('');
  warnings.hidden = true;
  preview.value = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const host = tab?.url ? new URL(tab.url).hostname : '';
    if (!/^(www\.|mobile\.)?(x|twitter)\.com$/.test(host)) throw new Error('Open an article on x.com, then click Marticle again.');
    const [response] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractArticle });
    const result = response?.result;
    if (!result?.ok) throw new Error(result?.error || 'The page returned nothing. Reload it and try again.');
    article = result;
    const { words, images, embeds } = article.stats;
    const stats = [`${Math.max(1, Math.round(words / 200))} min read`, plural(images, 'image'), plural(embeds, 'embedded post')].filter(Boolean).join(' · ');
    title.textContent = article.title;
    show([article.author, stats].filter(Boolean).join('\n'));
    preview.value = article.markdown;
    warnings.replaceChildren(...article.warnings.map(text => Object.assign(document.createElement('li'), { textContent: text })));
    warnings.hidden = !article.warnings.length;
    saveButton.disabled = pdfButton.disabled = false;
  } catch (error) {
    title.textContent = 'Nothing to copy';
    show(error.message, true);
    copyButton.textContent = 'Try again';
  }
  copyButton.disabled = false;
}

async function copy() {
  try {
    await navigator.clipboard.writeText(article.markdown);
    copyButton.textContent = '✓ Copied';
    copyButton.classList.add('done');
    setTimeout(() => { copyButton.textContent = 'Copy as Markdown'; copyButton.classList.remove('done'); }, 1500);
  } catch {
    $('details').open = true;
    preview.focus();
    preview.select();
    show('Clipboard blocked. Copy the text below by hand.', true);
  }
}

function save() {
  const name = article.title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'article';
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
load();
