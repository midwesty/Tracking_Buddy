/* ===================================================================
   Tracking Buddy — dashboard.js
   Renders the active dashboard, dashboard switcher, edit mode.
   =================================================================== */

var TB = window.TB = window.TB || {};

TB.Dashboard = (function () {
  let editMode = false;
  let liveUpdateInterval = null;

  function render() {
    const container = document.getElementById('dashboard');
    const dashboard = TB.Storage.getActiveDashboard();
    const tiles = TB.Storage.getTilesForDashboard(dashboard.id);
    const settings = TB.Storage.getSettings();

    // Ensure system tile exists if enabled
    let visibleTiles = tiles.slice();
    if (settings.showSystemTile) {
      const sysTile = ensureSystemTile();
      if (sysTile && !visibleTiles.find(t => t.id === sysTile.id)) {
        visibleTiles.unshift(sysTile);
      }
    }

    if (visibleTiles.length === 0) {
      renderEmpty(container);
    } else {
      renderGrid(container, visibleTiles);
    }

    updateHeader();
  }

  function refresh() {
    render();
    // After full refresh, restore edit mode UI if active
    if (editMode) {
      const grid = document.querySelector('.tile-grid');
      if (grid) TB.DragDrop.setEditMode(true, grid);
      const banner = document.getElementById('edit-banner');
      if (!banner) showEditBanner();
    }
  }

  function renderEmpty(container) {
    container.classList.remove('edit-mode');
    container.innerHTML = '' +
      '<div class="dashboard-empty">' +
      '  <div class="dashboard-empty-mascot">' + TB.UI.mascotHTML('hero') + '</div>' +
      '  <h2>Welcome to Tracking Buddy!</h2>' +
      '  <p>I\'m Tally. Let\'s make your first tracker — pick a preset or build from scratch.</p>' +
      '  <button class="btn btn-primary" id="empty-create">Create my first tracker</button>' +
      '</div>';
    const btn = document.getElementById('empty-create');
    if (btn) btn.addEventListener('click', () => TB.Tiles.openCreateModal());
  }

  function renderGrid(container, tiles) {
    let html = '<div class="tile-grid" id="tile-grid"></div>';
    container.innerHTML = html;
    const grid = document.getElementById('tile-grid');
    tiles.forEach((tile, i) => {
      const el = TB.Tiles.renderTileElement(tile, i);
      grid.appendChild(el);
      wireTile(el, tile);
    });
  }

  function wireTile(el, tile) {
    // Click on tile body → open detail (unless in edit mode)
    el.addEventListener('click', e => {
      if (editMode) return;
      // Quick log clicks handled separately
      if (e.target.closest('[data-action="quick-log"]')) return;
      if (e.target.closest('[data-action="delete-tile"]')) return;
      TB.Tiles.openDetail(tile.id);
    });

    // Quick log button
    const ql = el.querySelector('[data-action="quick-log"]');
    if (ql) {
      ql.addEventListener('click', e => {
        e.stopPropagation();
        TB.Tiles.handleQuickLog(tile.id);
      });
    }

    // Delete in edit mode
    const del = el.querySelector('[data-action="delete-tile"]');
    if (del) {
      del.addEventListener('click', e => {
        e.stopPropagation();
        if (tile.system) {
          TB.UI.confirm(
            'Hide the Tally tile? Your stats keep tracking in the background — restore anytime from Settings.',
            { confirmText: 'Hide', danger: false }
          ).then(ok => {
            if (ok) {
              TB.Storage.deleteTile(tile.id);
              refresh();
            }
          });
        } else {
          TB.UI.confirm(
            'Delete "' + TB.UI.escapeHtml(tile.name) + '"? This is permanent — its history will be lost.',
            { confirmText: 'Delete', danger: true }
          ).then(ok => {
            if (ok) {
              TB.Storage.deleteTile(tile.id);
              TB.UI.toast('Deleted', 'warning', 1200);
              refresh();
            }
          });
        }
      });
    }
  }

  function updateHeader() {
    const switcher = document.getElementById('dashboard-switcher-name');
    if (switcher) {
      const d = TB.Storage.getActiveDashboard();
      switcher.textContent = d ? d.name : '—';
    }
  }

  // ===== System tile (Tally meta-tile) =====
  function ensureSystemTile() {
    const all = TB.Storage.getAllTiles();
    let sys = Object.values(all).find(t => t.system && t.id === 'system-tally');
    if (!sys) {
      // Create it but not via createTile (which auto-adds to dashboard order).
      // We'll insert directly so it's not counted in tilesCreated stats.
      const state = TB.Storage.getState();
      sys = {
        id: 'system-tally',
        name: 'Tracking Buddy',
        type: 'neutral',
        iconId: 'star',
        customIcon: null,
        color: null,
        shape: 'wide',
        unitName: 'thing',
        unitNamePlural: 'things',
        inputs: {},
        faceMetrics: ['tb-days-using', 'tb-tiles-created', 'tb-total-logs', 'tb-total-lapses', 'tb-money-saved', 'tb-total-earned'],
        paused: false,
        pausedAt: null,
        pauseDuration: 0,
        created: state.meta.firstLaunch || Date.now(),
        streakStart: state.meta.firstLaunch || Date.now(),
        longestStreak: 0,
        logs: [],
        attempts: [],
        auditLog: [],
        system: true
      };
      state.tiles[sys.id] = sys;
      TB.Storage.save();
    }
    return sys;
  }

  // ===== Edit mode =====
  function toggleEditMode() {
    setEditMode(!editMode);
  }

  function setEditMode(on) {
    editMode = on;
    const grid = document.querySelector('.tile-grid');
    if (!grid) return;
    TB.DragDrop.setEditMode(on, grid);
    const fab = document.getElementById('fab-add');
    if (fab) {
      if (on) {
        fab.classList.add('edit-mode-active');
        fab.innerHTML = '✓';
        fab.setAttribute('aria-label', 'Done editing');
      } else {
        fab.classList.remove('edit-mode-active');
        fab.innerHTML = '+';
        fab.setAttribute('aria-label', 'Add tile');
      }
    }
    if (on) showEditBanner();
    else hideEditBanner();
  }

  function showEditBanner() {
    if (document.getElementById('edit-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'edit-banner';
    banner.className = 'edit-banner';
    banner.textContent = 'Drag tiles to rearrange. Tap × to delete.';
    document.body.appendChild(banner);
  }

  function hideEditBanner() {
    const b = document.getElementById('edit-banner');
    if (b) b.remove();
  }

  function isEditMode() { return editMode; }

  // ===== Live updates (live metrics tick) =====
  function startLiveUpdates() {
    stopLiveUpdates();
    liveUpdateInterval = setInterval(() => {
      const tiles = document.querySelectorAll('.tile');
      tiles.forEach(tileEl => {
        const id = tileEl.dataset.tileId;
        if (!id) return;
        const tile = TB.Storage.getTile(id);
        if (!tile) return;
        // Only update live metrics (avoid pointless work)
        tileEl.querySelectorAll('.tile-metric-value.live').forEach(vEl => {
          const mid = vEl.dataset.metric;
          if (!mid) return;
          const r = TB.Metrics.compute(mid, tile, TB.Storage.getState());
          if (r.formatted !== vEl.textContent) vEl.textContent = r.formatted;
        });
      });
    }, 1000);
  }

  function stopLiveUpdates() {
    if (liveUpdateInterval) {
      clearInterval(liveUpdateInterval);
      liveUpdateInterval = null;
    }
  }

  return {
    render, refresh,
    toggleEditMode, setEditMode, isEditMode,
    startLiveUpdates, stopLiveUpdates,
    ensureSystemTile
  };
})();
