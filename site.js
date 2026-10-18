import {featureIds, screenshots} from './features.js';
import {languages, isLanguage} from './languages.js';

const translations = Object.fromEntries(await Promise.all(languages.map(async ({id}) => {
  const response = await fetch(`locales/${id}.json`);
  if (!response.ok) throw Error(`Could not load website language: ${id}`);
  return [id, await response.json()];
})));
const storageKey = 'bendorithm.website.language';
let locale = 'en';
try {
  const saved = localStorage.getItem(storageKey);
  if (isLanguage(saved)) locale = saved;
} catch { /* Browsing without persistent storage still supports switching languages. */ }
const requested = new URL(location.href).searchParams.get('lang');
if (isLanguage(requested)) locale = requested;
let category = 'all', heroView = 'machine-full', modalView = null;
let available = new Set(), config = {};

const node = (tag, cls, text) => {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
};
const content = () => translations[locale];

function renderFeatures() {
  const root = document.querySelector('#feature-grid');
  root.replaceChildren();
  featureIds.forEach((id, index) => {
    const feature = content().features[id];
    const section = node('article', 'feature');
    const head = node('div', 'feature-heading');
    head.append(node('span', 'feature-index', String(index + 1).padStart(2, '0')), node('h3', '', feature.title));
    const details = node('details'), list = node('ul');
    feature.items.forEach(item => list.append(node('li', '', item)));
    details.append(node('summary', '', content().copy.list + ' · ' + feature.items.length), list);
    section.append(head, node('p', '', feature.intro), details);
    root.append(section);
  });
}

function updateImageDescriptions() {
  document.querySelector('#hero-shot').alt = content().screenshots[heroView];
  if (modalView) {
    const title = content().screenshots[modalView];
    document.querySelector('#large-image').alt = title;
    document.querySelector('#image-caption').textContent = title;
  }
}

function renderGallery() {
  const filters = document.querySelector('#gallery-filters'), root = document.querySelector('#gallery-grid');
  filters.replaceChildren();
  for (const id of ['all', 'drawing', 'machine', 'planning', 'projects', 'tools', 'export', 'workspace']) {
    const button = node('button', '', content().copy[id]);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(category === id));
    button.onclick = () => { category = id; renderGallery(); };
    filters.append(button);
  }
  root.replaceChildren();
  for (const {id, group} of screenshots) {
    if (!available.has(id) || category !== 'all' && category !== group) continue;
    const title = content().screenshots[id];
    const figure = node('figure', 'gallery-item'), button = node('button'), img = node('img');
    button.type = 'button';
    img.src = `assets/screenshots/thumbs/${id}.webp`;
    img.srcset = `assets/screenshots/thumbs/${id}.webp 720w, assets/screenshots/${id}.webp 1600w`;
    img.sizes = '(max-width:700px) calc(100vw - 32px), 580px';
    img.alt = title;
    img.width = 1600;
    img.height = 1000;
    img.loading = 'lazy';
    button.setAttribute('aria-label', content().copy.view + ': ' + title);
    button.append(img);
    button.onclick = () => {
      modalView = id;
      document.querySelector('#large-image').src = `assets/screenshots/${id}.webp`;
      updateImageDescriptions();
      document.querySelector('#image-dialog').showModal();
    };
    const caption = node('figcaption');
    caption.append(node('span', '', title), node('span', '', '↗'));
    figure.append(button, caption);
    root.append(figure);
  }
}

function renderFaq() {
  const root = document.querySelector('#faq-list');
  root.replaceChildren();
  for (const [question, answer] of content().faq) {
    const details = node('details');
    details.append(node('summary', '', question), node('p', '', answer));
    root.append(details);
  }
}

function renderDownload() {
  const link = document.querySelector('#download-link'), pending = document.querySelector('#download-pending');
  const validRepo = typeof config.releaseRepository === 'string' && /^[\w.-]+\/[\w.-]+$/.test(config.releaseRepository);
  const validAsset = typeof config.windowsAssetName === 'string' && /^[\w .()-]+\.exe$/i.test(config.windowsAssetName);
  link.hidden = !(validRepo && validAsset && config.version);
  pending.hidden = !link.hidden;
  if (!link.hidden) {
    link.href = 'https://github.com/' + config.releaseRepository + '/releases/latest/download/' + encodeURIComponent(config.windowsAssetName);
    document.querySelector('#release-status').textContent = `${content().copy.version} ${config.version} · GitHub Releases`;
  }
}

function applyLanguage() {
  const copy = content().copy;
  document.documentElement.lang = locale;
  document.documentElement.dir = languages.find(language => language.id === locale).dir;
  // Authored locale text can contain only the deliberate heading line breaks.
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const lines = copy[element.dataset.i18n].split('<br>');
    element.replaceChildren();
    lines.forEach((line, index) => {
      if (index) element.append(document.createElement('br'));
      element.append(document.createTextNode(line));
    });
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(element => {
    element.setAttribute('aria-label', copy[element.dataset.i18nAria]);
  });
  document.querySelector('#language').value = locale;
  document.title = copy.pageTitle;
  document.querySelector('meta[name="description"]').content = copy.pageDescription;
  for (const track of document.querySelector('#walkthrough-video').textTracks) {
    track.mode = track.language === locale ? 'showing' : 'disabled';
  }
  updateImageDescriptions();
  renderFeatures();
  renderGallery();
  renderFaq();
  renderDownload();
}

const languageSelect = document.querySelector('#language');
for (const {id, name} of languages) {
  const option = node('option', '', name);
  option.value = id;
  option.lang = id;
  languageSelect.append(option);
}
languageSelect.onchange = () => {
  if (!isLanguage(languageSelect.value)) return;
  locale = languageSelect.value;
  try { localStorage.setItem(storageKey, locale); } catch { /* Optional persistence. */ }
  const url = new URL(location.href);
  url.searchParams.set('lang', locale);
  history.replaceState(null, '', url);
  applyLanguage();
};
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
  document.querySelectorAll('[data-view]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
  heroView = button.dataset.view;
  document.querySelector('#hero-shot').src = `assets/screenshots/${heroView}.webp`;
  updateImageDescriptions();
});
document.querySelector('#close-image').onclick = () => document.querySelector('#image-dialog').close();

await Promise.all([
  fetch('assets/screenshots/manifest.json').then(response => response.ok ? response.json() : []).then(data => {
    available = new Set(data.map(screenshot => screenshot.id));
  }).catch(() => {}),
  fetch('config.json').then(response => response.ok ? response.json() : {}).then(data => { config = data; }).catch(() => {}),
]);
applyLanguage();
