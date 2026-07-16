import {
  buttonHtml,
  chipNode,
  clearNode,
  combobox,
  drawer,
  edgeResize,
  el,
  fieldRowHtml,
  floatingMenu,
  initTheme as applyStoredTheme,
  modal,
  mountFeedbackCapture,
  paginationRange,
  priceStickerNode,
  renderStatusState,
  statusStateHtml,
  themeToggle as bindThemeToggle,
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
      '--vui-shadow-float',
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
applyStoredTheme({ storageKey: THEME_KEY, fallbackToSystem: false });
const tokenDefaults = readTokenDefaults();
applyOverrides(readOverrides());

renderDesignSystem(mount);

// Owner feedback: file design-system feedback straight to the vellum-ui Linear
// project. Mounts only on machines holding the owner key (adopt it once via
// ?feedback-key=<key>); routed through the biblioplex worker's /feedback.
mountFeedbackCapture({
  requireOwnerKey: true,
  project: 'vellum-ui',
  apiUrl: 'https://biblioplex-api.bensonperry.com',
});

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

// Re-read defaults under the new theme with overrides lifted, so the
// playground diffs against the theme the user is actually looking at.
function refreshTokenDefaults() {
  const styleEl = overrideStyleEl();
  const overrideCss = styleEl.textContent;
  styleEl.textContent = '';
  Object.assign(tokenDefaults, readTokenDefaults());
  styleEl.textContent = overrideCss;
  // BEN-554: swatches must show the theme being looked at; re-seed inputs
  // from the fresh defaults (user overrides stay).
  const overrides = readOverrides();
  document.querySelectorAll('.ds-playground [data-token]').forEach((input) => {
    const token = input.dataset.token;
    if (overrides[token] != null) return;
    const value = tokenDefaults[token];
    if (value == null) return;
    input.value = input.type === 'color' ? normalizeColor(value) : value;
  });
}

export function renderDesignSystem(target) {
  if (!target) return;
  clearNode(target);
  const content = el('div', { className: 'ds-page-body' });
  const groups = [
    tokensGroup(),
    typeGroup(),
    buttonsGroup(),
    motionGroup(),
    formsGroup(),
    statusGroup(),
    dataGroup(),
    overlaysGroup(),
    layoutGroup(),
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
        'Shared tokens, restrained primitives, and small browser-native helpers for Biblioplex, PoolBuilder, and future apps.',
    }),
    el(
      'nav',
      { className: 'ds-page-actions', ariaLabel: 'Vellum UI pages' },
      el('a', { className: 'btn', href: 'https://bensonperry.com/', text: 'home' }),
      el('a', { className: 'btn', href: '../labs/modal/', text: 'modal lab' }),
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
        { className: 'segmented segmented-compact ds-toc-state-row', role: 'group' },
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
  bindThemeToggle(input, { storageKey: THEME_KEY, onChange: refreshTokenDefaults });
  return el(
    'label',
    { className: 'switch ds-theme-toggle' },
    input,
    el('span', { className: 'switch-track' }),
    'dark mode',
  );
}

function stateButton(label, onClick) {
  return el('button', {
    className: label === 'rest' ? 'segment-btn active' : 'segment-btn',
    type: 'button',
    text: label,
    onClick,
  });
}

function setDemoState(state) {
  document
    .querySelectorAll('.ds-toc-state-row .segment-btn')
    .forEach((btn) => btn.classList.toggle('active', btn.textContent === state));
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
  demo.append(zoomBar(stage, demo), stage);
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

function zoomBar(stage, demo) {
  const bar = el('div', { className: 'segmented segmented-compact ds-zoom-bar', role: 'group' });
  for (const zoom of [1, 2, 3]) {
    const btn = el('button', {
      className: zoom === 1 ? 'segment-btn active' : 'segment-btn',
      type: 'button',
      text: `${zoom}x`,
      onClick: () => {
        stage.style.zoom = zoom === 1 ? '' : String(zoom);
        // Zoomed content can outgrow the panel; clip only then so floating
        // demos (combobox, tooltip, menu) stay unclipped at rest (BEN-553).
        demo?.classList.toggle('ds-entry-demo-scroll', zoom > 1);
        bar.querySelectorAll('.segment-btn').forEach((other) => other.classList.toggle('active', other === btn));
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

function typeGroup() {
  const sizes = ['xxxs', 'xxs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', 'heading', 'display', 'jumbo'];
  return group(
    'type',
    'Type',
    entry('Faces', ['--vui-font-display', '--vui-font-heading', '--vui-font-body', '--vui-font-mono'], 'The four voices: a quiet bookish serif carries display and headings; Inter or the system sans does the reading; mono is reserved for data.', () => {
      const col = el('div', { className: 'ds-type-faces' });
      col.append(
        el('div', { className: 'ds-type-face', style: { fontFamily: 'var(--vui-font-display)', fontSize: 'var(--vui-font-size-display)' }, text: 'arcane ledger — display' }),
        el('div', { className: 'ds-type-face', style: { fontFamily: 'var(--vui-font-heading)', fontSize: 'var(--vui-font-size-heading)' }, text: 'collection history — heading' }),
        el('div', { className: 'ds-type-face', style: { fontFamily: 'var(--vui-font-body)', fontSize: 'var(--vui-font-size-base)' }, text: 'body — the quick brown fox jumps over the lazy dog' }),
        el('div', { className: 'ds-type-face', style: { fontFamily: 'var(--vui-font-mono)', fontSize: 'var(--vui-font-size-sm)' }, text: 'mono — darksteel citadel · $4.20 · nm' }),
      );
      return col;
    }),
    entry('Size ramp', ['--vui-font-size-*'], 'All eleven size tokens rendered live. If a step never earns a use, it should die here first (the -plus half-steps already did).', () => {
      const col = el('div', { className: 'ds-type-ramp' });
      for (const size of sizes) {
        col.append(
          el(
            'div',
            { className: 'ds-type-ramp-row' },
            el('code', { className: 'ds-type-ramp-token', text: size }),
            el('span', { className: 'ds-type-ramp-sample', style: { fontSize: `var(--vui-font-size-${size})` }, text: 'sealed pool generator' }),
          ),
        );
      }
      return col;
    }),
    entry('Links', ['.vui-app a:not([class])', '.vui-link'], 'Prose links: strong ink with a quiet underline that warms to accent on hover. Classless anchors get it for free inside a .vui-app; .vui-link opts one in anywhere.', () =>
      demoHtml(
        '<p style="max-width: 420px; margin: 0;">the <a href="#type">collection history</a> tracks every card in and out; see the <span class="vui-link" tabindex="0">pricing notes</span> for how values settle.</p>',
      ),
    ),
  );
}

function buttonsGroup() {
  return group(
    'buttons',
    'Buttons',
    entry('Buttons', ['.btn', '.btn-secondary', '.btn-danger', '.btn-ink', '.btn-link', '.btn-shortcut'], 'Accent primary, quiet secondary, soft danger, ink, disabled, and bare text actions. Ordinary labels stay regular-weight; primary actions carry the stronger voice.', () =>
      demoHtml(
        buttonHtml({ label: 'reload' }) +
          buttonHtml({ label: 'save' }) +
          buttonHtml({ label: 'cancel', variant: 'secondary' }) +
          buttonHtml({ label: 'delete', variant: 'danger' }) +
          buttonHtml({ label: 'generate', variant: 'ink' }) +
          buttonHtml({ label: 'disabled', attrs: { disabled: true } }) +
          '<button class="btn" type="button">save<span class="btn-shortcut" aria-hidden="true">s</span></button>' +
          '<button class="btn-link" type="button">inline action</button>' +
          '<button class="btn-link btn-link-danger" type="button">destructive inline</button>',
      ),
    ),
    entry(
      'Tabs',
      ['.tab-row', '.tab-btn'],
      'Underline-active row for switching panes within a surface — segmented picks options, tabs pick views. Wire aria-selected in the app.',
      () => tabsDemo(),
    ),
    entry(
      'Segmented control',
      ['.segmented', '.segment-btn', '.segmented-compact'],
      'Quiet abutting segments: transparent canvas, grey labels, ink-filled active. Add .segmented-compact for dense chrome (toolbars, page furniture).',
      () => el('div', { className: 'ds-stack' }, segmentedDemo(), segmentedDemo({ compact: true })),
    ),
    entry('Icon buttons', ['.icon-btn'], 'Bare glyph buttons for compact table/card actions, shown in row context. Deliberately neutral grey — they read through proximity, not color.', () =>
      demoHtml(
        '<div class="ds-icon-btn-context">' +
          '<span class="ds-icon-btn-context-label">darksteel citadel · foil · $4.20</span>' +
          '<button class="icon-btn" type="button" aria-label="edit">✎</button>' +
          '<button class="icon-btn" type="button" aria-label="more">…</button>' +
          '<button class="icon-btn" type="button" aria-label="remove">✕</button>' +
          '</div>',
      ),
    ),
    entry(
      'Floating actions',
      ['.fab-cluster', '.fab-btn', '.fab-btn-primary', '.fab-glyph', '.fab-shortcut'],
      'Quiet utility actions with an optional accent primary. Apps stack them in a fixed .fab-cluster at the bottom-right; the feedback widget mounts one as its launcher.',
      () =>
        el(
          'div',
          { className: 'ds-row' },
          fabDemo('+', 'add', 'a', true),
          fabDemo('?', 'help', 'h'),
          fabDemo('!', 'feedback', 'f'),
        ),
    ),
  );
}

function fabDemo(glyph, label, shortcut, primary = false) {
  return el(
    'button',
    { className: `fab-btn${primary ? ' fab-btn-primary' : ''}`, type: 'button', ariaLabel: label },
    el('span', { className: 'fab-glyph', text: glyph }),
    el('span', { className: 'fab-label', text: label }),
    el('span', { className: 'fab-shortcut', ariaHidden: 'true', text: shortcut }),
  );
}

function pagerDemo() {
  const state = { page: 7, pageCount: 20 };
  const pager = el('nav', { className: 'pager', ariaLabel: 'pagination' });
  const render = () => {
    clearNode(pager);
    pager.append(
      el('button', {
        className: 'pager-btn',
        type: 'button',
        text: '‹',
        ariaLabel: 'previous page',
        disabled: state.page <= 1,
        onClick: () => { state.page -= 1; render(); },
      }),
    );
    for (const item of paginationRange(state)) {
      if (item === 'gap') {
        pager.append(el('span', { className: 'pager-gap', ariaHidden: 'true', text: '…' }));
        continue;
      }
      const btn = el('button', {
        className: 'pager-btn',
        type: 'button',
        text: String(item),
        onClick: () => { state.page = item; render(); },
      });
      if (item === state.page) btn.setAttribute('aria-current', 'page');
      pager.append(btn);
    }
    pager.append(
      el('button', {
        className: 'pager-btn',
        type: 'button',
        text: '›',
        ariaLabel: 'next page',
        disabled: state.page >= state.pageCount,
        onClick: () => { state.page += 1; render(); },
      }),
    );
  };
  render();
  return pager;
}

function tabsDemo() {
  const row = el('div', { className: 'tab-row', role: 'tablist' });
  for (const [i, label] of ['lookup', 'voice', 'import'].entries()) {
    row.append(
      el('button', {
        className: i === 0 ? 'tab-btn active' : 'tab-btn',
        type: 'button',
        role: 'tab',
        text: label,
        ariaSelected: i === 0 ? 'true' : 'false',
        onClick: () => {
          row.querySelectorAll('.tab-btn').forEach((btn) => {
            const active = btn.textContent === label;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', String(active));
          });
        },
      }),
    );
  }
  return row;
}

function segmentedDemo({ compact = false } = {}) {
  const wrap = el('div', {
    className: compact ? 'segmented segmented-compact' : 'segmented',
    role: 'group',
  });
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
    entry('Fields', ['input', 'select', 'textarea', '.field-row'], 'Quiet raised fields with body type, a hairline border, subtle depth, and one accent focus ring.', () =>
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
    entry(
      'Field validation',
      ['[aria-invalid]', '.field-invalid', '.field-error'],
      'Mark the control aria-invalid="true" and follow it with a .field-error line — danger border plus a quiet mono error message.',
      () =>
        demoHtml(
          fieldRowHtml({
            label: 'deck name',
            controlHtml:
              '<input type="text" value="9 swamps" aria-invalid="true" aria-describedby="ds-field-error" />' +
              '<span class="field-error" id="ds-field-error">a deck needs at least one nonland card</span>',
          }),
        ),
    ),
    entry(
      'Field triggers',
      ['.field-chrome', '.field-disclosure'],
      'Give non-fields the shared input frame. Add .field-disclosure to popover and multiselect triggers for a visible chevron that follows aria-expanded.',
      () =>
        demoHtml(
          '<button type="button" class="field-chrome field-disclosure" aria-expanded="false" style="text-align: left; min-width: 220px;">any color identity</button>',
        ),
    ),
    entry(
      'Field groups',
      ['.field-group', '.field-group-addon', '.field-group-control'],
      'Attach an icon, emoji picker, or unit to a control while keeping one frame and one focus ring.',
      () =>
        demoHtml(
          '<span class="field-group" style="width: 280px;">' +
            '<button type="button" class="field-group-addon" aria-label="choose emoji">📦</button>' +
            '<input class="field-group-control" type="text" value="trade binder" aria-label="container name" />' +
            '</span>',
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
    entry('Status matrix', ['.status-state-loading', '.status-state-retryable-error', '.status-state-blocking-error', '.status-state-detail', '.status-state-retry'], 'The full loading/error vocabulary apps lean on: loading with spinner, retryable error with action, blocking error with detail.', () =>
      demoHtml(
        '<span class="status-state status-state-loading"><span class="loading-spinner" aria-hidden="true"></span><span class="status-state-message">syncing collection…</span></span>' +
          '<span class="status-state status-state-retryable-error"><span class="status-state-message">sync failed</span><button class="btn-link status-state-retry" type="button">retry</button></span>' +
          '<span class="status-state status-state-blocking-error"><span class="status-state-message">backup unavailable</span><span class="status-state-detail">worker unreachable</span></span>',
      ),
    ),
    entry('Loading spinner', ['.loading-spinner'], 'Inline spinner sized to the surrounding text; inherits currentColor.', () =>
      demoHtml(
        '<span class="loading-spinner" aria-hidden="true"></span> <span class="loading-spinner" style="font-size: 1.5em;" aria-hidden="true"></span> <span class="loading-spinner" style="font-size: 2.2em;" aria-hidden="true"></span>',
      ),
    ),
    entry('Banner', ['.banner', '.banner-message', '.banner-actions', '.banner-dismiss'], 'Full-width inline banner with a message, CTA, and right-aligned dismiss control.', () => {
      const banner = el('div', { className: 'banner', role: 'status' });
      banner.append(
        el('span', { className: 'banner-message', text: 'site updated \u00b7 reload to see the latest' }),
        el('div', { className: 'banner-actions' }, el('button', { className: 'btn', type: 'button', text: 'reload' })),
        el('button', { className: 'icon-btn banner-dismiss', type: 'button', ariaLabel: 'dismiss', text: 'x' }),
      );
      return banner;
    }),
    entry('Chips', ['.ui-chip', '.ui-chip-remove', '.ui-chip-emoji'], 'One quiet metadata family for tags, statuses, filters, and locations. Apps tint it per domain through the --ui-chip-bg/--ui-chip-border/--ui-chip-ink hooks.', () => {
      const row = el('div', { className: 'ds-row' });
      const emoji = el('span', { className: 'ui-chip-emoji', text: '✨' });
      const colored = chipNode({ text: 'tinted' });
      colored.style.setProperty('--ui-chip-bg', '#2a7f6222');
      colored.style.setProperty('--ui-chip-border', '#2a7f6299');
      row.append(
        chipNode({ text: 'aggro' }),
        chipNode({ text: 'sparkles', prefixNode: emoji }),
        colored,
        chipNode({ text: 'splash', remove: { enabled: true, label: 'remove splash' } }),
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
      fire.addEventListener('click', (event) =>
        toast('toast fired from the catalog', { tone: 'success', reason: 'trigger', event }),
      );
      row.append(fire);
      return row;
    }),
    entry('Badge', ['.badge', '.badge-quiet', '.badge-accent'], 'Tiny counters for tabs, buttons, and nav items — a chip names a thing, a badge counts things. Ink by default, quiet for resting counts, accent when the number is the point.', () =>
      demoHtml(
        '<span class="badge">3</span>' +
          '<span class="badge badge-quiet">12</span>' +
          '<span class="badge badge-accent">99+</span>' +
          '<div class="tab-row" style="display: inline-flex;"><button class="tab-btn active" type="button">decks <span class="badge badge-quiet">4</span></button><button class="tab-btn" type="button">trades <span class="badge">2</span></button></div>',
      ),
    ),
    entry('Tooltip', ['.tooltip-host', '[data-tooltip]', '.tooltip-term'], 'CSS-only tooltip on hover/focus — night-blue bubble with hard shadow. Hosts are unlabeled icon buttons and inline glossary terms (.tooltip-term, dotted underline); labeled buttons explain themselves and carry a .btn-shortcut chip for hints instead (BEN-636).', () =>
      demoHtml(
        '<button class="icon-btn tooltip-host" type="button" aria-label="edit" data-tooltip="edit this entry">✎</button>' +
          '<span class="tooltip-host tooltip-term" tabindex="0" data-tooltip="wins under usual tournament structure">wubrg</span>',
      ),
    ),
  );
}

function dataGroup() {
  return group(
    'data',
    'Data',
    entry('Table', ['.vui-table', '.vui-table-compact'], 'Quiet body-type headers on a subtle surface; rows divide with hairlines and highlight on hover.', () =>
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
    entry('Pagination', ['.pager', '.pager-btn', '.pager-gap', 'paginationRange()'], 'Quiet page stepper in the segmented voice — ink-filled current page, gap markers from paginationRange().', () => pagerDemo()),
    entry('Card sleeve', ['.card-sleeve', '.card-sleeve-slot', '.card-sleeve-price', '.card-sleeve-tilt', 'priceStickerNode()'], 'Card in a plastic sleeve: toploader shell ring, tape across the opening, optional price-gun sticker. Build the sticker with priceStickerNode({ amount, jitter }) — seed the jitter per card so a binder of them looks hand-applied, not rubber-stamped. Add .card-sleeve-tilt for the picked-up empty-state look. Size with --card-sleeve-width.', () =>
      el(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '22px', padding: '12px 8px' } },
        el(
          'div',
          { className: 'ds-row', style: { gap: '24px' } },
          el('div', { className: 'card-sleeve' }, el('div', { className: 'card-sleeve-slot', text: 'empty slot' })),
          el(
            'div',
            { className: 'card-sleeve' },
            el('div', { className: 'card-sleeve-slot', text: 'for trade' }),
            priceStickerNode({ amount: 4.2, jitter: 'demo-trade' }),
          ),
          el(
            'div',
            { className: 'card-sleeve card-sleeve-tilt', style: { '--card-sleeve-width': '88px' } },
            el('div', { className: 'card-sleeve-slot', text: '+' }),
            priceStickerNode({ amount: 0.25, jitter: 'demo-plus' }),
          ),
        ),
        // 3x3 binder — same $1.00, seeded jitter, so each sits a touch differently
        el(
          'div',
          { style: { display: 'grid', gridTemplateColumns: 'repeat(3, 84px)', gap: '12px' } },
          ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((seed) =>
            el(
              'div',
              { className: 'card-sleeve', style: { '--card-sleeve-width': '84px' } },
              el('div', { className: 'card-sleeve-slot', text: '' }),
              priceStickerNode({ amount: 1.0, jitter: `binder-${seed}` }),
            ),
          ),
        ),
      ),
    ),
    entry('Empty state', ['.empty-state', '.empty-state-glyph'], 'Dashed-border placeholder for zero-result views.', () =>
      demoHtml(
        '<div class="empty-state" style="width: 280px;"><span class="empty-state-glyph">🃏</span><span>no cards match these filters</span></div>',
      ),
    ),
    entry('Progress', ['.progress', '.progress-fill', '--progress'], 'A thin inked bar with a hatched fill — set completion, pack openings, sync runs. Drive it with the --progress custom property; wire role="progressbar" in the app.', () =>
      demoHtml(
        '<div style="display: flex; flex-direction: column; gap: 10px; width: 260px;">' +
          '<div class="progress" role="progressbar" aria-valuenow="62" aria-valuemin="0" aria-valuemax="100" style="--progress: 62%"><span class="progress-fill"></span></div>' +
          '<div class="progress" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="--progress: 100%"><span class="progress-fill"></span></div>' +
          '<div class="progress" role="progressbar" aria-valuenow="8" aria-valuemin="0" aria-valuemax="100" style="--progress: 8%"><span class="progress-fill"></span></div>' +
          '</div>',
      ),
    ),
  );
}

function motionGroup() {
  return group(
    'motion',
    'Motion',
    entry(
      'Motion workbench',
      ['--vui-motion-enter', '--vui-motion-exit', '--vui-ease-out', '[data-vui-motion]'],
      'A shared motion contract: controls snap, transient surfaces arrive quickly and leave faster, and overlays preserve spatial context. Pointer actions animate; keyboard dismissal is immediate; reduced-motion keeps a quiet fade.',
      () => {
        const lab = el('div', { className: 'ds-motion-lab', dataset: { dsMotionLab: '' } });
        const speed = el('div', { className: 'segmented segmented-compact', role: 'group', ariaLabel: 'motion playback speed' });
        for (const [label, scale] of [['1x', '1'], ['3x', '3'], ['instant', '0']]) {
          const button = el('button', {
            className: label === '1x' ? 'segment-btn active' : 'segment-btn',
            type: 'button',
            text: label,
            dataset: { dsMotionSpeed: scale },
          });
          button.addEventListener('click', () => {
            document.documentElement.style.setProperty('--vui-motion-scale', scale);
            speed.querySelectorAll('.segment-btn').forEach((item) => item.classList.toggle('active', item === button));
          });
          speed.append(button);
        }

        const tiers = el('div', { className: 'ds-motion-tiers' });
        for (const [name, token, note] of [
          ['snap', '70ms', 'press and direct feedback'],
          ['transient', '180ms in / 120ms out', 'menus, popovers, toasts'],
          ['overlay', '180ms', 'modal context change'],
        ]) {
          tiers.append(
            el(
              'div',
              { className: 'ds-motion-tier' },
              el('strong', { text: name }),
              el('code', { text: token }),
              el('span', { text: note }),
            ),
          );
        }

        const actions = el('div', { className: 'ds-motion-actions' });
        const menuWrap = el('div', { className: 'ds-motion-menu-wrap' });
        const menuTrigger = el('button', { className: 'btn', type: 'button', text: 'replay popover', dataset: { dsMotionPopover: '' } });
        const menu = el('div', { className: 'ui-popover floating-menu', role: 'menu', hidden: true });
        for (const label of ['open book', 'add note', 'share shelf']) {
          menu.append(el('button', { className: 'floating-menu-item', type: 'button', role: 'menuitem', text: label }));
        }
        const menuApi = floatingMenu(menuTrigger, menu, { keyboard: true });
        menuTrigger.addEventListener('click', (clickEvent) => {
          if (menuApi.isOpen()) menuApi.close({ reason: 'trigger', event: clickEvent });
          else menuApi.open({ reason: 'trigger', event: clickEvent });
        });
        menuWrap.append(menuTrigger, menu);

        const modalEl = el(
          'div',
          { className: 'ui-modal', hidden: true, ariaHidden: 'true' },
          el(
            'section',
            { className: 'ui-modal-card ds-motion-modal' },
            el('header', { className: 'ui-modal-head' }, el('h3', { className: 'ui-modal-title', text: 'motion, with restraint' })),
            el('div', { className: 'ui-modal-body', text: 'A short centered settle preserves context without making the dialog perform.' }),
            el('footer', { className: 'ui-modal-actions' }, el('button', { className: 'btn', type: 'button', text: 'close', dataset: { modalClose: '' } })),
          ),
        );
        const modalApi = modal(modalEl, { interactive: false });
        const modalTrigger = el('button', { className: 'btn', type: 'button', text: 'replay modal', dataset: { dsMotionModal: '' } });
        modalTrigger.addEventListener('click', (clickEvent) => modalApi.open({ reason: 'trigger', event: clickEvent }));

        const toastTrigger = el('button', { className: 'btn', type: 'button', text: 'replay toast', dataset: { dsMotionToast: '' } });
        toastTrigger.addEventListener('click', (clickEvent) =>
          toast('saved to your shelf', { tone: 'success', reason: 'trigger', event: clickEvent }),
        );
        actions.append(menuWrap, modalTrigger, toastTrigger, modalEl);
        lab.append(
          el('div', { className: 'ds-motion-toolbar' }, el('span', { text: 'playback' }), speed),
          tiers,
          actions,
        );
        return lab;
      },
    ),
    entry(
      'Drawer and sheet',
      ['drawer()', '.ui-drawer-layer', '.ui-drawer', '--vui-ease-drawer'],
      'One controller serves attached side drawers and mobile bottom sheets. Drag the ink-band handle toward its edge for direct manipulation; Escape and keyboard activation remain immediate.',
      () => {
        const actions = el('div', { className: 'ds-motion-actions' });
        const rightTrigger = el('button', {
          className: 'btn',
          type: 'button',
          text: 'open right drawer',
          dataset: { dsOpenDrawer: '' },
        });
        const sheetTrigger = el('button', {
          className: 'btn',
          type: 'button',
          text: 'open bottom sheet',
          dataset: { dsOpenSheet: '' },
        });

        const rightLayer = drawerLayer({
          side: 'right',
          title: 'add to shelf',
          body: 'An attached workspace keeps the collection in view while you add a title.',
          inputLabel: 'book title',
          openDataset: { dsDrawerLayer: '' },
        });
        const sheetLayer = drawerLayer({
          side: 'bottom',
          title: 'quick add',
          body: 'The same primitive becomes a thumb-reachable sheet without changing its interaction contract.',
          inputLabel: 'scan or search',
          openDataset: { dsSheetLayer: '' },
        });
        const rightApi = drawer(rightLayer, { side: 'right' });
        const sheetApi = drawer(sheetLayer, { side: 'bottom' });
        rightTrigger.addEventListener('click', (event) => rightApi.open({ reason: 'trigger', event, trigger: rightTrigger }));
        sheetTrigger.addEventListener('click', (event) => sheetApi.open({ reason: 'trigger', event, trigger: sheetTrigger }));
        actions.append(rightTrigger, sheetTrigger, rightLayer, sheetLayer);
        return actions;
      },
    ),
  );
}

function drawerLayer({ side, title, body, inputLabel, openDataset }) {
  return el(
    'div',
    {
      className: 'ui-drawer-layer',
      hidden: true,
      ariaHidden: 'true',
      dataset: { vuiDrawerSide: side, ...openDataset },
    },
    el('button', { className: 'ui-drawer-backdrop', type: 'button', ariaLabel: 'close drawer' }),
    el(
      'aside',
      { className: 'ui-drawer', dataset: { vuiDrawerSide: side } },
      el(
        'header',
        { className: 'ui-drawer-head', dataset: { vuiDrawerHandle: '' } },
        el('h3', { className: 'ui-drawer-title', text: title }),
        el('button', { className: 'rune-close', type: 'button', ariaLabel: 'close', text: '×', dataset: { drawerClose: '' } }),
      ),
      el(
        'div',
        { className: 'ui-drawer-body' },
        el('p', { text: body }),
        el('label', { className: 'field-label', text: inputLabel }),
        el('input', { className: 'input', type: 'text', placeholder: inputLabel }),
      ),
      el(
        'footer',
        { className: 'ui-drawer-actions' },
        el('button', { className: 'btn', type: 'button', text: 'cancel', dataset: { drawerClose: '' } }),
        el('button', { className: 'btn btn-primary', type: 'button', text: 'add' }),
      ),
    ),
  );
}

function overlaysGroup() {
  return group(
    'overlays',
    'Overlays',
    entry('Modal frame', ['.ui-modal-card', '.ui-modal-head', '.ui-modal-body', '.rune-close'], 'Canonical modal card: one calm surface and one quiet header treatment, whether the panel is centered or floating.', () =>
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
    entry('Modal, live', ['modal()', '.ui-modal'], 'The real helper, fully interactive: open from the trigger, drag by the head, resize from the edges, close via ×/escape/backdrop.', () => {
      const wrap = el('div');
      const modalEl = el(
        'div',
        { className: 'ui-modal', hidden: true, ariaHidden: 'true' },
        el(
          'section',
          { className: 'ui-modal-card' },
          el(
            'header',
            { className: 'ui-modal-head' },
            el('h3', { className: 'ui-modal-title', text: 'live modal' }),
            el('button', { className: 'rune-close', type: 'button', ariaLabel: 'close', dataset: { modalClose: '' }, text: 'x' }),
          ),
          el('div', { className: 'ui-modal-body', text: 'Escape, backdrop click, and the quiet × all work here.' }),
          el('footer', { className: 'ui-modal-actions' }, el('button', { className: 'btn btn-secondary', type: 'button', text: 'close', dataset: { modalClose: '' } })),
        ),
      );
      const api = modal(modalEl);
      const trigger = el('button', { className: 'btn', type: 'button', text: 'open modal', onClick: (event) => api.open({ reason: 'trigger', event }) });
      trigger.dataset.dsOpenModal = '';
      wrap.append(trigger, modalEl);
      return wrap;
    }),
    entry(
      'Popover frame',
      ['.ui-popover', '.floating-menu', '.floating-menu-item', '[aria-haspopup]', '.is-submenu-open'],
      'Anchored floating surface and menu item vocabulary. Live: the trigger opens a real floatingMenu() — arrows navigate, enter picks, escape closes. The "move to ▸" item opens a fly-out submenu with safe-triangle hover-intent: move diagonally toward it and it stays open even if you clip the corner.',
      () => {
        const wrap = el('div', { className: 'ds-floating-demo', style: { position: 'relative' } });
        const trigger = el('button', { className: 'btn', type: 'button', text: 'open menu' });
        const menu = el('div', { className: 'ui-popover floating-menu', role: 'menu' });
        menu.hidden = true;
        let controller = null;

        const simpleItem = (label) => {
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
          return item;
        };

        // A fly-out submenu wrapper: an [aria-haspopup] trigger + a sibling
        // [role="menu"]. floatingMenu's hoverIntent finds this pair by ARIA and
        // manages it with the safe-triangle heuristic, toggling .is-submenu-open.
        const submenuWrap = el('div', {
          className: 'floating-submenu-wrap',
          style: { position: 'relative', display: 'grid' },
        });
        const submenuTrigger = el('button', {
          className: 'floating-menu-item',
          type: 'button',
          text: 'move to ▸',
          role: 'menuitem',
        });
        submenuTrigger.setAttribute('aria-haspopup', 'true');
        const submenu = el('div', { className: 'ui-popover floating-menu floating-submenu', role: 'menu' });
        for (const label of ['top deck', 'sideboard', 'binder']) {
          const sub = simpleItem(label);
          submenu.append(sub);
        }
        submenuWrap.append(submenuTrigger, submenu);

        menu.append(simpleItem('compare build'), submenuWrap, simpleItem('remove'));
        wrap.append(trigger, menu);
        controller = floatingMenu(trigger, menu, { keyboard: true, hoverIntent: true });
        trigger.addEventListener('click', (event) =>
          controller.isOpen()
            ? controller.close({ reason: 'trigger', event })
            : controller.open({ focusFirst: true, reason: 'trigger', event }),
        );
        return wrap;
      },
    ),
  );
}

function layoutGroup() {
  return group(
    'layout',
    'Layout',
    entry('Breadcrumb', ['.breadcrumb', '.breadcrumb-sep', '[aria-current=page]'], 'The navigation trail — binder to page to slot. Mono, lowercase, quiet links; the current leaf carries the strong ink.', () => {
      const nav = el('nav', { className: 'breadcrumb', ariaLabel: 'breadcrumb' });
      nav.append(
        el('a', { href: '#layout', text: 'collection' }),
        el('span', { className: 'breadcrumb-sep', ariaHidden: 'true', text: '›' }),
        el('a', { href: '#layout', text: 'trade binder' }),
        el('span', { className: 'breadcrumb-sep', ariaHidden: 'true', text: '›' }),
        el('span', { text: 'page 4' , ariaCurrent: 'page' }),
      );
      return nav;
    }),
    entry('Accordion', ['.accordion', '.accordion-item', '.accordion-body'], 'Styled <details> stack for filter panels and card detail sections — native disclosure semantics, mono +/− marker, shared borders.', () => {
      const make = (label, body, open) => {
        const item = el('details', { className: 'accordion-item' });
        if (open) item.open = true;
        item.append(el('summary', { text: label }), el('div', { className: 'accordion-body', text: body }));
        return item;
      };
      return el(
        'div',
        { className: 'accordion', style: { width: 'min(360px, 100%)' } },
        make('printing details', 'commander masters · #392 · nonfoil · nm', true),
        make('price history', 'last 30 days: $4.20 → $3.85', false),
        make('notes', 'pulled from the deck box during the spring rebuild.', false),
      );
    }),
    entry(
      'Edge resize',
      ['.vui-resize-divider', '.vui-resize-grip', 'edgeResize()'],
      'Drag-only panel resizing with snap-to-collapsed. Drag the divider to resize; drag past the minimum to snap the pane closed; drag or click the collapsed grip edge to reopen. No toggle buttons.',
      () => {
        const MIN = 120;
        const MAX = 280;
        const wrap = el('div', { className: 'ds-edge-resize-demo' });
        wrap.style.cssText =
          'position:relative;display:flex;height:160px;width:min(420px,100%);border:var(--vui-border-width) solid var(--vui-color-line);';
        const pane = el('div', { className: 'ds-edge-resize-pane', text: 'pane' });
        pane.style.cssText =
          'width:var(--ds-edge-pane-w, 180px);min-width:0;flex:none;display:flex;align-items:center;justify-content:center;background:var(--vui-color-surface-sunken);overflow:hidden;';
        const rest = el('div', { text: 'content' });
        rest.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;';
        const handle = el('div', {
          className: 'vui-resize-divider vui-resize-divider-x',
          role: 'separator',
          ariaLabel: 'resize pane',
        });
        handle.tabIndex = 0;
        handle.style.left = 'calc(var(--ds-edge-pane-w, 180px) - 4px)';
        const grip = el('span', { className: 'vui-resize-grip vui-resize-grip-x' });
        grip.style.cssText =
          'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;';
        handle.append(grip);
        wrap.append(pane, rest, handle);
        const setCollapsed = (collapsed) => {
          wrap.classList.toggle('ds-edge-resize-collapsed', collapsed);
          pane.style.display = collapsed ? 'none' : '';
          handle.style.left = collapsed ? '0' : 'calc(var(--ds-edge-pane-w, 180px) - 4px)';
        };
        edgeResize(handle, {
          axis: 'x',
          min: MIN,
          max: MAX,
          getSize: () => pane.getBoundingClientRect().width,
          isCollapsed: () => wrap.classList.contains('ds-edge-resize-collapsed'),
          setCollapsed,
          applySize: (px) => {
            wrap.style.setProperty('--ds-edge-pane-w', px + 'px');
            handle.style.left = 'calc(' + px + 'px - 4px)';
          },
        });
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
