/* ===================================================================
   Tracking Buddy — metrics.js
   Computes any metric for any tile from raw data + inputs.
   =================================================================== */

const TB = window.TB = window.TB || {};

TB.Metrics = (function () {
  // ========== Formatters ==========
  function formatDuration(ms, opts) {
    opts = opts || {};
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    if (opts.compact) {
      if (days >= 1) return days + 'd ' + hours + 'h';
      if (hours >= 1) return hours + 'h ' + minutes + 'm';
      if (minutes >= 1) return minutes + 'm ' + seconds + 's';
      return seconds + 's';
    }

    if (days >= 1) {
      return days + 'd ' + String(hours).padStart(2, '0') + ':' +
             String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }
    return String(hours).padStart(2, '0') + ':' +
           String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function formatDays(ms) {
    if (ms < 0) ms = 0;
    const days = Math.floor(ms / 86400000);
    if (days === 0) {
      const hours = Math.floor(ms / 3600000);
      if (hours === 0) {
        const mins = Math.floor(ms / 60000);
        return mins + 'm';
      }
      return hours + 'h';
    }
    if (days === 1) return '1 day';
    return days + ' days';
  }

  function formatCurrency(amount) {
    const n = Number(amount) || 0;
    if (Math.abs(n) >= 10000) {
      return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    }
    return '$' + n.toFixed(2);
  }

  function formatCount(n) {
    n = Math.floor(Number(n) || 0);
    return n.toLocaleString('en-US');
  }

  function formatDecimal(n) {
    return (Number(n) || 0).toFixed(1);
  }

  function formatPercent(n) {
    return Math.round((Number(n) || 0) * 100) + '%';
  }

  // ========== Helpers ==========
  function getStreakDuration(tile) {
    if (!tile) return 0;
    const now = Date.now();
    const start = tile.streakStart || tile.created || now;
    let pauseDur = tile.pauseDuration || 0;
    if (tile.paused && tile.pausedAt) {
      pauseDur += (now - tile.pausedAt);
    }
    return Math.max(0, now - start - pauseDur);
  }

  function getEffectiveCostPerUnit(tile) {
    const i = tile.inputs || {};
    if (typeof i.costPerUnit === 'number' && i.costPerUnit > 0) return i.costPerUnit;
    if (i.costPerBundle && i.bundleSize) {
      return Number(i.costPerBundle) / Number(i.bundleSize);
    }
    return 0;
  }

  function startOfDay(t) {
    const d = new Date(t || Date.now());
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function startOfWeek(t) {
    const d = new Date(t || Date.now());
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d.getTime();
  }

  function startOfMonth(t) {
    const d = new Date(t || Date.now());
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    return d.getTime();
  }

  function countLogs(tile, sinceTime, includeLapses) {
    if (!tile || !tile.logs) return 0;
    let total = 0;
    for (const l of tile.logs) {
      if (sinceTime && l.time < sinceTime) continue;
      if (!includeLapses && l.type === 'lapse') continue;
      total += (l.count || 1);
    }
    return total;
  }

  // ========== Metric computers ==========
  // Each returns a { rawValue, formatted, isLive } object
  const computers = {
    'time-since': function (tile) {
      const dur = getStreakDuration(tile);
      return {
        rawValue: dur,
        formatted: formatDuration(dur),
        isLive: !tile.paused
      };
    },

    'current-streak': function (tile) {
      const dur = getStreakDuration(tile);
      return {
        rawValue: dur,
        formatted: formatDays(dur),
        isLive: !tile.paused
      };
    },

    'longest-streak': function (tile) {
      const longestRecorded = tile.longestStreak || 0;
      const current = getStreakDuration(tile);
      const longest = Math.max(longestRecorded, current);
      return {
        rawValue: longest,
        formatted: formatDays(longest),
        isLive: false
      };
    },

    'money-saved': function (tile) {
      const cost = getEffectiveCostPerUnit(tile);
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      if (!cost || !baseline) return { rawValue: 0, formatted: formatCurrency(0), isLive: false };
      const dur = getStreakDuration(tile);
      const days = dur / 86400000;
      const saved = days * baseline * cost;
      return {
        rawValue: saved,
        formatted: formatCurrency(saved),
        isLive: !tile.paused
      };
    },

    'money-spent': function (tile) {
      const cost = getEffectiveCostPerUnit(tile);
      const total = countLogs(tile, null, false);
      const spent = cost * total;
      return {
        rawValue: spent,
        formatted: formatCurrency(spent),
        isLive: false
      };
    },

    'units-avoided': function (tile) {
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      if (!baseline) return { rawValue: 0, formatted: formatCount(0), isLive: false };
      const dur = getStreakDuration(tile);
      const days = dur / 86400000;
      const avoided = Math.floor(days * baseline);
      return {
        rawValue: avoided,
        formatted: formatCount(avoided),
        isLive: !tile.paused
      };
    },

    'time-avoided': function (tile) {
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      const perUnitMin = Number(tile.inputs && tile.inputs.timePerUnitMinutes) || 0;
      if (!baseline || !perUnitMin) return { rawValue: 0, formatted: formatDuration(0), isLive: false };
      const dur = getStreakDuration(tile);
      const days = dur / 86400000;
      const minutesAvoided = days * baseline * perUnitMin;
      return {
        rawValue: minutesAvoided * 60000,
        formatted: formatDuration(minutesAvoided * 60000, { compact: true }),
        isLive: !tile.paused
      };
    },

    'total-count': function (tile) {
      const total = countLogs(tile, null, false);
      return {
        rawValue: total,
        formatted: formatCount(total),
        isLive: false
      };
    },

    'count-today': function (tile) {
      const total = countLogs(tile, startOfDay(), false);
      return {
        rawValue: total,
        formatted: formatCount(total),
        isLive: false
      };
    },

    'count-week': function (tile) {
      const total = countLogs(tile, startOfWeek(), false);
      return {
        rawValue: total,
        formatted: formatCount(total),
        isLive: false
      };
    },

    'count-month': function (tile) {
      const total = countLogs(tile, startOfMonth(), false);
      return {
        rawValue: total,
        formatted: formatCount(total),
        isLive: false
      };
    },

    'avg-per-day': function (tile) {
      // Rolling 30 days
      const thirtyAgo = Date.now() - (30 * 86400000);
      const total = countLogs(tile, thirtyAgo, false);
      const tileCreated = tile.created || Date.now();
      const denominator = Math.max(1, Math.min(30, (Date.now() - tileCreated) / 86400000));
      const avg = total / denominator;
      return {
        rawValue: avg,
        formatted: formatDecimal(avg),
        isLive: false
      };
    },

    'total-lapses': function (tile) {
      const total = (tile.logs || []).filter(l => l.type === 'lapse').length;
      return {
        rawValue: total,
        formatted: formatCount(total),
        isLive: false
      };
    },

    'goal-progress': function (tile) {
      const goal = Number(tile.inputs && tile.inputs.dailyGoal) || 0;
      if (!goal) return { rawValue: 0, formatted: '—', isLive: false };
      const today = countLogs(tile, startOfDay(), false);
      const pct = Math.min(1, today / goal);
      return {
        rawValue: pct,
        formatted: formatPercent(pct),
        isLive: false
      };
    },

    'projected-yearly-savings': function (tile) {
      const cost = getEffectiveCostPerUnit(tile);
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      if (!cost || !baseline) return { rawValue: 0, formatted: formatCurrency(0), isLive: false };
      const yearly = cost * baseline * 365;
      return {
        rawValue: yearly,
        formatted: formatCurrency(yearly),
        isLive: false
      };
    }
  };

  // Special computers for the Tally meta tile
  function computeSystemMetric(metricId, state) {
    const stats = state.stats || {};
    const now = Date.now();
    const allTiles = Object.values(state.tiles || {}).filter(t => !t.system);

    switch (metricId) {
      case 'tb-time-since':
        return {
          rawValue: now - (state.meta.firstLaunch || now),
          formatted: formatDuration(now - (state.meta.firstLaunch || now)),
          isLive: true
        };
      case 'tb-days-using':
        return {
          rawValue: now - (state.meta.firstLaunch || now),
          formatted: formatDays(now - (state.meta.firstLaunch || now)),
          isLive: true
        };
      case 'tb-tiles-created':
        return { rawValue: stats.tilesCreated || 0, formatted: formatCount(stats.tilesCreated || 0), isLive: false };
      case 'tb-active-tiles':
        return { rawValue: allTiles.length, formatted: formatCount(allTiles.length), isLive: false };
      case 'tb-total-logs':
        return { rawValue: stats.totalLogs || 0, formatted: formatCount(stats.totalLogs || 0), isLive: false };
      case 'tb-total-lapses':
        return { rawValue: stats.totalLapses || 0, formatted: formatCount(stats.totalLapses || 0), isLive: false };
      case 'tb-longest-tile': {
        // Find the longest-running active tile
        let longest = null;
        let longestDur = 0;
        for (const t of allTiles) {
          const dur = (now - (t.created || now));
          if (dur > longestDur) { longest = t; longestDur = dur; }
        }
        if (!longest) return { rawValue: 0, formatted: '—', isLive: false };
        return {
          rawValue: longestDur,
          formatted: longest.name + ' (' + formatDays(longestDur) + ')',
          isLive: false
        };
      }
      case 'tb-money-saved': {
        // Sum money-saved across all quit tiles
        let total = 0;
        for (const t of allTiles) {
          if (t.type === 'quit') {
            const result = computers['money-saved'] ? computers['money-saved'](t) : null;
            if (result) total += result.rawValue;
          }
        }
        return { rawValue: total, formatted: formatCurrency(total), isLive: true };
      }
      default:
        return { rawValue: 0, formatted: '—', isLive: false };
    }
  }

  function compute(metricId, tile, state) {
    // System tile uses special metric IDs prefixed with tb-
    if (metricId.startsWith('tb-')) {
      return computeSystemMetric(metricId, state || TB.Storage.getState());
    }
    const fn = computers[metricId];
    if (!fn) return { rawValue: 0, formatted: '—', isLive: false };
    try {
      return fn(tile);
    } catch (e) {
      console.error('Metric compute failed for', metricId, e);
      return { rawValue: 0, formatted: '—', isLive: false };
    }
  }

  return {
    compute,
    formatDuration, formatDays, formatCurrency, formatCount, formatDecimal, formatPercent,
    getStreakDuration, getEffectiveCostPerUnit,
    startOfDay, startOfWeek, startOfMonth, countLogs
  };
})();
