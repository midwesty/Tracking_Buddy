/* ===================================================================
   Tracking Buddy — app.js
   Entry point. Loads JSON data, initializes storage, wires UI.
   =================================================================== */

const TB = window.TB = window.TB || {};
TB.Data = TB.Data || {};

(async function init() {
  // ===== Load JSON data files =====
  try {
    const [themes, icons, metrics, presets] = await Promise.all([
      fetchJSON('data/themes.json'),
      fetchJSON('data/icons.json'),
      fetchJSON('data/metrics.json'),
      fetchJSON('data/presets.json')
    ]);
    TB.Data.themes = themes.themes;
    TB.Data.icons = icons.icons;
    TB.Data.metrics = metrics.metrics;
    TB.Data.presets = presets.presets;
  } catch (err) {
    console.error('Failed to load data files:', err);
    // Show error UI
    document.getElementById('dashboard').innerHTML =
      '<div style="padding:40px; text-align:center;">' +
      '<h2>Oops! Tracking Buddy couldn\'t load.</h2>' +
      '<p style="color:var(--text-secondary); margin-top:12px;">' +
      'The data files (JSON) didn\'t load. If you\'re opening the app directly from a file (file://), ' +
      'try serving it through a local web server instead.</p>' +
      '<p style="color:var(--text-muted); margin-top:12px; font-size:0.85rem;">' +
      'In your project folder, run:<br><code style="background:var(--surface-alt); padding:4px 8px; border-radius:6px;">python -m http.server 8000</code><br>' +
      'Then visit <strong>http://localhost:8000</strong></p>' +
      '<p style="color:var(--text-muted); margin-top:20px; font-size:0.8rem;">Error: ' +
      (err && err.message ? err.message : 'unknown') + '</p>' +
      '</div>';
    return;
  }

  // ===== Load saved state =====
  TB.Storage.load();

  // ===== Apply saved theme =====
  const settings = TB.Storage.getSettings();
  TB.Modals.applyTheme(settings.theme || 'sunshine');

  // ===== Wire header buttons =====
  const dashSwitcher = document.getElementById('dashboard-switcher');
  if (dashSwitcher) {
    dashSwitcher.addEventListener('click', () => TB.Modals.openDashboardManager());
  }

  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => TB.Modals.openSettings());
  }

  // ===== Wire FAB =====
  const fab = document.getElementById('fab-add');
  if (fab) {
    let fabPressTimer = null;
    let fabLongPressed = false;

    fab.addEventListener('pointerdown', (e) => {
      fabLongPressed = false;
      fabPressTimer = setTimeout(() => {
        fabLongPressed = true;
        // Long press → toggle edit mode
        if (navigator.vibrate) navigator.vibrate(30);
        TB.Dashboard.setEditMode(true);
      }, 550);
    });

    fab.addEventListener('pointerup', () => {
      if (fabPressTimer) clearTimeout(fabPressTimer);
    });
    fab.addEventListener('pointerleave', () => {
      if (fabPressTimer) clearTimeout(fabPressTimer);
    });
    fab.addEventListener('pointercancel', () => {
      if (fabPressTimer) clearTimeout(fabPressTimer);
    });

    fab.addEventListener('click', (e) => {
      if (fabLongPressed) { fabLongPressed = false; return; }
      if (TB.Dashboard.isEditMode()) {
        // In edit mode, FAB exits edit mode
        TB.Dashboard.setEditMode(false);
      } else {
        TB.Tiles.openCreateModal();
      }
    });
  }

  // ===== Render dashboard =====
  TB.Dashboard.render();
  TB.Dashboard.startLiveUpdates();

  // ===== First-launch onboarding =====
  const meta = TB.Storage.getState().meta;
  if (!meta.onboardingComplete) {
    setTimeout(() => {
      TB.Modals.openOnboarding();
    }, 400);
  }

  // ===== Helpful keyboard shortcut for desktop =====
  document.addEventListener('keydown', (e) => {
    // Esc to exit edit mode
    if (e.key === 'Escape' && TB.Dashboard.isEditMode()) {
      const hasModal = document.getElementById('tb-modal-backdrop');
      if (!hasModal) TB.Dashboard.setEditMode(false);
    }
  });

  console.log('🐢 Tracking Buddy v' + TB.Storage.getVersion() + ' loaded. Tally says hi!');
})();

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('Failed to fetch ' + path + ' (' + res.status + ')');
  return res.json();
}
