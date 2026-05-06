(() => {
  const state = { mode: 'select', drawing: false, points: [] };
  const post = (type, payload = {}) => window.dispatchEvent(new CustomEvent('kodo-design', { detail: { type, ...payload } }));

  window.KodoDesignOverlay = {
    setMode(mode) {
      state.mode = mode;
      post('mode', { mode });
    },
    exportClean(html) {
      return fetch('/api/design/export/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, format: 'html' }),
      }).then((res) => res.json());
    },
    audit(html) {
      return fetch('/api/design/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
      }).then((res) => res.json());
    },
  };
})();
