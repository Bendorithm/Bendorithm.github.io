import {languages} from './languages.js';

export function createLanguagePicker(root, onSelect) {
  const trigger = root.querySelector('#language');
  const panel = root.querySelector('#language-panel');
  const heading = root.querySelector('#language-title');
  const closeButton = root.querySelector('.language-close');
  const options = root.querySelector('.language-options');
  let selected = 'en';

  const close = (restoreFocus = false) => {
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  };
  const open = () => {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    options.querySelector(`[data-language="${selected}"]`).focus();
  };

  for (const {id, name, dir} of languages) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.language = id;
    button.setAttribute('aria-pressed', 'false');
    const label = document.createElement('span');
    label.className = 'language-option-name';
    const flag = document.createElement('img');
    flag.src = `assets/flags/${id}.svg`;
    flag.className = 'language-flag';
    flag.width = 24;
    flag.height = 16;
    flag.alt = '';
    flag.setAttribute('aria-hidden', 'true');
    const text = document.createElement('bdi');
    text.lang = id;
    text.dir = dir;
    text.textContent = name;
    label.append(flag, text);
    button.append(label);
    button.onclick = () => {
      onSelect(id);
      close(true);
    };
    options.append(button);
  }

  trigger.onclick = () => panel.hidden ? open() : close(true);
  closeButton.onclick = () => close(true);
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target)) close();
  });
  root.addEventListener('focusout', event => {
    if (event.relatedTarget && !root.contains(event.relatedTarget)) close();
  });
  root.addEventListener('keydown', event => {
    if (panel.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    const buttons = [...options.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      buttons[next].focus();
    }
  });

  return {
    update(locale, copy) {
      selected = locale;
      trigger.setAttribute('aria-label', copy.language);
      trigger.title = copy.language;
      heading.textContent = copy.language;
      closeButton.setAttribute('aria-label', copy.closeLanguage);
      for (const button of options.querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.language === locale));
      }
    },
  };
}
