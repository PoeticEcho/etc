// Follow the dashboard setting in CCTV windows, including changes from another tab.
(() => {
  const key = 'weather-watch:settings:v2';
  function applyTheme() {
    try {
      const settings = JSON.parse(localStorage.getItem(key));
      document.body.classList.toggle('dark-mode', settings?.darkMode === true);
    } catch {}
  }
  applyTheme();
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) applyTheme();
  });
})();
