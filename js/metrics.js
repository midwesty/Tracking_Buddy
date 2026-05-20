/* ===================================================================
   Tracking Buddy — metrics.js (v0.002)
   Computes any metric for any tile from raw data + inputs.
   =================================================================== */

var TB = window.TB = window.TB || {};

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
    if (Math.abs(n) >= 10000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
    return '$' + n.toFixed(2);
  }

  function formatCount(n) {
    n = Math.floor(Number(n) || 0);
    return n.toLocaleString('en-US');
  }
  function formatDecimal(n) { return (Number(n) || 0).toFixed(1); }
  function formatPercent(n) { return Math.round((Number(n) || 0) * 100) + '%'; }

  // ========== Helpers ==========
  function getStreakDuration(tile) {
    if (!tile) return 0;
    const now = Date.now();
    const start = tile.streakStart || tile.created || now;
    let pauseDur = tile.pauseDuration || 0;
    if (tile.paused && tile.pausedAt) pauseDur += (now - tile.pausedAt);
    return Math.max(0, now - start - pauseDur);
  }

  // v0.004: returns the timestamp of the most recent NON-LAPSE log entry.
  // Falls back to tile.created if there are no logs.
  function getLastLogTime(tile) {
    if (!tile) return Date.now();
    const logs = tile.logs || [];
    for (let i = logs.length - 1; i >= 0; i--) {
      if (logs[i].type !== 'lapse') return logs[i].time;
    }
    return tile.created || Date.now();
  }

  // v0.004: "time since last activity" — meaningfully different from streak duration
  // for build/observe/neutral/earn tiles that get logged repeatedly.
  function getTimeSinceLastActivity(tile) {
    if (!tile) return 0;
    // For quit tiles, "time since last" = time since last slip (or start of current attempt)
    if (tile.type === 'quit') return getStreakDuration(tile);
    // For all other tiles: time since most recent log
    const last = getLastLogTime(tile);
    return Math.max(0, Date.now() - last);
  }

  function getEffectiveCostPerUnit(tile, atTime) {
    // Defer to storage's cost-history-aware helper
    if (TB.Storage && TB.Storage.getCostPerUnitAt) return TB.Storage.getCostPerUnitAt(tile, atTime);
    const i = tile.inputs || {};
    if (typeof i.costPerUnit === 'number' && i.costPerUnit > 0) return i.costPerUnit;
    if (i.costPerBundle && i.bundleSize) return Number(i.costPerBundle) / Number(i.bundleSize);
    return 0;
  }

  function startOfDay(t) {
    const d = new Date(t || Date.now()); d.setHours(0, 0, 0, 0); return d.getTime();
  }
  function startOfWeek(t) {
    const d = new Date(t || Date.now()); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); return d.getTime();
  }
  function startOfMonth(t) {
    const d = new Date(t || Date.now()); d.setHours(0, 0, 0, 0); d.setDate(1); return d.getTime();
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

  function sumAmounts(tile, sinceTime) {
    if (!tile || !tile.logs) return 0;
    let total = 0;
    for (const l of tile.logs) {
      if (l.type === 'lapse') continue;
      if (sinceTime && l.time < sinceTime) continue;
      if (l.amount != null) total += Number(l.amount);
    }
    return total;
  }

  // ========== Lifetime calculation helpers ==========
  // Walk all attempts (closed + current open) and apply a per-segment function.
  // Uses cost-history-aware rate lookup at the *midpoint* of each segment.
  function walkAttempts(tile, segmentFn) {
    if (!tile.attempts || tile.attempts.length === 0) {
      // No attempts? Treat the lifetime as just (now - created)
      const start = tile.created || Date.now();
      const dur = Math.max(0, Date.now() - start - (tile.pauseDuration || 0));
      segmentFn(start, Date.now(), dur);
      return;
    }
    tile.attempts.forEach(a => {
      const end = a.endTime != null ? a.endTime : Date.now();
      let dur;
      if (a.durationMs != null) dur = a.durationMs;
      else dur = Math.max(0, end - a.startTime - (tile.pauseDuration || 0));
      // Note: pauseDuration is whole-tile, not per-attempt, so this is approximate.
      // For the current open attempt we subtract it; closed attempts already have durationMs set.
      segmentFn(a.startTime, end, dur);
    });
  }

  function lifetimeDuration(tile) {
    let total = 0;
    walkAttempts(tile, (start, end, dur) => { total += dur; });
    return total;
  }

  function lifetimeMoneySaved(tile) {
    const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
    if (!baseline) return 0;
    let total = 0;
    walkAttempts(tile, (start, end, dur) => {
      // Use rate effective at the midpoint of this segment (handles cost history)
      const mid = start + (end - start) / 2;
      const cost = getEffectiveCostPerUnit(tile, mid);
      if (!cost) return;
      const days = dur / 86400000;
      total += days * baseline * cost;
    });
    return total;
  }

  function lifetimeUnitsAvoided(tile) {
    const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
    if (!baseline) return 0;
    let total = 0;
    walkAttempts(tile, (start, end, dur) => {
      const days = dur / 86400000;
      total += days * baseline;
    });
    return Math.floor(total);
  }

  function lifetimeTimeReclaimed(tile) {
    const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
    const perUnit = Number(tile.inputs && tile.inputs.timePerUnitMinutes) || 0;
    if (!baseline || !perUnit) return 0;
    let totalMin = 0;
    walkAttempts(tile, (start, end, dur) => {
      const days = dur / 86400000;
      totalMin += days * baseline * perUnit;
    });
    return totalMin * 60000;
  }

  function bestAttemptDuration(tile) {
    if (!tile.attempts || tile.attempts.length === 0) {
      const now = Date.now();
      return Math.max(0, now - (tile.created || now) - (tile.pauseDuration || 0));
    }
    let best = 0;
    tile.attempts.forEach(a => {
      const end = a.endTime != null ? a.endTime : Date.now();
      const dur = a.durationMs != null ? a.durationMs : Math.max(0, end - a.startTime - (tile.pauseDuration || 0));
      if (dur > best) best = dur;
    });
    return best;
  }

  function avgAttemptDuration(tile) {
    if (!tile.attempts || tile.attempts.length === 0) return 0;
    let sum = 0;
    tile.attempts.forEach(a => {
      const end = a.endTime != null ? a.endTime : Date.now();
      const dur = a.durationMs != null ? a.durationMs : Math.max(0, end - a.startTime - (tile.pauseDuration || 0));
      sum += dur;
    });
    return sum / tile.attempts.length;
  }

  function totalAttempts(tile) {
    return (tile.attempts || []).length;
  }

  // ========== Metric computers ==========
  const computers = {
    'time-since': function (tile) {
      // v0.004 fix: for non-quit tiles with logs, this is time since last log,
      // not time since tile creation.
      const dur = getTimeSinceLastActivity(tile);
      const isLive = !tile.paused;
      return { rawValue: dur, formatted: formatDuration(dur), isLive: isLive };
    },
    'current-streak': function (tile) {
      const dur = getStreakDuration(tile);
      return { rawValue: dur, formatted: formatDays(dur), isLive: !tile.paused };
    },
    'longest-streak': function (tile) {
      const recorded = tile.longestStreak || 0;
      const current = getStreakDuration(tile);
      const longest = Math.max(recorded, current, bestAttemptDuration(tile));
      return { rawValue: longest, formatted: formatDays(longest), isLive: false };
    },
    'money-saved': function (tile) {
      const cost = getEffectiveCostPerUnit(tile);
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      if (!cost || !baseline) return { rawValue: 0, formatted: formatCurrency(0), isLive: false };
      const dur = getStreakDuration(tile);
      const days = dur / 86400000;
      const saved = days * baseline * cost;
      return { rawValue: saved, formatted: formatCurrency(saved), isLive: !tile.paused };
    },
    'money-spent': function (tile) {
      const total = countLogs(tile, null, false);
      // For build/neutral tiles, use rate at log time for accuracy if cost-history present
      let spent = 0;
      (tile.logs || []).forEach(l => {
        if (l.type === 'lapse') return;
        const rate = getEffectiveCostPerUnit(tile, l.time);
        spent += rate * (l.count || 1);
      });
      return { rawValue: spent, formatted: formatCurrency(spent), isLive: false };
    },
    'units-avoided': function (tile) {
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      if (!baseline) return { rawValue: 0, formatted: formatCount(0), isLive: false };
      const dur = getStreakDuration(tile);
      const days = dur / 86400000;
      const avoided = Math.floor(days * baseline);
      return { rawValue: avoided, formatted: formatCount(avoided), isLive: !tile.paused };
    },
    'time-avoided': function (tile) {
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      const perUnitMin = Number(tile.inputs && tile.inputs.timePerUnitMinutes) || 0;
      if (!baseline || !perUnitMin) return { rawValue: 0, formatted: formatDuration(0), isLive: false };
      const dur = getStreakDuration(tile);
      const days = dur / 86400000;
      const minutesAvoided = days * baseline * perUnitMin;
      return { rawValue: minutesAvoided * 60000, formatted: formatDuration(minutesAvoided * 60000, { compact: true }), isLive: !tile.paused };
    },
    'total-count': function (tile) {
      const total = countLogs(tile, null, false);
      return { rawValue: total, formatted: formatCount(total), isLive: false };
    },
    'count-today': function (tile) {
      const total = countLogs(tile, startOfDay(), false);
      return { rawValue: total, formatted: formatCount(total), isLive: false };
    },
    'count-week': function (tile) {
      const total = countLogs(tile, startOfWeek(), false);
      return { rawValue: total, formatted: formatCount(total), isLive: false };
    },
    'count-month': function (tile) {
      const total = countLogs(tile, startOfMonth(), false);
      return { rawValue: total, formatted: formatCount(total), isLive: false };
    },
    'avg-per-day': function (tile) {
      const thirtyAgo = Date.now() - (30 * 86400000);
      const total = countLogs(tile, thirtyAgo, false);
      const tileCreated = tile.created || Date.now();
      const denom = Math.max(1, Math.min(30, (Date.now() - tileCreated) / 86400000));
      return { rawValue: total / denom, formatted: formatDecimal(total / denom), isLive: false };
    },
    'total-lapses': function (tile) {
      const total = (tile.logs || []).filter(l => l.type === 'lapse').length;
      return { rawValue: total, formatted: formatCount(total), isLive: false };
    },
    'goal-progress': function (tile) {
      const goal = Number(tile.inputs && tile.inputs.dailyGoal) || 0;
      if (!goal) return { rawValue: 0, formatted: '—', isLive: false };
      const today = countLogs(tile, startOfDay(), false);
      const pct = Math.min(1, today / goal);
      return { rawValue: pct, formatted: formatPercent(pct), isLive: false };
    },
    'projected-yearly-savings': function (tile) {
      const cost = getEffectiveCostPerUnit(tile);
      const baseline = Number(tile.inputs && tile.inputs.baselinePerDay) || 0;
      if (!cost || !baseline) return { rawValue: 0, formatted: formatCurrency(0), isLive: false };
      const yearly = cost * baseline * 365;
      return { rawValue: yearly, formatted: formatCurrency(yearly), isLive: false };
    },

    // ---- v0.002: lifetime metrics for quit tiles ----
    'lifetime-money-saved': function (tile) {
      const v = lifetimeMoneySaved(tile);
      return { rawValue: v, formatted: formatCurrency(v), isLive: !tile.paused };
    },
    'lifetime-units-avoided': function (tile) {
      const v = lifetimeUnitsAvoided(tile);
      return { rawValue: v, formatted: formatCount(v), isLive: !tile.paused };
    },
    'lifetime-time-reclaimed': function (tile) {
      const v = lifetimeTimeReclaimed(tile);
      return { rawValue: v, formatted: formatDuration(v, { compact: true }), isLive: !tile.paused };
    },
    'lifetime-days-clean': function (tile) {
      const v = lifetimeDuration(tile);
      return { rawValue: v, formatted: formatDays(v), isLive: !tile.paused };
    },
    'total-attempts': function (tile) {
      const v = totalAttempts(tile);
      return { rawValue: v, formatted: formatCount(v), isLive: false };
    },
    'avg-attempt-length': function (tile) {
      const v = avgAttemptDuration(tile);
      return { rawValue: v, formatted: formatDays(v), isLive: false };
    },
    'best-attempt': function (tile) {
      const v = bestAttemptDuration(tile);
      return { rawValue: v, formatted: formatDays(v), isLive: false };
    },

    // ---- v0.002: earn-tile metrics ----
    'total-earned': function (tile) {
      const v = sumAmounts(tile);
      return { rawValue: v, formatted: formatCurrency(v), isLive: false };
    },
    'earned-today': function (tile) {
      const v = sumAmounts(tile, startOfDay());
      return { rawValue: v, formatted: formatCurrency(v), isLive: false };
    },
    'earned-week': function (tile) {
      const v = sumAmounts(tile, startOfWeek());
      return { rawValue: v, formatted: formatCurrency(v), isLive: false };
    },
    'earned-month': function (tile) {
      const v = sumAmounts(tile, startOfMonth());
      return { rawValue: v, formatted: formatCurrency(v), isLive: false };
    },
    'avg-per-sale': function (tile) {
      const logs = (tile.logs || []).filter(l => l.type !== 'lapse' && l.amount != null);
      if (logs.length === 0) return { rawValue: 0, formatted: formatCurrency(0), isLive: false };
      const total = logs.reduce((s, l) => s + Number(l.amount), 0);
      return { rawValue: total / logs.length, formatted: formatCurrency(total / logs.length), isLive: false };
    },
    'sales-count': function (tile) {
      const v = (tile.logs || []).filter(l => l.type !== 'lapse').length;
      return { rawValue: v, formatted: formatCount(v), isLive: false };
    },
    'projected-yearly-earnings': function (tile) {
      const created = tile.created || Date.now();
      const daysActive = Math.max(1, (Date.now() - created) / 86400000);
      const total = sumAmounts(tile);
      const yearly = (total / daysActive) * 365;
      return { rawValue: yearly, formatted: formatCurrency(yearly), isLive: false };
    },
    'biggest-sale': function (tile) {
      const logs = (tile.logs || []).filter(l => l.type !== 'lapse' && l.amount != null);
      if (logs.length === 0) return { rawValue: 0, formatted: formatCurrency(0), isLive: false };
      const max = Math.max(...logs.map(l => Number(l.amount)));
      return { rawValue: max, formatted: formatCurrency(max), isLive: false };
    },

    // ---- v0.004: yearly earnings progress (powers the flag mascot for earn tiles) ----
    'yearly-goal-progress': function (tile) {
      const target = Number(tile.inputs && tile.inputs.yearlyTarget) || 0;
      if (!target) return { rawValue: 0, formatted: '—', isLive: false };
      const total = sumAmounts(tile);
      const pct = target > 0 ? total / target : 0;
      return { rawValue: pct, formatted: formatPercent(Math.min(pct, 9.99)), isLive: false };
    },

    // ---- v0.004: timer-related metrics ----
    'total-time-logged': function (tile) {
      const total = (tile.logs || []).reduce((s, l) => s + (l.durationMs || 0), 0);
      return { rawValue: total, formatted: formatDuration(total, { compact: true }), isLive: false };
    },
    'avg-session-length': function (tile) {
      const logs = (tile.logs || []).filter(l => l.durationMs);
      if (logs.length === 0) return { rawValue: 0, formatted: '—', isLive: false };
      const total = logs.reduce((s, l) => s + l.durationMs, 0);
      return { rawValue: total / logs.length, formatted: formatDuration(total / logs.length, { compact: true }), isLive: false };
    },
    'longest-session': function (tile) {
      const logs = (tile.logs || []).filter(l => l.durationMs);
      if (logs.length === 0) return { rawValue: 0, formatted: '—', isLive: false };
      const max = Math.max(...logs.map(l => l.durationMs));
      return { rawValue: max, formatted: formatDuration(max, { compact: true }), isLive: false };
    },
    'time-today': function (tile) {
      const total = (tile.logs || []).filter(l => l.time >= startOfDay() && l.durationMs).reduce((s, l) => s + l.durationMs, 0);
      return { rawValue: total, formatted: formatDuration(total, { compact: true }), isLive: false };
    },
    'time-week': function (tile) {
      const total = (tile.logs || []).filter(l => l.time >= startOfWeek() && l.durationMs).reduce((s, l) => s + l.durationMs, 0);
      return { rawValue: total, formatted: formatDuration(total, { compact: true }), isLive: false };
    },
    'sessions-count': function (tile) {
      const v = (tile.logs || []).filter(l => l.durationMs).length;
      return { rawValue: v, formatted: formatCount(v), isLive: false };
    }
  };

  // v0.004: pick a Tally expression based on the tile's current state.
  // Used by tile face renderer to show a permanent reactive mascot.
  // Priorities (top wins): paused > sleeping > slip-recently > goal-met > long-streak > fresh > default
  function getTallyExpression(tile) {
    if (!tile) return 'hero';
    if (tile.paused) return 'think';

    const now = Date.now();
    const logs = tile.logs || [];

    // Sleep: 30+ days since any activity (or creation if no logs)
    if (!tile.system) {
      const lastTime = logs.length > 0 ? logs[logs.length - 1].time : (tile.created || now);
      if ((now - lastTime) > 30 * 86400000) return 'sleep';
    }

    // Recent slip on a quit tile (within last 24h) — comfort
    if (tile.type === 'quit' && logs.length > 0) {
      const recentLapse = logs.slice().reverse().find(l => l.type === 'lapse');
      if (recentLapse && (now - recentLapse.time) < 86400000) return 'comfort';
    }

    // Any goal met? (daily, monthly, yearly, milestone counts)
    // Daily goal hit today (build tiles)
    if (tile.type === 'build' && tile.inputs && tile.inputs.dailyGoal) {
      const todayCount = logs.filter(l => l.time >= startOfDay() && l.type !== 'lapse')
        .reduce((s, l) => s + (l.count || 1), 0);
      if (todayCount >= tile.inputs.dailyGoal) return 'flag';
    }
    // Yearly earnings goal hit (earn tiles)
    if (tile.type === 'earn' && tile.inputs && tile.inputs.yearlyTarget) {
      const totalEarned = logs.filter(l => l.type !== 'lapse' && l.amount != null)
        .reduce((s, l) => s + Number(l.amount), 0);
      if (totalEarned >= tile.inputs.yearlyTarget) return 'flag';
    }

    // Long quit streak — encourage (>14 days clean)
    if (tile.type === 'quit') {
      const streakDur = getStreakDuration(tile);
      if (streakDur > 14 * 86400000) return 'encourage';
    }

    // Fresh tile with no logs yet — pointing
    if (logs.length === 0 && !tile.system) {
      const ageDays = (now - (tile.created || now)) / 86400000;
      if (ageDays < 1) return 'point';
    }

    // Default
    return 'hero';
  }

  function computeSystemMetric(metricId, state) {
    const stats = state.stats || {};
    const now = Date.now();
    const allTiles = Object.values(state.tiles || {}).filter(t => !t.system);

    switch (metricId) {
      case 'tb-time-since':
        return { rawValue: now - (state.meta.firstLaunch || now), formatted: formatDuration(now - (state.meta.firstLaunch || now)), isLive: true };
      case 'tb-days-using':
        return { rawValue: now - (state.meta.firstLaunch || now), formatted: formatDays(now - (state.meta.firstLaunch || now)), isLive: true };
      case 'tb-tiles-created':
        return { rawValue: stats.tilesCreated || 0, formatted: formatCount(stats.tilesCreated || 0), isLive: false };
      case 'tb-active-tiles':
        return { rawValue: allTiles.length, formatted: formatCount(allTiles.length), isLive: false };
      case 'tb-total-logs':
        return { rawValue: stats.totalLogs || 0, formatted: formatCount(stats.totalLogs || 0), isLive: false };
      case 'tb-total-lapses':
        return { rawValue: stats.totalLapses || 0, formatted: formatCount(stats.totalLapses || 0), isLive: false };
      case 'tb-longest-tile': {
        let longest = null, longestDur = 0;
        for (const t of allTiles) {
          const dur = now - (t.created || now);
          if (dur > longestDur) { longest = t; longestDur = dur; }
        }
        if (!longest) return { rawValue: 0, formatted: '—', isLive: false };
        return { rawValue: longestDur, formatted: longest.name + ' (' + formatDays(longestDur) + ')', isLive: false };
      }
      case 'tb-money-saved': {
        let total = 0;
        for (const t of allTiles) {
          if (t.type === 'quit') total += lifetimeMoneySaved(t);
        }
        return { rawValue: total, formatted: formatCurrency(total), isLive: true };
      }
      case 'tb-total-earned': {
        let total = 0;
        for (const t of allTiles) {
          if (t.type === 'earn') total += sumAmounts(t);
        }
        return { rawValue: total, formatted: formatCurrency(total), isLive: false };
      }
      default:
        return { rawValue: 0, formatted: '—', isLive: false };
    }
  }

  function compute(metricId, tile, state) {
    if (metricId.startsWith('tb-')) return computeSystemMetric(metricId, state || TB.Storage.getState());
    const fn = computers[metricId];
    if (!fn) return { rawValue: 0, formatted: '—', isLive: false };
    try { return fn(tile); }
    catch (e) { console.error('Metric compute failed for', metricId, e); return { rawValue: 0, formatted: '—', isLive: false }; }
  }

  return {
    compute,
    formatDuration, formatDays, formatCurrency, formatCount, formatDecimal, formatPercent,
    getStreakDuration, getEffectiveCostPerUnit,
    getLastLogTime, getTimeSinceLastActivity, getTallyExpression,
    startOfDay, startOfWeek, startOfMonth, countLogs, sumAmounts,
    lifetimeDuration, lifetimeMoneySaved, lifetimeUnitsAvoided, lifetimeTimeReclaimed,
    bestAttemptDuration, avgAttemptDuration, totalAttempts
  };
})();
