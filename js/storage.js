/* ===================================================================
   Tracking Buddy — storage.js
   localStorage abstraction. All state read/write goes through here.
   =================================================================== */

const TB = window.TB = window.TB || {};

TB.Storage = (function () {
  const STORAGE_KEY = 'trackingBuddy.v1';
  const APP_VERSION = '0.001';

  // Default state — first-run defaults
  function makeDefaultState() {
    const now = Date.now();
    const defaultDashboardId = 'dash-' + now;
    return {
      version: APP_VERSION,
      meta: {
        firstLaunch: now,
        lastOpened: now,
        onboardingComplete: false
      },
      settings: {
        theme: 'sunshine',
        autoRecaps: true,
        notificationsEnabled: false,
        showSystemTile: true
      },
      // Cross-dashboard meta stats (for the Tally tile, persisted even if hidden)
      stats: {
        tilesCreated: 0,
        totalLogs: 0,
        totalLapses: 0,
        longestTileId: null,
        longestTileStart: null
      },
      activeDashboardId: defaultDashboardId,
      dashboards: [
        {
          id: defaultDashboardId,
          name: 'My Dashboard',
          created: now,
          order: [] // array of tile ids defining display order
        }
      ],
      tiles: {} // id -> tile object
    };
  }

  let state = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state = makeDefaultState();
        save();
        return state;
      }
      state = JSON.parse(raw);
      // Light migration / safety
      if (!state.version) state.version = APP_VERSION;
      if (!state.meta) state.meta = { firstLaunch: Date.now(), lastOpened: Date.now(), onboardingComplete: false };
      if (!state.settings) state.settings = { theme: 'sunshine', autoRecaps: true, notificationsEnabled: false, showSystemTile: true };
      if (!state.stats) state.stats = { tilesCreated: 0, totalLogs: 0, totalLapses: 0, longestTileId: null, longestTileStart: null };
      if (!state.dashboards || state.dashboards.length === 0) {
        const d = makeDefaultState();
        state.dashboards = d.dashboards;
        state.activeDashboardId = d.activeDashboardId;
      }
      if (!state.tiles) state.tiles = {};
      state.meta.lastOpened = Date.now();
      save();
      return state;
    } catch (err) {
      console.error('Storage load failed, resetting:', err);
      state = makeDefaultState();
      save();
      return state;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Storage save failed:', err);
      // Could be quota — surface to user
      if (err.name === 'QuotaExceededError') {
        if (window.TB.UI && window.TB.UI.toast) {
          window.TB.UI.toast('Storage full — consider deleting old tiles or exporting a backup', 'danger');
        }
      }
    }
  }

  function getState() { return state; }
  function getVersion() { return APP_VERSION; }

  function getSettings() { return state.settings; }
  function updateSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    save();
  }

  function getStats() { return state.stats; }
  function updateStats(patch) {
    state.stats = { ...state.stats, ...patch };
    save();
  }

  // ========== Dashboards ==========
  function getDashboards() { return state.dashboards; }
  function getActiveDashboardId() { return state.activeDashboardId; }
  function getActiveDashboard() {
    return state.dashboards.find(d => d.id === state.activeDashboardId) || state.dashboards[0];
  }
  function setActiveDashboardId(id) {
    if (state.dashboards.find(d => d.id === id)) {
      state.activeDashboardId = id;
      save();
    }
  }

  function createDashboard(name) {
    const id = 'dash-' + Date.now();
    const dashboard = {
      id,
      name: name || 'New Dashboard',
      created: Date.now(),
      order: []
    };
    state.dashboards.push(dashboard);
    state.activeDashboardId = id;
    save();
    return dashboard;
  }

  function renameDashboard(id, name) {
    const d = state.dashboards.find(x => x.id === id);
    if (d) { d.name = name; save(); }
  }

  function deleteDashboard(id) {
    if (state.dashboards.length <= 1) return false;
    const d = state.dashboards.find(x => x.id === id);
    if (!d) return false;
    // Archive tiles from this dashboard
    d.order.forEach(tileId => {
      if (state.tiles[tileId]) {
        delete state.tiles[tileId];
      }
    });
    state.dashboards = state.dashboards.filter(x => x.id !== id);
    if (state.activeDashboardId === id) {
      state.activeDashboardId = state.dashboards[0].id;
    }
    save();
    return true;
  }

  // ========== Tiles ==========
  function getTile(id) { return state.tiles[id]; }
  function getAllTiles() { return state.tiles; }

  function getTilesForDashboard(dashboardId) {
    const d = state.dashboards.find(x => x.id === dashboardId);
    if (!d) return [];
    return d.order.map(id => state.tiles[id]).filter(Boolean);
  }

  function createTile(tile) {
    const id = tile.id || 'tile-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const now = Date.now();
    const newTile = {
      id,
      name: tile.name || 'Untitled',
      type: tile.type || 'neutral', // quit | build | observe | neutral
      iconId: tile.iconId || 'star',
      customIcon: tile.customIcon || null, // base64 data url
      color: tile.color || null,
      shape: tile.shape || 'square', // square | wide | tall | large
      unitName: tile.unitName || 'thing',
      unitNamePlural: tile.unitNamePlural || 'things',
      inputs: tile.inputs || {}, // costPerUnit, baselinePerDay, timePerUnitMinutes, dailyGoal, etc.
      faceMetrics: tile.faceMetrics || ['time-since', 'total-count'],
      paused: false,
      pausedAt: null,
      pauseDuration: 0, // total ms paused
      created: now,
      streakStart: now, // when current streak began (used by time-since-last)
      longestStreak: 0, // ms
      logs: [], // [{ time, type: 'log'|'lapse', count: 1, note: '' }]
      system: tile.system || false
    };

    state.tiles[id] = newTile;

    // Add to active dashboard order
    const dashboard = state.dashboards.find(d => d.id === state.activeDashboardId);
    if (dashboard) {
      dashboard.order.push(id);
    }

    // Update meta stats
    if (!newTile.system) {
      state.stats.tilesCreated = (state.stats.tilesCreated || 0) + 1;
    }

    save();
    return newTile;
  }

  function updateTile(id, patch) {
    if (!state.tiles[id]) return null;
    state.tiles[id] = { ...state.tiles[id], ...patch };
    save();
    return state.tiles[id];
  }

  function deleteTile(id) {
    const tile = state.tiles[id];
    if (!tile) return false;
    if (tile.system) {
      // System tile gets hidden, not deleted
      state.settings.showSystemTile = false;
      // Remove from dashboard order
      state.dashboards.forEach(d => {
        d.order = d.order.filter(x => x !== id);
      });
      save();
      return true;
    }
    delete state.tiles[id];
    state.dashboards.forEach(d => {
      d.order = d.order.filter(x => x !== id);
    });
    save();
    return true;
  }

  function duplicateTile(id) {
    const original = state.tiles[id];
    if (!original) return null;
    const copy = {
      ...JSON.parse(JSON.stringify(original)),
      id: undefined,
      name: original.name + ' (copy)',
      created: Date.now(),
      streakStart: Date.now(),
      logs: [],
      pausedAt: null,
      pauseDuration: 0,
      paused: false,
      system: false
    };
    return createTile(copy);
  }

  function moveTile(tileId, fromIndex, toIndex) {
    const dashboard = getActiveDashboard();
    if (!dashboard) return;
    const order = dashboard.order;
    const idx = order.indexOf(tileId);
    if (idx === -1) return;
    order.splice(idx, 1);
    order.splice(toIndex, 0, tileId);
    save();
  }

  function reorderTiles(tileIds) {
    const dashboard = getActiveDashboard();
    if (!dashboard) return;
    dashboard.order = tileIds.filter(id => state.tiles[id]);
    save();
  }

  // ========== Logs ==========
  function logTile(tileId, type, options) {
    options = options || {};
    const tile = state.tiles[tileId];
    if (!tile) return null;

    const entry = {
      time: Date.now(),
      type: type || 'log', // 'log' | 'lapse'
      count: options.count || 1,
      note: options.note || ''
    };

    tile.logs.push(entry);

    // For quit-type tiles, a 'lapse' resets the streak
    if (type === 'lapse' && tile.type === 'quit') {
      // Compute current streak duration and check if it beats longest
      const streakDur = (Date.now() - tile.streakStart) - (tile.pauseDuration || 0);
      if (streakDur > (tile.longestStreak || 0)) {
        tile.longestStreak = streakDur;
      }
      tile.streakStart = Date.now();
      tile.pauseDuration = 0;
      tile.pausedAt = null;
      tile.paused = false;
      if (!tile.system) state.stats.totalLapses = (state.stats.totalLapses || 0) + 1;
    } else {
      // Regular log
      if (!tile.system) state.stats.totalLogs = (state.stats.totalLogs || 0) + 1;
    }

    save();
    return entry;
  }

  function deleteLogEntry(tileId, logTime) {
    const tile = state.tiles[tileId];
    if (!tile) return false;
    tile.logs = tile.logs.filter(l => l.time !== logTime);
    save();
    return true;
  }

  // ========== Pause/Resume ==========
  function pauseTile(tileId) {
    const tile = state.tiles[tileId];
    if (!tile || tile.paused) return;
    tile.paused = true;
    tile.pausedAt = Date.now();
    save();
  }

  function resumeTile(tileId) {
    const tile = state.tiles[tileId];
    if (!tile || !tile.paused) return;
    tile.pauseDuration = (tile.pauseDuration || 0) + (Date.now() - tile.pausedAt);
    tile.paused = false;
    tile.pausedAt = null;
    save();
  }

  function resetStreak(tileId) {
    const tile = state.tiles[tileId];
    if (!tile) return;
    const streakDur = (Date.now() - tile.streakStart) - (tile.pauseDuration || 0);
    if (streakDur > (tile.longestStreak || 0)) tile.longestStreak = streakDur;
    tile.streakStart = Date.now();
    tile.pauseDuration = 0;
    tile.pausedAt = null;
    tile.paused = false;
    save();
  }

  // ========== Export / Import ==========
  function exportData() {
    return JSON.stringify(state, null, 2);
  }

  function importData(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      if (!imported.dashboards || !imported.tiles) {
        throw new Error('Invalid backup file structure');
      }
      state = imported;
      // Patch in any missing fields
      if (!state.settings) state.settings = makeDefaultState().settings;
      if (!state.stats) state.stats = makeDefaultState().stats;
      if (!state.meta) state.meta = makeDefaultState().meta;
      save();
      return true;
    } catch (err) {
      console.error('Import failed:', err);
      return false;
    }
  }

  function clearAll() {
    state = makeDefaultState();
    save();
  }

  return {
    load, save,
    getState, getVersion,
    getSettings, updateSettings,
    getStats, updateStats,
    getDashboards, getActiveDashboard, getActiveDashboardId, setActiveDashboardId,
    createDashboard, renameDashboard, deleteDashboard,
    getTile, getAllTiles, getTilesForDashboard,
    createTile, updateTile, deleteTile, duplicateTile,
    moveTile, reorderTiles,
    logTile, deleteLogEntry,
    pauseTile, resumeTile, resetStreak,
    exportData, importData, clearAll
  };
})();
