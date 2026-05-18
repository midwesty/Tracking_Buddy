/* ===================================================================
   Tracking Buddy — modals.js
   Settings, dashboard manager, onboarding wizard, export/import.
   =================================================================== */

const TB = window.TB = window.TB || {};

TB.Modals = (function () {

  // ============ SETTINGS ============
  function openSettings() {
    const settings = TB.Storage.getSettings();
    const themes = TB.Data.themes || [];
    const version = TB.Storage.getVersion();

    let themeCards = '';
    for (const t of themes) {
      const isActive = settings.theme === t.id;
      const swatch1 = t.colors['--accent'] || '#FF7849';
      const swatch2 = t.colors['--secondary'] || '#FFB627';
      const swatch3 = t.colors['--bg-primary'] || '#FFFFFF';
      const swatch4 = t.colors['--surface'] || '#FFFFFF';
      const cardBg = t.colors['--bg-secondary'] || '#FFF8EC';
      const cardText = t.colors['--text-primary'] || '#333';
      themeCards += '<div class="theme-card' + (isActive ? ' active' : '') + '" data-theme-id="' + t.id + '" ' +
        'style="background:' + cardBg + '; color:' + cardText + ';">' +
        '  <div class="theme-card-name">' + t.name + '</div>' +
        '  <div class="theme-card-desc">' + t.description + '</div>' +
        '  <div class="theme-card-swatches">' +
        '    <div class="theme-swatch" style="background:' + swatch1 + ';"></div>' +
        '    <div class="theme-swatch" style="background:' + swatch2 + ';"></div>' +
        '    <div class="theme-swatch" style="background:' + swatch3 + ';"></div>' +
        '    <div class="theme-swatch" style="background:' + swatch4 + ';"></div>' +
        '  </div>' +
        '</div>';
    }

    const systemTileToggleLabel = settings.showSystemTile
      ? 'Hide Tracking Buddy tile'
      : 'Restore Tracking Buddy tile';

    const html = '' +
      '<div class="modal-header">' +
      '  <h2>Settings</h2>' +
      '  <button class="modal-close" data-close-modal>×</button>' +
      '</div>' +
      '<div class="modal-body">' +

      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Theme</div>' +
      '    <div class="theme-grid" id="tb-theme-grid">' + themeCards + '</div>' +
      '  </div>' +

      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Dashboards</div>' +
      '    <div class="settings-list">' +
      '      <div class="settings-item">' +
      '        <div class="settings-item-info">' +
      '          <div class="settings-item-label">Manage dashboards</div>' +
      '          <div class="settings-item-desc">Create, rename, switch, or delete dashboards</div>' +
      '        </div>' +
      '        <button class="btn btn-secondary" data-action="manage-dashboards">Open</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Tracking Buddy tile</div>' +
      '    <div class="settings-list">' +
      '      <div class="settings-item">' +
      '        <div class="settings-item-info">' +
      '          <div class="settings-item-label">' + systemTileToggleLabel + '</div>' +
      '          <div class="settings-item-desc">Tally\'s tile keeps tracking stats in the background even when hidden — restore anytime, nothing is lost.</div>' +
      '        </div>' +
      '        <button class="btn btn-secondary" data-action="toggle-system-tile">' + (settings.showSystemTile ? 'Hide' : 'Restore') + '</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Backup &amp; restore</div>' +
      '    <div class="settings-list">' +
      '      <div class="settings-item">' +
      '        <div class="settings-item-info">' +
      '          <div class="settings-item-label">Export your data</div>' +
      '          <div class="settings-item-desc">Save a JSON backup of everything to your device</div>' +
      '        </div>' +
      '        <button class="btn btn-secondary" data-action="export">Export</button>' +
      '      </div>' +
      '      <div class="settings-item">' +
      '        <div class="settings-item-info">' +
      '          <div class="settings-item-label">Import from backup</div>' +
      '          <div class="settings-item-desc">Restore from a previously exported JSON file. Replaces all current data.</div>' +
      '        </div>' +
      '        <button class="btn btn-secondary" data-action="import">Import</button>' +
      '      </div>' +
      '      <div class="settings-item">' +
      '        <div class="settings-item-info">' +
      '          <div class="settings-item-label" style="color:var(--danger);">Clear all data</div>' +
      '          <div class="settings-item-desc">Wipe everything and start over. Cannot be undone.</div>' +
      '        </div>' +
      '        <button class="btn btn-secondary" data-action="clear-all" style="color:var(--danger);">Clear</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      '  <div class="detail-section">' +
      '    <div class="detail-section-title">About</div>' +
      '    <div class="settings-list">' +
      '      <div class="settings-item">' +
      '        <div class="settings-item-info">' +
      '          <div class="settings-item-label">Replay welcome tour</div>' +
      '          <div class="settings-item-desc">Show the onboarding wizard again</div>' +
      '        </div>' +
      '        <button class="btn btn-secondary" data-action="replay-onboarding">Replay</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="version-tag">Tracking Buddy v' + version + ' · 🐢 Tally says hi</div>' +
      '  </div>' +

      '</div>';

    const modal = TB.UI.openModal(html);

    // Theme picker
    modal.querySelectorAll('[data-theme-id]').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.themeId;
        TB.Storage.updateSettings({ theme: id });
        applyTheme(id);
        modal.querySelectorAll('[data-theme-id]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        TB.UI.toast('Theme updated', 'success', 1200);
      });
    });

    // Actions
    modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'manage-dashboards') {
          TB.UI.closeModal();
          setTimeout(openDashboardManager, 200);
        } else if (action === 'toggle-system-tile') {
          const cur = TB.Storage.getSettings().showSystemTile;
          TB.Storage.updateSettings({ showSystemTile: !cur });
          if (!cur) {
            // Restore: ensure tile exists and add to active dashboard
            const sys = TB.Dashboard.ensureSystemTile();
            const d = TB.Storage.getActiveDashboard();
            if (sys && d && !d.order.includes(sys.id)) {
              d.order.unshift(sys.id);
              TB.Storage.save();
            }
            TB.UI.toast('Tracking Buddy tile restored', 'success');
          } else {
            // Hide: remove from all dashboards
            const state = TB.Storage.getState();
            state.dashboards.forEach(d => {
              d.order = d.order.filter(x => x !== 'system-tally');
            });
            TB.Storage.save();
            TB.UI.toast('Tile hidden — data still tracking in background', 'warning', 2800);
          }
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        } else if (action === 'export') {
          exportData();
        } else if (action === 'import') {
          importData();
        } else if (action === 'clear-all') {
          TB.UI.confirm(
            'Wipe everything? All tiles, history, and dashboards will be deleted. This cannot be undone. ' +
            'Consider exporting a backup first.',
            { confirmText: 'Yes, wipe it all', danger: true }
          ).then(ok => {
            if (ok) {
              TB.Storage.clearAll();
              TB.UI.closeModal();
              TB.UI.toast('All data cleared', 'warning');
              TB.Dashboard.refresh();
              // Re-run onboarding
              setTimeout(openOnboarding, 400);
            }
          });
        } else if (action === 'replay-onboarding') {
          TB.UI.closeModal();
          setTimeout(openOnboarding, 200);
        }
      });
    });
  }

  // ============ DASHBOARD MANAGER ============
  function openDashboardManager() {
    const dashboards = TB.Storage.getDashboards();
    const activeId = TB.Storage.getActiveDashboardId();

    let listHTML = '';
    for (const d of dashboards) {
      const isActive = d.id === activeId;
      const count = d.order.filter(id => {
        const t = TB.Storage.getTile(id);
        return t && !t.system;
      }).length;
      listHTML += '<div class="dashboard-list-item' + (isActive ? ' active' : '') + '" data-dashboard-id="' + d.id + '">' +
        '  <div class="dashboard-list-item-name">' + TB.UI.escapeHtml(d.name) + '</div>' +
        '  <div class="dashboard-list-item-count">' + count + ' tile' + (count === 1 ? '' : 's') + '</div>' +
        '  <div class="dashboard-list-actions">' +
        '    <button class="icon-btn-sm" data-rename="' + d.id + '" title="Rename">✎</button>' +
        (dashboards.length > 1 ? '    <button class="icon-btn-sm" data-delete-dashboard="' + d.id + '" title="Delete" style="color:var(--danger);">🗑</button>' : '') +
        '  </div>' +
        '</div>';
    }

    const html = '' +
      '<div class="modal-header">' +
      '  <h2>Dashboards</h2>' +
      '  <button class="modal-close" data-close-modal>×</button>' +
      '</div>' +
      '<div class="modal-body">' +
      '  <p style="margin-bottom:16px; color:var(--text-secondary); font-size:0.9rem;">Switch between dashboards by tapping one. Each dashboard has its own tiles — great for separating Work / Personal / Health, etc.</p>' +
      '  <div class="dashboard-list">' + listHTML + '</div>' +
      '  <button class="btn btn-primary btn-full" data-action="new-dashboard">+ New dashboard</button>' +
      '</div>';

    const modal = TB.UI.openModal(html);

    // Switch active by tapping name
    modal.querySelectorAll('[data-dashboard-id]').forEach(item => {
      item.addEventListener('click', e => {
        // Ignore clicks on action buttons inside
        if (e.target.closest('button')) return;
        const id = item.dataset.dashboardId;
        TB.Storage.setActiveDashboardId(id);
        TB.UI.toast('Switched dashboards', 'success', 1200);
        TB.UI.closeModal();
        TB.Dashboard.refresh();
      });
    });

    // Rename
    modal.querySelectorAll('[data-rename]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.rename;
        const d = TB.Storage.getDashboards().find(x => x.id === id);
        if (!d) return;
        TB.UI.prompt('Dashboard name', d.name, { title: 'Rename dashboard' }).then(name => {
          if (name) {
            TB.Storage.renameDashboard(id, name);
            TB.UI.closeModal();
            TB.UI.toast('Renamed', 'success', 1200);
            TB.Dashboard.refresh();
            setTimeout(openDashboardManager, 200);
          }
        });
      });
    });

    // Delete
    modal.querySelectorAll('[data-delete-dashboard]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.deleteDashboard;
        const d = TB.Storage.getDashboards().find(x => x.id === id);
        if (!d) return;
        TB.UI.confirm(
          'Delete dashboard "' + TB.UI.escapeHtml(d.name) + '" and all its tiles? Cannot be undone.',
          { confirmText: 'Delete', danger: true }
        ).then(ok => {
          if (ok) {
            TB.Storage.deleteDashboard(id);
            TB.UI.closeModal();
            TB.UI.toast('Deleted', 'warning');
            TB.Dashboard.refresh();
            setTimeout(openDashboardManager, 200);
          }
        });
      });
    });

    // New
    modal.querySelector('[data-action="new-dashboard"]').addEventListener('click', () => {
      TB.UI.prompt('Name your new dashboard', '', { title: 'New dashboard', confirmText: 'Create' }).then(name => {
        if (name) {
          TB.Storage.createDashboard(name);
          TB.UI.closeModal();
          TB.UI.toast('Dashboard created', 'success');
          TB.Dashboard.refresh();
        }
      });
    });
  }

  // ============ EXPORT / IMPORT ============
  function exportData() {
    try {
      const json = TB.Storage.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = 'tracking-buddy-backup-' + dateStr + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 100);
      TB.UI.toast('Backup downloaded', 'success', 2000);
    } catch (err) {
      console.error(err);
      TB.UI.toast('Export failed', 'danger');
    }
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', e => {
      const file = input.files && input.files[0];
      if (!file) { input.remove(); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        TB.UI.confirm(
          'Importing will replace all current data with the contents of "' + TB.UI.escapeHtml(file.name) + '". Continue?',
          { confirmText: 'Import', danger: true }
        ).then(ok => {
          if (!ok) { input.remove(); return; }
          const ok2 = TB.Storage.importData(ev.target.result);
          if (ok2) {
            // Re-apply theme
            const settings = TB.Storage.getSettings();
            applyTheme(settings.theme);
            TB.UI.closeModal();
            TB.UI.toast('Imported! Welcome back.', 'success', 2400);
            TB.Dashboard.refresh();
          } else {
            TB.UI.toast('Import failed — file may be corrupted', 'danger', 3000);
          }
          input.remove();
        });
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // ============ THEME APPLICATION ============
  function applyTheme(themeId) {
    const themes = TB.Data.themes || [];
    const t = themes.find(x => x.id === themeId) || themes[0];
    if (!t) return;
    const root = document.documentElement;
    for (const k in t.colors) {
      root.style.setProperty(k, t.colors[k]);
    }
    // Set color-scheme for browser UI to match
    root.style.colorScheme = t.isDark ? 'dark' : 'light';
  }

  // ============ ONBOARDING WIZARD ============
  function openOnboarding() {
    let step = 0;
    const totalSteps = 3;

    function renderStep() {
      const dots = [];
      for (let i = 0; i < totalSteps; i++) {
        dots.push('<div class="wizard-dot' + (i === step ? ' active' : (i < step ? ' complete' : '')) + '"></div>');
      }
      const dotsHTML = '<div class="wizard-progress">' + dots.join('') + '</div>';

      let bodyHTML, primaryBtnText, primaryAction;

      if (step === 0) {
        bodyHTML = '' +
          '<div class="wizard-step">' +
          dotsHTML +
          '<div class="wizard-mascot">' + TB.UI.mascotHTML('hero') + '</div>' +
          '<h2 class="wizard-title">Hi! I\'m Tally 🐢</h2>' +
          '<p class="wizard-subtitle">I\'m your tracking buddy. I help you build streaks, count things you care about, and celebrate the small wins. Slow and steady — that\'s my motto.</p>' +
          '</div>';
        primaryBtnText = 'Nice to meet you, Tally';
        primaryAction = () => { step++; rerender(); };

      } else if (step === 1) {
        bodyHTML = '' +
          '<div class="wizard-step">' +
          dotsHTML +
          '<div class="wizard-mascot">' + TB.UI.mascotHTML('point') + '</div>' +
          '<h2 class="wizard-title">Tiles are your trackers</h2>' +
          '<p class="wizard-subtitle">Each thing you want to track gets a tile. There are 4 flavors:</p>' +
          '<div style="display:flex; flex-direction:column; gap:8px; max-width:340px; margin: 0 auto;">' +
          '  <div style="background:var(--surface-alt); padding:10px 14px; border-radius:14px;"><strong>🚭 Quit</strong> — streak away from a habit</div>' +
          '  <div style="background:var(--surface-alt); padding:10px 14px; border-radius:14px;"><strong>🌱 Build</strong> — do something more</div>' +
          '  <div style="background:var(--surface-alt); padding:10px 14px; border-radius:14px;"><strong>👀 Observe</strong> — count what you see</div>' +
          '  <div style="background:var(--surface-alt); padding:10px 14px; border-radius:14px;"><strong>📊 Track</strong> — just count things</div>' +
          '</div>' +
          '</div>';
        primaryBtnText = 'Got it';
        primaryAction = () => { step++; rerender(); };

      } else {
        bodyHTML = '' +
          '<div class="wizard-step">' +
          dotsHTML +
          '<div class="wizard-mascot">' + TB.UI.mascotHTML('celebrate') + '</div>' +
          '<h2 class="wizard-title">Let\'s make your first tile!</h2>' +
          '<p class="wizard-subtitle">Pick a preset to start fast, or build one from scratch. You can always edit, duplicate, or delete it later.</p>' +
          '<p class="wizard-subtitle" style="font-size:0.82rem; color:var(--text-muted);">Tip: tap the 🐢 tile up top to see fun stats about your time with me — it\'s deletable if it gets in the way, and restorable from Settings.</p>' +
          '</div>';
        primaryBtnText = 'Make my first tile';
        primaryAction = () => {
          // Mark onboarding done
          const state = TB.Storage.getState();
          state.meta.onboardingComplete = true;
          TB.Storage.save();
          TB.UI.closeModal();
          setTimeout(() => TB.Tiles.openCreateModal(), 250);
        };
      }

      const html = '' +
        '<div class="modal-body" style="padding-top:30px;">' + bodyHTML + '</div>' +
        '<div class="modal-footer">' +
        (step > 0 ? '  <button class="btn btn-secondary" data-action="back">Back</button>' : '') +
        '  <button class="btn btn-primary" data-action="next">' + primaryBtnText + '</button>' +
        '</div>';

      const modal = document.querySelector('.modal');
      if (modal) {
        modal.innerHTML = '<div class="modal-grip"></div>' + html;
      } else {
        TB.UI.openModal(html, { persistent: true });
      }
      // Re-wire
      const m = document.querySelector('.modal');
      const nextBtn = m.querySelector('[data-action="next"]');
      if (nextBtn) nextBtn.addEventListener('click', primaryAction);
      const backBtn = m.querySelector('[data-action="back"]');
      if (backBtn) backBtn.addEventListener('click', () => { step--; rerender(); });
    }

    function rerender() { renderStep(); }

    renderStep();
  }

  return {
    openSettings,
    openDashboardManager,
    openOnboarding,
    applyTheme,
    exportData,
    importData
  };
})();
