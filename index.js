'use strict';

const SETTINGS_SCHEMA = [
  {
    key: 'show-future',
    type: 'boolean',
    title: 'Future',
    description:
      'Add hint for events in the future. Requires a page refresh to apply.',
    default: true,
  },
  {
    key: 'show-past',
    type: 'boolean',
    title: 'Past',
    description:
      'Add hint for events in the past. Requires a page refresh to apply.',
    default: true,
  },
  {
    key: 'minimum-interval',
    type: 'enum',
    title: 'Minimum interval',
    enumPicker: 'select',
    enumChoices: ['days', 'hours', 'minutes', 'seconds'],
    description:
      'If set to hours, the hint will only be shown if the interval is at least an hour. Requires a page refresh to apply.',
    default: 'hours',
  },
  {
    key: 'interval-choices',
    type: 'enum',
    title: 'Intervals to display',
    enumPicker: 'checkbox',
    enumChoices: ['years', 'months', 'days', 'hours', 'minutes', 'seconds'],
    description: 'How the intervals will be divided and displayed',
    default: ['hours', 'minutes', 'seconds'],
  },
  {
    key: 'short-interval-threshold',
    type: 'number',
    title: 'Short interval threshold',
    description:
      'Minimum time difference to be considered short. Value in seconds. Days: 86400, hours: 3600, minutes: 60. Any value below 1 disables the feature.',
    default: 3600,
  },
  {
    key: 'update-on-edit',
    type: 'boolean',
    title: 'Update on edit',
    description:
      'Dynamically updates hints when the time is edited. Requires a page refresh to apply. Note: May have a noticeable performance impact on pages with many schedule/deadline entries.',
    default: true,
  },
  {
    key: 'update-interval',
    type: 'number',
    title: 'Update interval',
    description:
      'Update hints at this interval (seconds). Any value below 1 disables this feature. Note: Updates have a performance cost. Setting the value lower than 600 (10 minutes) is not recommended.',
    default: 0,
  },
  {
    key: 'always-show-renderer',
    type: 'boolean',
    title: 'Always show renderer hints',
    description:
      'Always show renderer hints, regardless of the show-future/show-past and minimum-interval settings. Requires a page refresh to apply.',
    default: false,
  },
  {
    key: 'no-default-styles',
    type: 'boolean',
    title: 'Disable default styles',
    description:
      'Disables default CSS styling for hints. Note: Only useful when providing your own styles in "custom.css". Note: Requires Logseq restart/reload.',
    default: false,
  },
];

const INTERVALS = [
  ['y', 31536000],
  ['m', 2592000],
  ['d', 86400],
  ['h', 3600],
  ['m', 60],
  ['s', 1],
];
const INTERVALS_LOOKUP = Object.fromEntries(INTERVALS);

const PAST_CLASS = 'lsp-interval-hints-past',
  FUTURE_CLASS = 'lsp-interval-hints-future';
const MAIN_CLASS = 'lsp-interval-hints',
  SHORT_CLASS = 'lsp-interval-hints-short';
const LABEL_CLASS = 'lsp-interval-hints-label',
  RENDERER_CLASS = 'lsp-interval-hints-renderer';
const INTERVALPFX_CLASS = 'lsp-interval-hints-',
  HIDDEN_CLASS = 'hidden';
const CONTAINER_ELEMENT = 'span',
  ITEM_ELEMENT = 'span',
  LABEL_ELEMENT = 'span';
const TIMESTAMP_ATTRIBUTE = 'data-timestamp';

const APP_SELECTOR = '#app-container';
const HINT_SELECTOR = CONTAINER_ELEMENT + '.' + MAIN_CLASS;
const TIME_SELECTOR = '.timestamp time';

const STYLES = `
  .${MAIN_CLASS} { margin-left: 0.25em; padding-left: 0px; font-family: monospace; }

  .${FUTURE_CLASS} > .${LABEL_CLASS}::before { content: '⏳'; }
  .${FUTURE_CLASS}.${SHORT_CLASS} > .${LABEL_CLASS}::before { content: '⏰'; }
  .${PAST_CLASS} > .${LABEL_CLASS}::before { content: '⌛'; }

  .${MAIN_CLASS} > * { color: var(--ls-secondary-text-color); }
  .${MAIN_CLASS} > ::after ,
  .${MAIN_CLASS} > ::before { color: var(--ls-page-inline-code-color); font-size: 0.8em; }
  .${MAIN_CLASS} > :not(:last-child)::after ,
  .${MAIN_CLASS} > :not(:last-child)::before { padding-right: .2em; }
  .${INTERVALPFX_CLASS}d::after { content: 'D'; }
  .${INTERVALPFX_CLASS}h::after { content: 'H'; }
  .${INTERVALPFX_CLASS}m::after { content: 'M'; }
  .${INTERVALPFX_CLASS}s::after { content: 'S'; }
  `;

let cfgIntervalChoices = [];
let cfgShowFuture = true,
  cfgShowPast = true,
  cfgMinInterval = 60;
let cfgUpdateOnEdit = true,
  cfgUpdateInterval = null,
  cfgShortDuration = 3600;
let cfgAlwaysShowRenderer = false;

let updateTimer = null,
  appContainerEl = null;

let newEl, newText;

function clearChildren(node) {
  for (
    let child = node.lastChild;
    child;
    node.removeChild(child), child = node.lastChild
  ) {}
}

function msToSecs(ms) {
  return Math.trunc((ms instanceof Date ? ms.valueOf() : ms) / 1000);
}

function getIntervalFromStr(str) {
  switch (str) {
    case 'years':
      return ['y', 31536000];
    case 'months':
      return ['m', 2592000];
    case 'weeks':
      return ['w', 604800];
    case 'days':
      return ['d', 86400];
    case 'hours':
      return ['h', 3600];
    case 'minutes':
      return ['m', 60];
    case 'seconds':
      return ['s', 1];
  }
}

function settingsHandler(newSettings, _oldSettings) {
  cfgShowFuture = newSettings['show-future'] !== false;
  cfgShowPast = newSettings['show-past'] !== false;
  cfgUpdateOnEdit = newSettings['update-on-edit'] !== false;
  cfgAlwaysShowRenderer = newSettings['always-show-renderer'] !== false;
  cfgMinInterval =
    INTERVALS_LOOKUP[(newSettings['minimum-interval'] || 'm')[0]];
  cfgIntervalChoices =
    newSettings['interval-choices']?.map(getIntervalFromStr) || INTERVALS;
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  cfgUpdateInterval = newSettings['update-interval'];
  if (isNaN(cfgUpdateInterval) || cfgUpdateInterval < 1) {
    cfgUpdateInterval = null;
  } else {
    updateTimer = setTimeout(hintTimer, cfgUpdateInterval * 1000);
  }
  cfgShortDuration = newSettings['short-interval-threshold'];
  if (isNaN(cfgShortDuration) || cfgShortDuration < 1) cfgShortDuration = 0;
  logseq.provideStyle(newSettings['no-default-styles'] !== true ? STYLES : '');
  updateHints();
}

function generateIntervals(sec, minSec) {
  minSec = minSec === undefined ? 60 : minSec;
  let result = [];
  for (const [label, interval] of cfgIntervalChoices) {
    if (sec < minSec) break;
    if (sec < interval) continue;
    const count = Math.trunc(sec / interval);
    sec -= interval * count;
    result.push([count, label]);
  }
  return result;
}

function updateHint(el, now) {
  if (!now) now = msToSecs(new Date());
  const then = parseInt(el.getAttribute(TIMESTAMP_ATTRIBUTE));
  const diff = Math.abs(then - now);
  const isFuture = then >= now;
  const alwaysShown =
    cfgAlwaysShowRenderer && el.classList.contains(RENDERER_CLASS);
  const isHidden =
    !alwaysShown &&
    ((isFuture && !cfgShowFuture) || (!isFuture && !cfgShowPast));
  const isShort = cfgShortDuration > 0 && diff <= cfgShortDuration;

  clearChildren(el);
  el.classList.remove(isFuture ? PAST_CLASS : FUTURE_CLASS);
  el.classList.add(isFuture ? FUTURE_CLASS : PAST_CLASS);
  isHidden ? el.classList.add(HIDDEN_CLASS) : el.classList.remove(HIDDEN_CLASS);
  isShort ? el.classList.add(SHORT_CLASS) : el.classList.remove(SHORT_CLASS);

  if (isHidden) return;

  const minInterval =
    alwaysShown && diff < cfgMinInterval ? diff : cfgMinInterval;
  const intervals = generateIntervals(diff, minInterval);
  if (intervals.length == 0) {
    el.classList.add(HIDDEN_CLASS);
    return;
  }
  const labelEl = newEl(LABEL_ELEMENT);
  labelEl.classList.add(LABEL_CLASS);
  el.appendChild(labelEl);
  intervals.forEach(([count, label]) => {
    const countNode = newEl(ITEM_ELEMENT);
    countNode.classList.add(INTERVALPFX_CLASS + label);
    countNode.appendChild(newText(count));
    el.appendChild(countNode);
  });
}

function updateHints() {
  const now = msToSecs(new Date());
  appContainerEl
    .querySelectorAll('.' + MAIN_CLASS)
    .forEach((hint) => updateHint(hint, now));
}

function addHint(timeEl) {
  if (!timeEl) return;
  const timeText = timeEl.textContent;
  const timeTextParts = timeText.split(' ');
  const timePart =
    timeTextParts[2] && !isNaN(timeTextParts[2][0]) ? timeTextParts[2] : '';
  const then = new Date(timeTextParts[0].concat(' ', timePart));
  if (isNaN(then)) return;

  let el = timeEl.parentElement.querySelector(HINT_SELECTOR);
  if (!el) {
    el = newEl(CONTAINER_ELEMENT);
    el.classList.add(MAIN_CLASS);
    timeEl.insertAdjacentElement('afterend', el);
    if (cfgUpdateOnEdit) {
      const observer = new MutationObserver((mutationList) =>
        mutationList.forEach((mutation) =>
          mutation.type === 'characterData'
            ? addHint(mutation.target.parentElement)
            : undefined
        )
      );
      // Note: Disconnect shouldn't be necessary here as the observer will be GCed when the element is deleted.
      observer.observe(timeEl, { characterData: true, subtree: true });
    }
  }
  el.setAttribute(TIMESTAMP_ATTRIBUTE, msToSecs(then));
  el.setAttribute('title', then.toLocaleString());
  updateHint(el);
}

function hintTimer() {
  updateHints();
  updateTimer = cfgUpdateInterval
    ? setTimeout(hintTimer, cfgUpdateInterval * 1000)
    : null;
}

const DATE_RE = /^2\d{3}\W\d{2}\W\d{2}$/;

function handleRenderer({ slot, payload: { arguments: rargs } }) {
  let [type, datetime] = rargs;
  if (type !== ':interval-hint') return;
  datetime = datetime?.trim?.();
  if (datetime && DATE_RE.test(datetime)) datetime = datetime + 'T00:00';
  let template,
    stamp = new Date(datetime);
  if (isNaN(stamp)) {
    template = `(interval-hint: Invalid datetime)`;
  } else {
    let el = newEl(CONTAINER_ELEMENT);
    el.classList.add(MAIN_CLASS, RENDERER_CLASS);
    el.setAttribute(TIMESTAMP_ATTRIBUTE, msToSecs(stamp));
    el.setAttribute('title', stamp.toLocaleString());
    updateHint(el);
    template = el.outerHTML;
  }
  logseq.provideUI({
    key: 'lsp-interval-hints-' + slot,
    slot,
    template,
    reset: true,
  });
}

function handleMutations(mutations) {
  if (!(cfgShowFuture || cfgShowPast)) return;
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes)
      (node.querySelectorAll?.(TIME_SELECTOR) || []).forEach(addHint);
  }
}

function main() {
  newEl = parent.document.createElement.bind(parent.document);
  newText = parent.document.createTextNode.bind(parent.document);
  if (!newEl || !newText) {
    console.log(
      '**** logseq-interval-hints: Could not get element/text constructor! Bailing out.'
    );
    return;
  }

  logseq.onSettingsChanged(settingsHandler);
  logseq.useSettingsSchema(SETTINGS_SCHEMA);

  appContainerEl = parent.document.querySelector(APP_SELECTOR);
  if (!appContainerEl) {
    console.log(
      '**** logseq-interval-hints: Could not get application element! Bailing out.'
    );
    return;
  }
  logseq.App.onMacroRendererSlotted(handleRenderer);

  const observer = new MutationObserver(handleMutations);
  observer.observe(appContainerEl, { subtree: true, childList: true });
  logseq.beforeunload(async () => {
    observer.disconnect();
    if (updateTimer) {
      clearTimeout(updateTimer);
      updateTimer = null;
    }
    appContainerEl.querySelectorAll('.' + MAIN_CLASS).forEach((node) => {
      try {
        node?.remove?.();
      } catch (_err) {
        /* pass */
      }
    });
  });
}

logseq.ready(main).catch(console.error);
