(() => {
  const STORAGE_KEY = 'benson-theme';
  const DARK_META = '#111112';
  const LIGHT_META = '#fafafa';

  function getStoredTheme() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors (e.g. private browsing restrictions)
    }
  }

  function updateToggleUI(dark) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'switch to light mode' : 'switch to dark mode');
    const label = btn.querySelector('.theme-toggle-label');
    if (label) label.textContent = dark ? 'light' : 'dark';
  }

  function applyTheme(theme) {
    const dark = theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? DARK_META : LIGHT_META);
    updateToggleUI(dark);
  }

  const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const initialTheme = getStoredTheme() || (colorSchemeQuery.matches ? 'dark' : 'light');
  applyTheme(initialTheme);

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      saveTheme(next);
      applyTheme(next);
    });
  }

  function onSystemSchemeChange(event) {
    if (getStoredTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light');
  }

  if (colorSchemeQuery.addEventListener) {
    colorSchemeQuery.addEventListener('change', onSystemSchemeChange);
  } else if (colorSchemeQuery.addListener) {
    colorSchemeQuery.addListener(onSystemSchemeChange);
  }
})();
