/* ===================================================================
   Tracking Buddy — storage.js (v0.002)
   localStorage abstraction. All state read/write goes through here.
   =================================================================== */

var TB = window.TB = window.TB || {};

TB.Storage = (function () {
  const STORAGE_KEY = 'trackingBuddy.v1';
  const APP_VERSION = '0.002';

  function makeDefaultState() {
    const now = Date.now();
    const defaultDashboardId = 'dash-' + now;
    return {
      version: APP_VERSION,
      meta: { firstLaunch: now, lastOpened: now, onboardingComplete: false },
      settings: {
        theme: 'sunshine',
        autoRecaps: true,
        notificationsEnabled: false,
        showSystemTile: true
      },
      stats: {
        tilesCreated: 0,
        totalLogs: 0,
        totalLapses: 0,
        totalEarned: 0,
        longestTileId: null,
        longestTileStart: null
      },
      activeDashboardId: defaultDashboardId,
      dashboards: [{ id: defaultDashboardId, name: 'My Dashboard', created: now, order: [] }],
      tiles: {}
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
      runMigrations();
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

  function compareVersion(a, b) {
    const pa = String(a || '0').split('.').map(Number);
    const pb = String(b || '0').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0; const y = pb[i] || 0;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  }

  function runMigrations() {
    if (!state.version) state.version = '0.001';
    if (!state.meta) state.meta = { firstLaunch: Date.now(), lastOpened: Date.now(), onboardingComplete: false };
    if (!state.settings) state.settings = makeDefaultState().settings;
    if (!state.stats) state.stats = makeDefaultState().stats;
    if (state.stats.totalEarned == null) state.stats.totalEarned = 0;
    if (!state.dashboards || state.dashboards.length === 0) {
      const d = makeDefaultState();
      state.dashboards = d.dashboards;
      state.activeDashboardId = d.activeDashboardId;
    }
    if (!state.tiles) state.tiles = {};

    // v0.001 → v0.002: synthesize attempts[] and auditLog[] for every tile.
    if (compareVersion(state.version, '0.002') < 0) {
      Object.values(state.tiles).forEach(tile => {
        if (!tile.attempts) {
          tile.attempts = [];
          if (tile.type === 'quit') {
            const lapses = (tile.logs || []).filter(l => l.type === 'lapse').sort((a, b) => a.time - b.time);
            let attemptStart = tile.created || tile.streakStart || Date.now();
            lapses.forEach(lapse => {
              tile.attempts.push({
                id: 'att-' + lapse.time,
                startTime: attemptStart,
                endTime: lapse.time,
                durationMs: lapse.time - attemptStart,
                closedBy: 'lapse',
                logsCountDuringAttempt: 0
              });
              attemptStart = lapse.time;
            });
            tile.attempts.push({
              id: 'att-current-' + tile.id,
              startTime: tile.streakStart || tile.created || Date.now(),
              endTime: null, durationMs: null, closedBy: null, logsCountDuringAttempt: 0
            });
          } else {
            // Non-quit tiles still get one open attempt for consistency
            tile.attempts.push({
              id: 'att-init-' + (tile.created || Date.now()),
              startTime: tile.created || Date.now(),
              endTime: null, durationMs: null, closedBy: null, logsCountDuringAttempt: (tile.logs || []).length
            });
          }
        }
        if (!tile.auditLog) tile.auditLog = [];
        (tile.logs || []).forEach(l => { if (l.count == null) l.count = 1; });
      });
      state.version = '0.002';
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Storage save failed:', err);
      if (err.name === 'QuotaExceededError' && window.TB.UI && window.TB.UI.toast) {
        window.TB.UI.toast('Storage full — consider deleting old tiles or exporting a backup', 'danger');
      }
    }
  }

  function getState() { return state; }
  function getVersion() { return APP_VERSION; }
  function getSettings() { return state.settings; }
  function updateSettings(patch) { state.settings = { ...state.settings, ...patch }; save(); }
  function getStats() { return state.stats; }
  function updateStats(patch) { state.stats = { ...state.stats, ...patch }; save(); }

  // ========== Dashboards ==========
  function getDashboards() { return state.dashboards; }
  function getActiveDashboardId() { return state.activeDashboardId; }
  function getActiveDashboard() {
    return state.dashboards.find(d => d.id === state.activeDashboardId) || state.dashboards[0];
  }
  function setActiveDashboardId(id) {
    if (state.dashboards.find(d => d.id === id)) { state.activeDashboardId = id; save(); }
  }
  function createDashboard(name) {
    const id = 'dash-' + Date.now();
    const dashboard = { id, name: name || 'New Dashboard', created: Date.now(), order: [] };
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
    d.order.forEach(tileId => { if (state.tiles[tileId]) delete state.tiles[tileId]; });
    state.dashboards = state.dashboards.filter(x => x.id !== id);
    if (state.activeDashboardId === id) state.activeDashboardId = state.dashboards[0].id;
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
      type: tile.type || 'neutral',
      iconId: tile.iconId || 'star',
      customIcon: tile.customIcon || null,
      color: tile.color || null,
      shape: tile.shape || 'square',
      unitName: tile.unitName || 'thing',
      unitNamePlural: tile.unitNamePlural || 'things',
      inputs: tile.inputs || {},
      faceMetrics: tile.faceMetrics || ['time-since', 'total-count'],
      paused: false,
      pausedAt: null,
      pauseDuration: 0,
      created: now,
      streakStart: now,
      longestStreak: 0,
      logs: [],
      attempts: [{
        id: 'att-init-' + now,
        startTime: now,
        endTime: null,
        durationMs: null,
        closedBy: null,
        logsCountDuringAttempt: 0
      }],
      auditLog: [{
        time: now,
        field: '_created',
        oldValue: null,
        newValue: tile.name || 'Untitled',
        note: 'Tracker created'
      }],
      system: tile.system || false
    };

    state.tiles[id] = newTile;
    const dashboard = state.dashboards.find(d => d.id === state.activeDashboardId);
    if (dashboard) dashboard.order.push(id);
    if (!newTile.system) state.stats.tilesCreated = (state.stats.tilesCreated || 0) + 1;
    save();
    return newTile;
  }

  function updateTile(id, patch) {
    if (!state.tiles[id]) return null;
    state.tiles[id] = { ...state.tiles[id], ...patch };
    save();
    return state.tiles[id];
  }

  // v0.002: update with audit log entries.
  // auditEntries: [{ field, oldValue, newValue, note }]
  function updateTileWithAudit(id, patch, auditEntries) {
    if (!state.tiles[id]) return null;
    state.tiles[id] = { ...state.tiles[id], ...patch };
    if (auditEntries && auditEntries.length) {
      const now = Date.now();
      if (!state.tiles[id].auditLog) state.tiles[id].auditLog = [];
      auditEntries.forEach(e => state.tiles[id].auditLog.push({ time: now, ...e }));
    }
    save();
    return state.tiles[id];
  }

  function deleteTile(id) {
    const tile = state.tiles[id];
    if (!tile) return false;
    if (tile.system) {
      state.settings.showSystemTile = false;
      state.dashboards.forEach(d => { d.order = d.order.filter(x => x !== id); });
      save();
      return true;
    }
    delete state.tiles[id];
    state.dashboards.forEach(d => { d.order = d.order.filter(x => x !== id); });
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
      system: false,
      attempts: undefined,
      auditLog: undefined
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
      type: type || 'log',
      count: options.count != null ? options.count : 1,
      note: options.note || ''
    };
    if (options.amount != null) entry.amount = Number(options.amount);
    tile.logs.push(entry);

    const currentAttempt = getCurrentAttempt(tile);
    if (currentAttempt && type !== 'lapse') {
      currentAttempt.logsCountDuringAttempt = (currentAttempt.logsCountDuringAttempt || 0) + 1;
    }

    if (type === 'lapse' && tile.type === 'quit') {
      closeCurrentAttempt(tile, 'lapse');
      tile.attempts.push({
        id: 'att-' + Date.now(),
        startTime: Date.now(),
        endTime: null, durationMs: null, closedBy: null, logsCountDuringAttempt: 0
      });
      const streakDur = (Date.now() - tile.streakStart) - (tile.pauseDuration || 0);
      if (streakDur > (tile.longestStreak || 0)) tile.longestStreak = streakDur;
      tile.streakStart = Date.now();
      tile.pauseDuration = 0;
      tile.pausedAt = null;
      tile.paused = false;
      if (!tile.system) state.stats.totalLapses = (state.stats.totalLapses || 0) + 1;
    } else {
      if (!tile.system) {
        state.stats.totalLogs = (state.stats.totalLogs || 0) + 1;
        if (tile.type === 'earn' && entry.amount) {
          state.stats.totalEarned = (state.stats.totalEarned || 0) + entry.amount;
        }
      }
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

  // ========== Attempts ==========
  function getCurrentAttempt(tile) {
    if (!tile.attempts || tile.attempts.length === 0) return null;
    return tile.attempts[tile.attempts.length - 1];
  }

  function closeCurrentAttempt(tile, reason) {
    const a = getCurrentAttempt(tile);
    if (!a || a.endTime != null) return;
    a.endTime = Date.now();
    a.durationMs = Math.max(0, a.endTime - a.startTime - (tile.pauseDuration || 0));
    a.closedBy = reason || 'manual';
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
    if (tile.type === 'quit') {
      closeCurrentAttempt(tile, 'manual-reset');
      tile.attempts.push({
        id: 'att-' + Date.now(),
        startTime: Date.now(), endTime: null, durationMs: null, closedBy: null, logsCountDuringAttempt: 0
      });
    }
    const streakDur = (Date.now() - tile.streakStart) - (tile.pauseDuration || 0);
    if (streakDur > (tile.longestStreak || 0)) tile.longestStreak = streakDur;
    tile.streakStart = Date.now();
    tile.pauseDuration = 0;
    tile.pausedAt = null;
    tile.paused = false;
    if (!tile.auditLog) tile.auditLog = [];
    tile.auditLog.push({
      time: Date.now(), field: '_streakReset', oldValue: null, newValue: null,
      note: 'Streak reset manually'
    });
    save();
  }

  // ========== Cost history ==========
  // costPerUnit may be a number, or an array of {value, effectiveFrom} entries.
  // Returns the rate effective at a given timestamp.
  function getCostPerUnitAt(tile, timestamp) {
    const c = tile.inputs ? tile.inputs.costPerUnit : null;
    if (c == null || c === '') {
      const bundleCost = tile.inputs && tile.inputs.costPerBundle;
      const bundleSize = tile.inputs && tile.inputs.bundleSize;
      if (bundleCost && bundleSize) return Number(bundleCost) / Number(bundleSize);
      return 0;
    }
    if (typeof c === 'number') return c;
    if (Array.isArray(c)) {
      const t = timestamp || Date.now();
      const sorted = c.slice().sort((a, b) => a.effectiveFrom - b.effectiveFrom);
      let pick = sorted[0];
      for (const seg of sorted) {
        if (seg.effectiveFrom <= t) pick = seg;
        else break;
      }
      return pick ? Number(pick.value) : 0;
    }
    return 0;
  }

  // ========== Export / Import ==========
  function exportData() { return JSON.stringify(state, null, 2); }
  function importData(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      if (!imported.dashboards || !imported.tiles) throw new Error('Invalid backup');
      state = imported;
      runMigrations();
      save();
      return true;
    } catch (err) {
      console.error('Import failed:', err);
      return false;
    }
  }
  function clearAll() { state = makeDefaultState(); save(); }

  return {
    load, save,
    getState, getVersion,
    getSettings, updateSettings, getStats, updateStats,
    getDashboards, getActiveDashboard, getActiveDashboardId, setActiveDashboardId,
    createDashboard, renameDashboard, deleteDashboard,
    getTile, getAllTiles, getTilesForDashboard,
    createTile, updateTile, updateTileWithAudit, deleteTile, duplicateTile,
    moveTile, reorderTiles,
    logTile, deleteLogEntry,
    pauseTile, resumeTile, resetStreak,
    getCurrentAttempt, closeCurrentAttempt,
    getCostPerUnitAt,
    exportData, importData, clearAll
  };
})();
