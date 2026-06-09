import {
  buttonHtml,
  chipNode,
  clearNode,
  combobox,
  el,
  fieldRowHtml,
  floatingMenu,
  renderStatusState,
  statusStateHtml,
  toast,
} from '../index.js';

const mount = document.getElementById('designSystemMount');

const PLAYGROUND_KEY = 'vellum_ds_token_overrides_v1';
const THEME_KEY = 'vellum_ds_theme_v1';

const PLAYGROUND_GROUPS = [
  {
    label: 'surfaces',
    tokens: [
      '--vui-color-bg',
      '--vui-color-surface',
      '--vui-color-surface-sunken',
      '--vui-color-surface-raised',
      '--vui-color-surface-hover',
    ],
  },
  {
    label: 'ink & lines',
    tokens: [
      '--vui-color-text',
      '--vui-color-text-muted',
      '--vui-color-text-strong',
      '--vui-color-text-inverse',
      '--vui-color-line',
      '--vui-color-line-strong',
    ],
  },
  {
    label: 'accents & status',
    tokens: [
      '--vui-color-accent',
      '--vui-color-accent-soft',
      '--vui-color-accent-strong',
      '--vui-color-success',
      '--vui-color-warn',
      '--vui-color-danger',
      '--vui-color-info',
    ],
  },
  {
    label: 'shape & shadow',
    tokens: [
      '--vui-border-width',
      '--vui-radius-sharp',
      '--vui-radius-soft',
      '--vui-radius-round',
      '--vui-color-shadow',
      '--vui-shadow-soft',
      '--vui-shadow-firm',
      '--vui-shadow-hard',
      '--vui-shadow-overlay',
    ],
  },
  {
    label: 'type',
    tokens: [
      '--vui-font-body',
      '--vui-font-heading',
      '--vui-font-mono',
      '--vui-font-size-sm',
      '--vui-font-size-base',
      '--vui-font-size-heading',
      '--vui-font-weight-body',
    ],
  },
  {
    label: 'space & motion',
    tokens: [
      '--vui-space-2',
      '--vui-space-3',
      '--vui-space-4',
      '--vui-control-height',
      '--vui-motion-base',
    ],
  },
];

const PLAYGROUND_TOKENS = PLAYGROUND_GROUPS.flatMap((groupDef) => groupDef.tokens);

// Theme first, then defaults, then stored overrides — defaults must reflect
// the active theme but not the overrides.
applyTheme(readTheme());
const tokenDefaults = readTokenDefaults();
applyOverrides(readOverrides());

renderDesignSystem(mount);

function readTokenDefaults() {
  const computed = getComputedStyle(document.documentElement);
  const defaults = {};
  for (const token of PLAYGROUND_TOKENS) defaults[token] = computed.getPropertyValue(token).trim();
  return defaults;
}

function overrideStyleEl() {
  let styleEl = document.getElementById('ds-token-overrides');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'ds-token-overrides';
    document.head.append(styleEl);
  }
  return styleEl;
}

function readOverrides() {
  try {
    return JSON.parse(localStorage.getItem(PLAYGROUND_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function writeOverrides(overrides) {
  try {
    localStorage.setItem(PLAYGROUND_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore */
  }
}

function overridesToCss(overrides) {
  const entries = Object.entries(overrides);
  if (!entries.length) return '';
  return `:root {\n${entries.map(([token, value]) => `  ${token}: ${value};`).join('\n')}\n}`;
}

function applyOverrides(overrides) {
  overrideStyleEl().textContent = overridesToCss(overrides);
}

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
}

function setTheme(theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  // Re-read defaults under the new theme with overrides lifted, so the
  // playground diffs against the theme the user is actually looking at.
  const styleEl = overrideStyleEl();
  const overrideCss = styleEl.textContent;
  styleEl.textContent = '';
  Object.assign(tokenDefaults, readTokenDefaults());
  styleEl.textContent = overrideCss;
}

export function renderDesignSystem(target) {
  if (!target) return;
  clearNode(target);
  const content = el('div', { className: 'ds-page-body' });
  const groups = [
    tokensGroup(),
    buttonsGroup(),
    formsGroup(),
    statusGroup(),
    dataGroup(),
    overlaysGroup(),
  ];
  for (const groupNode of groups) content.append(groupNode);
  target.append(
    pageHeader(),
    el(
      'div',
      { className: 'ds-page-layout' },
      toc(groups.map((groupNode) => ({ id: groupNode.id, title: groupNode.dataset.title }))),
      content,
    ),
  );
  wireToc(target);
}

function pageHeader() {
  return el(
    'header',
    { className: 'ds-page-head' },
    el('h1', { className: 'ds-page-title', text: 'Vellum UI' }),
    el('p', {
      className: 'ds-page-sub',
      text:
        'Shared tokens, hard-shadow primitives, and small browser-native helpers for Biblioplex, PoolBuilder, and future apps.',
    }),
    el(
      'nav',
      { className: 'ds-page-actions', ariaLabel: 'Vellum UI pages' },
      el('a', { className: 'ds-page-back', href: '/vellum-ui/design-system/', text: 'home' }),
      el('a', { className: 'ds-page-back', href: '/vellum-ui/labs/modal/', text: 'modal lab' }),
    ),
  );
}

function toc(groups) {
  const wrap = el('aside', { className: 'ds-toc' });
  wrap.append(
    el('div', { className: 'ds-toc-title', text: 'states' }),
    el(
      'div',
      { className: 'ds-toc-states' },
      el(
        'div',
        { className: 'ds-toc-state-row' },
        stateButton('rest', () => setDemoState('rest')),
        stateButton('hover', () => setDemoState('hover')),
        stateButton('active', () => setDemoState('active')),
        stateButton('focus', () => setDemoState('focus')),
      ),
    ),
    el('div', { className: 'ds-toc-title', text: 'theme' }),
    themeToggle(),
    el('div', { className: 'ds-toc-title', text: 'catalog' }),
  );
  for (const group of groups) wrap.append(el('a', { className: 'ds-toc-link', href: `#${group.id}`, text: group.title }));
  return wrap;
}

function themeToggle() {
  const input = el('input', {
    className: 'switch-input',
    type: 'checkbox',
    dataset: { dsThemeToggle: '' },
  });
  input.checked = readTheme() === 'dark';
  input.addEventListener('change', () => setTheme(input.checked ? 'dark' : 'light'));
  return el(
    'label',
    { className: 'switch ds-theme-toggle' },
    input,
    el('span', { className: 'switch-track' }),
    'dark mode',
  );
}

function stateButton(label, onClick) {
  return el('button', { className: label === 'rest' ? 'ds-toc-state-btn active' : 'ds-toc-state-btn', type: 'button', text: label, onClick });
}

function setDemoState(state) {
  document.querySelectorAll('.ds-toc-state-btn').forEach((btn) => btn.classList.toggle('active', btn.textContent === state));
  document.body.classList.toggle('ds-force-hover', state === 'hover');
  document.body.classList.toggle('ds-force-active', state === 'active');
  document.body.classList.toggle('ds-force-focus', state === 'focus');
}

function wireToc(target) {
  const links = [...target.querySelectorAll('.ds-toc-link')];
  const groups = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  const setActive = () => {
    const current = groups.findLast((group) => group.getBoundingClientRect().top <= 96) || groups[0];
    links.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${current?.id}`));
  };
  document.addEventListener('scroll', setActive, { passive: true });
  setActive();
}

function group(id, title, ...entries) {
  const wrap = el('section', { id, className: 'ds-group', dataset: { title } });
  wrap.append(el('h2', { className: 'ds-group-title', text: title }), ...entries);
  return wrap;
}

function entry(name, selectors, description, demoFactory) {
  const demo = el('div', { className: 'ds-entry-demo' });
  const stage = el('div', { className: 'ds-zoom-stage' });
  const built = demoFactory();
  if (built) stage.append(built);
  demo.append(zoomBar(stage), stage);
  return el(
    'section',
    { className: 'ds-entry' },
    el(
      'header',
      { className: 'ds-entry-head' },
      el('h3', { className: 'ds-entry-name', text: name }),
      el('div', { className: 'ds-entry-selectors' }, selectors.map((selector) => el('code', { text: selector }))),
    ),
    el('p', { className: 'ds-entry-desc', text: description }),
    demo,
  );
}

function zoomBar(stage) {
  const bar = el('div', { className: 'ds-zoom-bar' });
  for (const zoom of [1, 2, 3]) {
    const btn = el('button', {
      className: zoom === 1 ? 'ds-zoom-btn active' : 'ds-zoom-btn',
      type: 'button',
      text: `${zoom}x`,
      onClick: () => {
        stage.style.zoom = zoom === 1 ? '' : String(zoom);
        bar.querySelectorAll('.ds-zoom-btn').forEach((other) => other.classList.toggle('active', other === btn));
      },
    });
    bar.append(btn);
  }
  return bar;
}

function tokensGroup() {
  return group(
    'tokens',
    'Tokens',
    entry(
      'Token playground',
      [':root', '--vui-color-*', '--vui-radius-*', '--vui-shadow-*'],
      'Tune core CSS variables live — the whole catalog re-tints instantly. The override panel shows only what changed; copy it straight into src/css/tokens.css. Saved to this browser until reset.',
      tokenPlayground,
    ),
  );
}

function tokenPlayground() {
  const output = el('pre', { className: 'ds-token-output' });
  const playground = el('div', { className: 'ds-playground' });

  const updateOutput = () => {
    const css = overridesToCss(readOverrides());
    output.textContent = css || '/* no token changes */';
  };

  const setToken = (token, value) => {
    const overrides = readOverrides();
    if (value.trim() === tokenDefaults[token]) delete overrides[token];
    else overrides[token] = value;
    writeOverrides(overrides);
    applyOverrides(overrides);
    updateOutput();
  };

  const storedOverrides = readOverrides();
  for (const groupDef of PLAYGROUND_GROUPS) {
    const col = el('div', { className: 'ds-playground-col' }, el('div', { className: 'ds-playground-col-label', text: groupDef.label }));
    for (const token of groupDef.tokens) {
      const value = storedOverrides[token] ?? tokenDefaults[token];
      const useColor = token.includes('-color-') && !value.includes('(') && !value.includes(',');
      const input = el('input', {
        className: useColor ? '' : 'ds-playground-text',
        type: useColor ? 'color' : 'text',
        value: useColor ? normalizeColor(value) : value,
        dataset: { token },
      });
      input.addEventListener('input', () => setToken(token, input.value));
      col.append(el('label', { className: 'ds-playground-row' }, el('span', { className: 'ds-playground-token', text: token.replace('--vui-', '') }), input));
    }
    playground.append(col);
  }

  const copyBtn = el('button', { className: 'btn', type: 'button', text: 'copy css' });
  copyBtn.addEventListener('click', async () => {
    const css = overridesToCss(readOverrides()) || '/* no token changes */';
    try {
      await navigator.clipboard.writeText(css);
      copyBtn.textContent = 'copied!';
    } catch {
      copyBtn.textContent = 'copy failed';
    }
    setTimeout(() => {
      copyBtn.textContent = 'copy css';
    }, 1200);
  });
  const resetBtn = el('button', { className: 'btn btn-secondary', type: 'button', text: 'reset' });
  resetBtn.addEventListener('click', () => {
    writeOverrides({});
    applyOverrides({});
    location.reload();
  });

  playground.append(
    el(
      'div',
      { className: 'ds-playground-col' },
      el('div', { className: 'ds-playground-col-label', text: 'override' }),
      output,
      el('div', { className: 'ds-row' }, copyBtn, resetBtn),
    ),
  );
  updateOutput();
  return playground;
}

function normalizeColor(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.append(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
  probe.remove();
  return '#' + rgb.map((part) => part.toString(16).padStart(2, '0')).join('');
}

function buttonsGroup() {
  return group(
    'buttons',
    'Buttons',
    entry('Buttons', ['.btn', '.btn-secondary', '.btn-danger', '.btn-ink', '.btn-link'], 'Primary gold, secondary blue, danger red, ink, disabled, and bare text actions.', () =>
      demoHtml(
        buttonHtml({ label: 'reload' }) +
          buttonHtml({ label: 'save' }) +
          buttonHtml({ label: 'cancel', variant: 'secondary' }) +
          buttonHtml({ label: 'delete', variant: 'danger' }) +
          buttonHtml({ label: 'generate', variant: 'ink' }) +
          buttonHtml({ label: 'disabled', attrs: { disabled: true } }) +
          '<button class="btn-link" type="button">inline action</button>',
      ),
    ),
    entry('Segmented control', ['.segmented', '.segment-btn'], 'Hard-shadow abutting segments. Active segments press into the canvas.', segmentedDemo),
    entry('Icon buttons', ['.icon-btn'], 'Bare glyph buttons for compact table/card actions.', () =>
      demoHtml(
        '<button class="icon-btn" type="button" aria-label="close">x</button>' +
          '<button class="icon-btn" type="button" aria-label="more">...</button>' +
          '<button class="icon-btn" type="button" aria-label="refresh">r</button>',
      ),
    ),
  );
}

function segmentedDemo() {
  const wrap = el('div', { className: 'segmented', role: 'group' });
  for (const [i, label] of ['daily', 'sealed', 'archive'].entries()) {
    wrap.append(
      el('button', {
        className: i === 0 ? 'segment-btn active' : 'segment-btn',
        type: 'button',
        text: label,
        ariaPressed: i === 0 ? 'true' : 'false',
        onClick: () => {
          wrap.querySelectorAll('.segment-btn').forEach((btn) => {
            const active = btn.textContent === label;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
          });
        },
      }),
    );
  }
  return wrap;
}

function formsGroup() {
  return group(
    'forms',
    'Forms',
    entry('Fields', ['input', 'select', 'textarea', '.field-row'], 'Carved vellum fields with mono type and inset shadow.', () =>
      demoHtml(
        fieldRowHtml({
          label: 'card name',
          controlHtml: '<input type="text" value="Lightning Bolt" />',
        }) +
          fieldRowHtml({
            label: 'format',
            controlHtml: '<select><option>sealed</option><option>draft</option></select>',
          }) +
          fieldRowHtml({
            label: 'notes',
            controlHtml: '<textarea rows="3" placeholder="notes"></textarea>',
          }),
      ),
    ),
    entry('Selection controls', ['input[type=checkbox]', 'input[type=radio]', '.switch', 'input[type=range]'], 'Checkbox, radio, switch, and range share the accent-fill checked treatment.', () =>
      demoHtml(
        '<label class="ds-inline-label"><input type="checkbox" checked /> foils only</label>' +
          '<label class="ds-inline-label"><input type="checkbox" /> include lands</label>' +
          '<label class="ds-inline-label"><input type="radio" name="ds-radio" checked /> sealed</label>' +
          '<label class="ds-inline-label"><input type="radio" name="ds-radio" /> draft</label>' +
          '<label class="switch"><input type="checkbox" class="switch-input" checked /><span class="switch-track"></span>dark mode</label>' +
          '<input type="range" min="0" max="100" value="60" aria-label="sample range" />',
      ),
    ),
    entry('Combobox', ['.combobox', '.combobox-list', '.combobox-option'], 'Keyboard-first autocomplete over any async item source. Arrows navigate, enter selects, escape closes.', comboboxDemo),
  );
}

function comboboxDemo() {
  const SETS = [
    { label: 'eternities beckon', hint: 'etb' },
    { label: 'tarkir: dragonstorm', hint: 'tdm' },
    { label: 'final fantasy', hint: 'fin' },
    { label: 'edge of eternities', hint: 'eoe' },
    { label: 'avatar: the last airbender', hint: 'tla' },
    { label: 'lorwyn eclipsed', hint: 'ecl' },
  ];
  const input = el('input', { type: 'text', placeholder: 'search sets…', ariaLabel: 'search sets' });
  const wrap = el('div', { className: 'combobox' }, input);
  combobox(input, {
    getItems: (query) => SETS.filter((set) => set.label.includes(query.toLowerCase()) || set.hint.includes(query.toLowerCase())),
    toHint: (item) => item.hint,
  });
  return wrap;
}

function statusGroup() {
  return group(
    'status',
    'Status',
    entry('Status states', ['.status-state'], 'Compact feedback chips for neutral, success, warning, and danger states.', () => {
      const row = demoHtml(
        statusStateHtml({ label: 'ready', tone: 'success' }) +
          statusStateHtml({ label: 'waiting', tone: 'warn' }) +
          statusStateHtml({ label: 'error', tone: 'danger' }) +
          statusStateHtml({ label: 'idle' }),
      );
      const mount = el('span');
      renderStatusState(mount, { label: 'rendered by JS', tone: 'success' });
      row.append(mount);
      return row;
    }),
    entry('Banner', ['.banner', '.banner-message', '.banner-actions', '.banner-dismiss'], 'Full-width inline banner with a message, CTA, and right-aligned dismiss control.', () => {
      const banner = el('div', { className: 'banner', role: 'status' });
      banner.append(
        el('span', { className: 'banner-message', text: 'site updated \u00b7 reload to see the latest' }),
        el('div', { className: 'banner-actions' }, el('button', { className: 'btn', type: 'button', text: 'reload' })),
        el('button', { className: 'icon-btn banner-dismiss', type: 'button', ariaLabel: 'dismiss', text: 'x' }),
      );
      return banner;
    }),
    entry('Chips', ['.ui-chip', '.ui-chip-remove', '.ui-chip-emoji'], 'Shared chip primitive for tags, roles, statuses, and filters. Apps layer domain pills on this base.', () => {
      const row = el('div', { className: 'ds-row' });
      const emoji = el('span', { className: 'ui-chip-emoji', text: '✨' });
      row.append(
        chipNode({ text: 'filter', variant: 'filter' }),
        chipNode({ text: 'owner', variant: 'role' }),
        chipNode({ text: 'synced', variant: 'status' }),
        chipNode({ text: 'sparkles', variant: 'filter', prefixNode: emoji }),
        chipNode({ text: 'splash', variant: 'filter', remove: { enabled: true, label: 'remove splash' } }),
      );
      return row;
    }),
    entry('Toast', ['.toast-stack', '.toast', '.toast-success', '.toast-danger'], 'Bottom-center transient notices. Static frames below; fire a live one to see enter/auto-dismiss.', () => {
      const row = demoHtml(
        '<div class="toast"><span class="toast-message">deck saved</span></div>' +
          '<div class="toast toast-success"><span class="toast-message">synced 312 cards</span></div>' +
          '<div class="toast toast-warn"><span class="toast-message">2 cards unmatched</span></div>' +
          '<div class="toast toast-danger"><span class="toast-message">save failed</span></div>',
      );
      const fire = el('button', { className: 'btn', type: 'button', text: 'fire toast', dataset: { dsFireToast: '' } });
      fire.addEventListener('click', () => toast('toast fired from the catalog', { tone: 'success' }));
      row.append(fire);
      return row;
    }),
    entry('Tooltip', ['.tooltip-host', '[data-tooltip]', '.tooltip-term'], 'CSS-only tooltip on hover/focus. .tooltip-term adds the dotted-underline glossary treatment.', () =>
      demoHtml(
        '<button class="btn tooltip-host" type="button" data-tooltip="rebuilds the daily pool">regenerate</button>' +
          '<span class="tooltip-host tooltip-term" tabindex="0" data-tooltip="wins under usual tournament structure">wubrg</span>',
      ),
    ),
  );
}

function dataGroup() {
  return group(
    'data',
    'Data',
    entry('Table', ['.vui-table', '.vui-table-compact'], 'Mono lowercase headers over a strong rule; rows divide with hairlines and highlight on hover.', () =>
      demoHtml(
        '<table class="vui-table"><thead><tr><th>card</th><th>set</th><th>qty</th></tr></thead><tbody>' +
          '<tr><td>lightning bolt</td><td>2x2</td><td>4</td></tr>' +
          '<tr><td>counterspell</td><td>cmm</td><td>2</td></tr>' +
          '<tr><td>llanowar elves</td><td>dom</td><td>3</td></tr>' +
          '</tbody></table>',
      ),
    ),
    entry('Skeleton', ['.skeleton', '.skeleton-line'], 'Pulsing placeholders while content loads. Honors prefers-reduced-motion.', () =>
      demoHtml(
        '<div style="width: 240px;">' +
          '<div class="skeleton skeleton-line" style="width: 80%;"></div>' +
          '<div class="skeleton skeleton-line" style="width: 100%;"></div>' +
          '<div class="skeleton skeleton-line" style="width: 60%;"></div>' +
          '</div>',
      ),
    ),
    entry('Empty state', ['.empty-state', '.empty-state-glyph'], 'Dashed-border placeholder for zero-result views.', () =>
      demoHtml(
        '<div class="empty-state" style="width: 280px;"><span class="empty-state-glyph">🃏</span><span>no cards match these filters</span></div>',
      ),
    ),
  );
}

function overlaysGroup() {
  return group(
    'overlays',
    'Overlays',
    entry('Modal frame', ['.ui-modal-card', '.ui-modal-head', '.ui-modal-body', '.rune-close'], 'Canonical modal card with floating rune close button. Use the modal lab to compare new treatments.', () =>
      el(
        'section',
        { className: 'ui-modal-card', style: { width: 'min(520px, 100%)' } },
        el(
          'header',
          { className: 'ui-modal-head' },
          el('h3', { className: 'ui-modal-title', text: 'reference build' }),
          el('button', { className: 'rune-close', type: 'button', ariaLabel: 'close', text: 'x' }),
        ),
        el('div', { className: 'ui-modal-body', text: 'A framed modal body for app-specific content.' }),
        el('footer', { className: 'ui-modal-actions' }, el('button', { className: 'btn', type: 'button', text: 'done' })),
      ),
    ),
    entry(
      'Popover frame',
      ['.ui-popover', '.floating-menu', '.floating-menu-item'],
      'Anchored floating surface and menu item vocabulary. Live: the trigger opens a real floatingMenu() — arrows navigate, enter picks, escape closes.',
      () => {
        const wrap = el('div', { className: 'ds-floating-demo', style: { position: 'relative' } });
        const trigger = el('button', { className: 'btn', type: 'button', text: 'open menu' });
        const menu = el('div', { className: 'ui-popover floating-menu', role: 'menu' });
        menu.hidden = true;
        let controller = null;
        for (const label of ['move to deck', 'compare build', 'remove']) {
          const item = el('button', {
            className: 'floating-menu-item',
            type: 'button',
            text: label,
            role: 'menuitem',
          });
          item.addEventListener('click', () => {
            toast(`picked: ${label}`);
            controller?.close();
          });
          menu.append(item);
        }
        wrap.append(trigger, menu);
        controller = floatingMenu(trigger, menu, { keyboard: true });
        trigger.addEventListener('click', () =>
          controller.isOpen() ? controller.close() : controller.open({ focusFirst: true }),
        );
        return wrap;
      },
    ),
  );
}

function demoHtml(html) {
  const row = el('div', { className: 'ds-row' });
  const template = document.createElement('template');
  template.innerHTML = html;
  row.append(template.content);
  return row;
}
