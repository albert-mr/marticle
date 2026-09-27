import { extractArticle } from './extract.js';

const $ = selector => document.querySelector(selector);
const title = $('#title'), status = $('#status'), button = $('#copy'), warnings = $('#warnings'), preview = $('#preview');
let article;

function show(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

async function load() {
  article = null;
  button.disabled = true;
  button.textContent = 'Copy as Markdown';
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
    const plural = (n, word) => n && `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
    title.textContent = article.title;
    const stats = [plural(words, 'word'), plural(images, 'image'), plural(embeds, 'embedded post')].filter(Boolean).join(' · ');
    show([article.author && `by ${article.author}`, stats].filter(Boolean).join('\n'));
    preview.value = article.markdown;
    warnings.replaceChildren(...article.warnings.map(text => Object.assign(document.createElement('li'), { textContent: text })));
    warnings.hidden = !article.warnings.length;
  } catch (error) {
    title.textContent = 'Nothing to copy';
    show(error.message, true);
    button.textContent = 'Try again';
  }
  button.disabled = false;
}

async function copy() {
  try {
    await navigator.clipboard.writeText(article.markdown);
    button.textContent = 'Copied ✓';
    setTimeout(() => { button.textContent = 'Copy as Markdown'; }, 1500);
  } catch {
    $('details').open = true;
    preview.focus();
    preview.select();
    show('Clipboard blocked. Copy the text below by hand.', true);
  }
}

button.addEventListener('click', () => (article ? copy() : load()));
load();
