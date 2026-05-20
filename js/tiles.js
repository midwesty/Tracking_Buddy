/* ===================================================================
   Tracking Buddy — tiles.js (v0.002)
   Tile rendering, create/edit modal, detail view, quick log handling.
   =================================================================== */

var TB = window.TB = window.TB || {};

TB.Tiles = (function () {

  // Shape → max face metrics
  function shapeCapacity(shape) {
    switch (shape) {
      case 'wide': return 6;
      case 'tall': return 6;
      case 'large': return 8;
      default: return 4;
    }
  }

  // ===== Renders a single tile element =====
  function renderTileElement(tile, index) {
    const el = document.createElement('div');
    el.className = 'tile shape-' + (tile.shape || 'square');
    if (tile.paused) el.classList.add('paused');
    if (tile.system) el.classList.add('system');
    if (tile.type === 'earn') el.classList.add('type-earn');
    el.dataset.tileId = tile.id;
    el.style.setProperty('--tile-i', index);
    if (tile.color) el.style.borderColor = tile.color;

    const iconHtml = TB.UI.iconHTML(tile.iconId, tile.customIcon);
    const typeBadge = tile.type && tile.type !== 'neutral'
      ? '<span class="tile-type-badge">' + tile.type + '</span>'
      : '';
    const iconStyle = tile.color ? 'background:' + hexToSoft(tile.color) + ';' : '';

    let html = '' +
      typeBadge +
      '<div class="tile-edit-handle" data-action="delete-tile">×</div>' +
      '<div class="tile-header">' +
      '  <div class="tile-icon" style="' + iconStyle + '">' + iconHtml + '</div>' +
      '  <div class="tile-name">' + TB.UI.escapeHtml(tile.name) + '</div>' +
      '</div>';

    const cap = shapeCapacity(tile.shape || 'square');
    const metricsToShow = (tile.faceMetrics || []).slice(0, cap);
    if (metricsToShow.length > 0) {
      // Two-column layout for wide/large
      const useTwoCol = (tile.shape === 'wide' || tile.shape === 'large') && metricsToShow.length > 3;
      html += '<div class="tile-body' + (useTwoCol ? ' tile-body-2col' : '') + '">';
      for (const metricId of metricsToShow) {
        const result = TB.Metrics.compute(metricId, tile, TB.Storage.getState());
        const label = getMetricLabel(metricId);
        const liveClass = result.isLive ? ' live' : '';
        html += '<div class="tile-metric">' +
          '  <div class="tile-metric-value' + liveClass + '" data-metric="' + metricId + '">' + result.formatted + '</div>' +
          '  <div class="tile-metric-label">' + label + '</div>' +
          '</div>';
      }
      html += '</div>';
    }

    if (!tile.system) {
      const isQuit = tile.type === 'quit';
      const isEarn = tile.type === 'earn';
      const hasTimer = tile.hasTimer === true;
      const activeTimer = TB.Storage.getActiveTimer();
      const timerRunningHere = activeTimer && activeTimer.tileId === tile.id;

      // v0.004: Tally always appears above the action button with state-based expression
      const tallyVariant = TB.Metrics.getTallyExpression(tile);
      html += '<div class="tile-tally" data-variant="' + tallyVariant + '" title="Tally: ' + tallyVariant + '">' +
        TB.UI.mascotHTML(tallyVariant) +
        '</div>';

      // Action button: timer / quit-slip / earn-amount / generic +
      if (hasTimer) {
        if (timerRunningHere) {
          // Live running display — clicking stops the timer
          const elapsedMs = Date.now() - activeTimer.startedAt;
          const elapsedStr = TB.Metrics.formatDuration(elapsedMs);
          html += '<button class="tile-quick-log timer-mode running" data-action="quick-log" aria-label="Stop timer" data-timer-running="1">' +
            '<span class="timer-icon">⏸</span><span class="timer-elapsed" data-elapsed-start="' + activeTimer.startedAt + '">' + elapsedStr + '</span>' +
            '</button>';
        } else {
          html += '<button class="tile-quick-log timer-mode" data-action="quick-log" aria-label="Start timer">▶</button>';
        }
      } else {
        const label = isQuit ? '!' : (isEarn ? '$' : '+');
        const cls = 'tile-quick-log' + (isQuit ? ' quit-mode' : '') + (isEarn ? ' earn-mode' : '');
        const title = isQuit ? 'Log a slip' : (isEarn ? 'Log a sale' : 'Log one');
        html += '<button class="' + cls + '" data-action="quick-log" aria-label="' + title + '">' + label + '</button>';
      }
    }

    el.innerHTML = html;
    return el;
  }

  function getMetricLabel(metricId) {
    const all = TB.Data && TB.Data.metrics ? TB.Data.metrics : [];
    const m = all.find(x => x.id === metricId);
    if (m) return m.label;
    const sysLabels = {
      'tb-time-since': 'Using app',
      'tb-days-using': 'Days using app',
      'tb-tiles-created': 'Tiles ever made',
      'tb-active-tiles': 'Active tiles',
      'tb-total-logs': 'Total logs',
      'tb-total-lapses': 'Total slips',
      'tb-longest-tile': 'Longest tracker',
      'tb-money-saved': 'Total saved',
      'tb-total-earned': 'Total earned'
    };
    return sysLabels[metricId] || metricId;
  }

  function hexToSoft(hex) {
    if (!hex) return '';
    try {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',0.18)';
    } catch (e) { return ''; }
  }

  // ===== Quick log flow =====
  function handleQuickLog(tileId) {
    const tile = TB.Storage.getTile(tileId);
    if (!tile) return;

    // ---- Quit tile: confirm slip ----
    if (tile.type === 'quit') {
      const streakDur = TB.Metrics.getStreakDuration(tile);
      const streakLabel = TB.Metrics.formatDays(streakDur);
      const isLongStreak = streakDur > 7 * 86400000;
      TB.UI.confirm(
        '<div class="slip-comfort-mascot">' + TB.UI.mascotHTML('encourage') + '</div>' +
        '<strong>Your current streak is ' + streakLabel + '.</strong><br><br>' +
        'Logging a slip will start a new attempt. Your previous streak is saved to history, ' +
        'and lifetime stats keep growing.<br><br>' +
        'You\'ve got this — slips are part of the journey.',
        { title: 'Log a slip?', confirmText: 'Yes, log it', danger: true }
      ).then(ok => {
        if (ok) {
          TB.Storage.logTile(tileId, 'lapse');
          if (isLongStreak) showComfortMascot();
          TB.UI.toast('New attempt started. You\'re back at day 1 — keep going.', 'warning', 3500);
          TB.Dashboard.refresh();
        }
      });
      return;
    }

    // ---- Timer-enabled tile ----
    if (tile.hasTimer === true) {
      const active = TB.Storage.getActiveTimer();
      if (active && active.tileId === tileId) {
        // Stop & log
        const elapsedMs = Date.now() - active.startedAt;
        TB.Storage.stopTimer();
        openLogDetailsPrompt(tile, { durationMs: elapsedMs }, () => {
          // refresh handled inside
        });
        return;
      }
      if (active && active.tileId !== tileId) {
        // Another timer is running — ask to stop it first
        const otherTile = TB.Storage.getTile(active.tileId);
        const otherName = otherTile ? otherTile.name : 'another tracker';
        TB.UI.confirm(
          'A timer is already running on <strong>' + TB.UI.escapeHtml(otherName) + '</strong>. ' +
          'Stop it and log it, then start this one?',
          { title: 'Switch timers?', confirmText: 'Stop & switch' }
        ).then(ok => {
          if (!ok) return;
          if (otherTile) {
            const otherElapsed = Date.now() - active.startedAt;
            TB.Storage.stopTimer();
            openLogDetailsPrompt(otherTile, { durationMs: otherElapsed }, () => {
              // After logging the other one, start this one
              TB.Storage.startTimer(tileId);
              TB.UI.toast('Timer started for ' + tile.name, 'success', 1500);
              TB.Dashboard.refresh();
            });
          } else {
            TB.Storage.startTimer(tileId);
            TB.UI.toast('Timer started for ' + tile.name, 'success', 1500);
            TB.Dashboard.refresh();
          }
        });
        return;
      }
      // No active timer — start one
      TB.Storage.startTimer(tileId);
      if (navigator.vibrate) navigator.vibrate(15);
      TB.UI.toast('Timer started — tap ⏸ to stop', 'success', 1800);
      TB.Dashboard.refresh();
      return;
    }

    // ---- Earn tile ----
    if (tile.type === 'earn') {
      const schema = (tile.logSchema || []);
      if (schema.length === 0) {
        // Simple amount prompt — preserve original v0.002 behavior
        TB.UI.prompt('Sale amount ($)', '', { title: 'Log a sale', confirmText: 'Log' }).then(val => {
          if (!val) return;
          const amount = parseFloat(val);
          if (isNaN(amount) || amount < 0) { TB.UI.toast('Enter a valid amount', 'warning'); return; }
          TB.Storage.logTile(tileId, 'log', { amount: amount });
          showFloatingFeedback(tileId, '+$' + amount.toFixed(2));
          refreshTileMetrics(tileId);
          celebrateIfMilestone(tileId);
          TB.Dashboard.refresh();
        });
      } else {
        // Multi-field prompt with amount + custom schema
        openLogDetailsPrompt(tile, { askAmount: true }, () => {});
      }
      return;
    }

    // ---- Default: build / observe / neutral ----
    const schema = (tile.logSchema || []);
    if (schema.length === 0) {
      // Simple +1
      TB.Storage.logTile(tileId, 'log');
      showFloatingFeedback(tileId, '+1');
      refreshTileMetrics(tileId);
      celebrateIfMilestone(tileId);
    } else {
      openLogDetailsPrompt(tile, {}, () => {});
    }
  }

  // v0.004: prompt the user for log details based on tile.logSchema (+ duration/amount if relevant)
  // options: { durationMs, askAmount }
  // onComplete: callback after successful log
  function openLogDetailsPrompt(tile, options, onComplete) {
    options = options || {};
    const schema = tile.logSchema || [];
    const durationMs = options.durationMs;
    const askAmount = options.askAmount === true;

    let html = '<div class="modal-header"><h2>Log details</h2><button class="modal-close" data-close-modal>×</button></div>' +
      '<div class="modal-body">';

    if (durationMs != null) {
      html += '<div class="field"><label>Duration</label>' +
        '<div class="log-duration-display">' + TB.Metrics.formatDuration(durationMs) + '</div></div>';
    }
    if (askAmount) {
      html += '<div class="field"><label>Amount ($)</label>' +
        '<input type="number" step="0.01" id="tb-log-amount" placeholder="e.g. 45.00"></div>';
    }
    schema.forEach((field, i) => {
      const inputType = field.type === 'number' ? 'number' : 'text';
      const step = field.type === 'number' ? 'step="any"' : '';
      const ph = field.label || field.key;
      html += '<div class="field"><label>' + TB.UI.escapeHtml(field.label || field.key) +
        (field.required ? ' <span style="color:var(--danger,#E5484D);">*</span>' : '') +
        '</label>' +
        '<input type="' + inputType + '" ' + step + ' data-schema-key="' + TB.UI.escapeHtml(field.key) + '" placeholder="' + TB.UI.escapeHtml(ph) + '"></div>';
    });
    html += '<div class="field"><label>Note (optional)</label>' +
      '<input type="text" id="tb-log-note" placeholder="Anything to remember?"></div>';
    html += '</div>' +
      '<div class="modal-footer">' +
      '  <button class="btn btn-secondary" data-close-modal>Cancel</button>' +
      '  <button class="btn btn-primary" id="tb-log-save">Log it</button>' +
      '</div>';

    const modal = TB.UI.openModal(html);
    const saveBtn = modal.querySelector('#tb-log-save');
    saveBtn.addEventListener('click', () => {
      const logOptions = {};
      if (durationMs != null) logOptions.durationMs = durationMs;
      if (askAmount) {
        const a = modal.querySelector('#tb-log-amount').value;
        if (a !== '') {
          const num = parseFloat(a);
          if (!isNaN(num) && num >= 0) logOptions.amount = num;
          else { TB.UI.toast('Enter a valid amount', 'warning'); return; }
        } else {
          TB.UI.toast('Amount required', 'warning'); return;
        }
      }
      const fields = {};
      let missingRequired = null;
      schema.forEach(f => {
        const input = modal.querySelector('[data-schema-key="' + f.key + '"]');
        if (!input) return;
        const v = input.value;
        if (f.required && (v == null || v === '')) { missingRequired = f.label || f.key; return; }
        if (v === '') return;
        if (f.type === 'number') fields[f.key] = parseFloat(v);
        else fields[f.key] = v;
      });
      if (missingRequired) { TB.UI.toast('Please fill in: ' + missingRequired, 'warning'); return; }
      const noteInput = modal.querySelector('#tb-log-note');
      if (noteInput && noteInput.value) logOptions.note = noteInput.value;
      logOptions.fields = fields;

      TB.Storage.logTile(tile.id, 'log', logOptions);
      let feedbackText = '+1';
      if (durationMs != null) feedbackText = TB.Metrics.formatDuration(durationMs, { compact: true });
      else if (logOptions.amount != null) feedbackText = '+$' + logOptions.amount.toFixed(2);
      showFloatingFeedback(tile.id, feedbackText);
      refreshTileMetrics(tile.id);
      celebrateIfMilestone(tile.id);
      TB.UI.toast('Logged', 'success', 1200);
      TB.UI.closeModal();
      TB.Dashboard.refresh();
      if (onComplete) onComplete();
    });
  }

  function celebrateIfMilestone(tileId) {
    const tile = TB.Storage.getTile(tileId);
    if (!tile) return;
    const newTotal = TB.Metrics.compute('total-count', tile).rawValue;
    if (newTotal === 1 || newTotal === 10 || newTotal === 50 || newTotal === 100 ||
        newTotal === 500 || newTotal === 1000 || (newTotal > 100 && newTotal % 500 === 0)) {
      TB.UI.confetti({ count: 30 });
      showCelebrateMascot();
      TB.UI.toast('🎉 ' + newTotal + ' logged — nice work!', 'success', 2400);
    }
    if (tile.type === 'build' && tile.inputs && tile.inputs.dailyGoal) {
      const today = TB.Metrics.compute('count-today', tile).rawValue;
      if (today === tile.inputs.dailyGoal) {
        TB.UI.confetti({ count: 40 });
        showCelebrateMascot();
        TB.UI.toast('🌟 Daily goal hit! Tally is proud.', 'success', 2800);
      }
    }
    // v0.004: yearly earnings goal hit (earn tiles)
    if (tile.type === 'earn' && tile.inputs && tile.inputs.yearlyTarget) {
      const total = TB.Metrics.compute('total-earned', tile).rawValue;
      const target = Number(tile.inputs.yearlyTarget);
      // Trigger when crossing the target (avoid celebrating every log after)
      const prevTotal = total - (tile.logs && tile.logs.length > 0 ? Number(tile.logs[tile.logs.length-1].amount || 0) : 0);
      if (prevTotal < target && total >= target) {
        TB.UI.confetti({ count: 60 });
        showCelebrateMascot();
        TB.UI.toast('🏆 Yearly goal hit! That\'s incredible.', 'success', 3500);
      }
    }
  }

  // v0.003: pop the celebrate mascot briefly on big wins
  function showCelebrateMascot() {
    // Don't stack multiple if one is already on screen
    if (document.querySelector('.celebrate-toast-mascot')) return;
    const el = document.createElement('div');
    el.className = 'celebrate-toast-mascot';
    el.innerHTML = TB.UI.mascotHTML('celebrate');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  // v0.003: comfort mascot after a long-streak slip
  function showComfortMascot() {
    if (document.querySelector('.celebrate-toast-mascot')) return;
    const el = document.createElement('div');
    el.className = 'celebrate-toast-mascot';
    el.innerHTML = TB.UI.mascotHTML('comfort');
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function showFloatingFeedback(tileId, text) {
    const tileEl = document.querySelector('[data-tile-id="' + tileId + '"]');
    if (!tileEl) return;
    const fb = document.createElement('div');
    fb.className = 'tile-floating-feedback';
    fb.textContent = text || '+1';
    tileEl.appendChild(fb);
    setTimeout(() => fb.remove(), 1200);
  }

  function refreshTileMetrics(tileId) {
    const tile = TB.Storage.getTile(tileId);
    if (!tile) return;
    const tileEl = document.querySelector('[data-tile-id="' + tileId + '"]');
    if (!tileEl) return;
    tileEl.querySelectorAll('.tile-metric-value').forEach(vEl => {
      const metricId = vEl.dataset.metric;
      if (metricId) {
        const result = TB.Metrics.compute(metricId, tile, TB.Storage.getState());
        vEl.textContent = result.formatted;
      }
    });
  }

  // ===== Create / Edit modal =====
  function openCreateModal() { openTileForm(null); }
  function openEditModal(tileId) {
    const tile = TB.Storage.getTile(tileId);
    if (!tile) return;
    openTileForm(tile);
  }

  function openTileForm(existing) {
    const isNew = !existing;
    let working = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
        name: '', type: 'neutral', iconId: 'star', customIcon: null, color: null,
        shape: 'square', unitName: 'thing', unitNamePlural: 'things',
        inputs: {}, faceMetrics: [],
        hasTimer: false, logSchema: []
      };
    // v0.004 safety: ensure fields exist when editing pre-v0.004 tiles
    if (working.hasTimer === undefined) working.hasTimer = false;
    if (!Array.isArray(working.logSchema)) working.logSchema = [];

    // Snapshot original cost-per-unit for retroactive diff
    const originalCostPerUnit = existing ? extractCurrentCost(existing) : null;

    const stepHTML = renderFormStep(working, isNew);
    const modal = TB.UI.openModal(
      '<div class="modal-header">' +
      '  <h2>' + (isNew ? 'New tracker' : 'Edit tracker') + '</h2>' +
      '  <button class="modal-close" data-close-modal>×</button>' +
      '</div>' +
      '<div class="modal-body" id="tb-form-body">' + stepHTML + '</div>' +
      '<div class="modal-footer">' +
      '  <button class="btn btn-secondary" data-close-modal>Cancel</button>' +
      '  <button class="btn btn-primary" id="tb-form-save">' + (isNew ? 'Create' : 'Save') + '</button>' +
      '</div>'
    );

    wireFormHandlers(modal, working, isNew);

    modal.querySelector('#tb-form-save').addEventListener('click', () => {
      if (!working.name || !working.name.trim()) {
        TB.UI.toast('Give your tracker a name', 'warning');
        return;
      }
      if (working.faceMetrics.length === 0) {
        working.faceMetrics = working.type === 'earn'
          ? ['total-earned', 'earned-today']
          : ['total-count'];
      }

      if (isNew) {
        TB.Storage.createTile(working);
        TB.UI.toast('Tracker created — Tally approves!', 'success');
        TB.UI.closeModal();
        TB.Dashboard.refresh();
      } else {
        // Detect changes and build audit entries
        const audit = diffForAudit(existing, working);
        // Cost change handling
        const newCost = extractCurrentCost(working);
        if (originalCostPerUnit != null && newCost != null && originalCostPerUnit !== newCost) {
          // Ask user how to apply
          handleCostChangeDialog(existing, working, originalCostPerUnit, newCost, audit);
        } else {
          TB.Storage.updateTileWithAudit(existing.id, working, audit);
          TB.UI.toast('Saved', 'success');
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        }
      }
    });
  }

  // Extract a single representative "current" cost for diffing.
  // If costPerUnit is an array (history), returns the latest segment value.
  function extractCurrentCost(tile) {
    const c = tile.inputs && tile.inputs.costPerUnit;
    if (c == null || c === '') {
      const bc = tile.inputs && tile.inputs.costPerBundle;
      const bs = tile.inputs && tile.inputs.bundleSize;
      if (bc && bs) return Number(bc) / Number(bs);
      return null;
    }
    if (typeof c === 'number') return c;
    if (Array.isArray(c) && c.length) {
      const sorted = c.slice().sort((a, b) => a.effectiveFrom - b.effectiveFrom);
      return Number(sorted[sorted.length - 1].value);
    }
    return null;
  }

  function diffForAudit(oldTile, newTile) {
    const entries = [];
    const interesting = ['name', 'type', 'iconId', 'shape', 'unitName', 'unitNamePlural', 'color', 'hasTimer'];
    interesting.forEach(key => {
      if (oldTile[key] !== newTile[key]) {
        entries.push({ field: key, oldValue: oldTile[key], newValue: newTile[key], note: 'Changed ' + key });
      }
    });
    // Inputs (excluding cost which gets special handling)
    const oldInputs = oldTile.inputs || {};
    const newInputs = newTile.inputs || {};
    Object.keys({ ...oldInputs, ...newInputs }).forEach(key => {
      if (key === 'costPerUnit') return; // handled separately
      if (JSON.stringify(oldInputs[key]) !== JSON.stringify(newInputs[key])) {
        entries.push({ field: 'inputs.' + key, oldValue: oldInputs[key], newValue: newInputs[key], note: 'Changed ' + key });
      }
    });
    // Metric face changes
    if (JSON.stringify(oldTile.faceMetrics) !== JSON.stringify(newTile.faceMetrics)) {
      entries.push({ field: 'faceMetrics', oldValue: oldTile.faceMetrics, newValue: newTile.faceMetrics, note: 'Changed displayed metrics' });
    }
    // v0.004: log schema changes
    if (JSON.stringify(oldTile.logSchema || []) !== JSON.stringify(newTile.logSchema || [])) {
      entries.push({ field: 'logSchema', oldValue: oldTile.logSchema, newValue: newTile.logSchema, note: 'Changed custom log fields' });
    }
    return entries;
  }

  function handleCostChangeDialog(existing, working, oldCost, newCost, audit) {
    const oldFmt = '$' + oldCost.toFixed(2);
    const newFmt = '$' + newCost.toFixed(2);
    const direction = newCost > oldCost ? 'increased' : 'decreased';

    const html = '' +
      '<div class="modal-header"><h2>Cost changed</h2><button class="modal-close" data-close-modal>×</button></div>' +
      '<div class="modal-body">' +
      '  <p style="margin-bottom:16px;">You changed the cost per ' + TB.UI.escapeHtml(working.unitName || 'unit') + ' from <strong>' + oldFmt + '</strong> to <strong>' + newFmt + '</strong>. How should this apply?</p>' +
      '  <div class="metric-list">' +
      '    <div class="metric-toggle" data-cost-mode="forward">' +
      '      <div class="metric-toggle-info">' +
      '        <div class="metric-toggle-label">Going forward only</div>' +
      '        <div class="metric-toggle-desc">Past stats use ' + oldFmt + '. From now on, ' + newFmt + ' applies. Most accurate to reality.</div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="metric-toggle" data-cost-mode="from-date">' +
      '      <div class="metric-toggle-info">' +
      '        <div class="metric-toggle-label">From a specific date</div>' +
      '        <div class="metric-toggle-desc">' + oldFmt + ' applies before that date, ' + newFmt + ' after. For correcting historical price changes.</div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="metric-toggle" data-cost-mode="retro">' +
      '      <div class="metric-toggle-info">' +
      '        <div class="metric-toggle-label">Retroactively to everything</div>' +
      '        <div class="metric-toggle-desc">Use ' + newFmt + ' from day one. All past stats recompute.</div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="metric-toggle" data-cost-mode="cancel">' +
      '      <div class="metric-toggle-info">' +
      '        <div class="metric-toggle-label">Cancel — keep ' + oldFmt + '</div>' +
      '        <div class="metric-toggle-desc">Don\'t change anything yet.</div>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div id="tb-cost-date-picker" class="cost-date-picker" style="display:none;">' +
      '    <label style="font-weight:600;font-size:0.85rem;">Effective from:</label>' +
      '    <input type="date" id="tb-cost-effective-date" value="' + new Date().toISOString().slice(0,10) + '" max="' + new Date().toISOString().slice(0,10) + '">' +
      '    <button class="btn btn-primary" id="tb-cost-date-confirm">Apply from this date</button>' +
      '  </div>' +
      '</div>';

    const modal = TB.UI.openModal(html);

    // Helper to apply the cost change and close
    function applyAndClose(noteOverride) {
      TB.Storage.updateTileWithAudit(existing.id, working, audit);
      TB.UI.toast('Saved', 'success');
      TB.UI.closeModal();
      TB.Dashboard.refresh();
    }

    modal.querySelectorAll('[data-cost-mode]').forEach(card => {
      card.addEventListener('click', () => {
        const mode = card.dataset.costMode;
        if (mode === 'cancel') {
          working.inputs.costPerUnit = existing.inputs.costPerUnit;
          TB.Storage.updateTileWithAudit(existing.id, working, audit);
          TB.UI.toast('Cost reverted to ' + oldFmt, 'warning');
          TB.UI.closeModal();
          TB.Dashboard.refresh();
          return;
        }
        if (mode === 'forward') {
          const existingHistory = Array.isArray(existing.inputs.costPerUnit)
            ? existing.inputs.costPerUnit.slice()
            : (existing.inputs.costPerUnit != null
                ? [{ value: Number(existing.inputs.costPerUnit), effectiveFrom: existing.created || Date.now() }]
                : []);
          existingHistory.push({ value: newCost, effectiveFrom: Date.now() });
          working.inputs.costPerUnit = existingHistory;
          audit.push({
            field: 'inputs.costPerUnit',
            oldValue: oldFmt,
            newValue: newFmt,
            note: 'Cost ' + direction + ' to ' + newFmt + ' going forward (' + oldFmt + ' applies to past data)'
          });
          applyAndClose();
          return;
        }
        if (mode === 'retro') {
          working.inputs.costPerUnit = newCost;
          audit.push({
            field: 'inputs.costPerUnit',
            oldValue: oldFmt,
            newValue: newFmt,
            note: 'Cost ' + direction + ' to ' + newFmt + ' retroactively'
          });
          applyAndClose();
          return;
        }
        if (mode === 'from-date') {
          // Reveal date picker, don't close
          const picker = modal.querySelector('#tb-cost-date-picker');
          picker.style.display = '';
          modal.querySelectorAll('[data-cost-mode]').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          picker.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    });

    const dateBtn = modal.querySelector('#tb-cost-date-confirm');
    if (dateBtn) {
      dateBtn.addEventListener('click', () => {
        const dateInput = modal.querySelector('#tb-cost-effective-date');
        const dateStr = dateInput.value;
        if (!dateStr) { TB.UI.toast('Pick a date first', 'warning'); return; }
        const effectiveFrom = new Date(dateStr + 'T00:00:00').getTime();
        if (isNaN(effectiveFrom)) { TB.UI.toast('Invalid date', 'warning'); return; }
        const tileCreated = existing.created || 0;
        if (effectiveFrom < tileCreated) {
          // Date is before tile creation — equivalent to retroactive
          working.inputs.costPerUnit = newCost;
          audit.push({
            field: 'inputs.costPerUnit',
            oldValue: oldFmt,
            newValue: newFmt,
            note: 'Cost ' + direction + ' to ' + newFmt + ' (date before tile creation — applied retroactively)'
          });
        } else {
          const existingHistory = Array.isArray(existing.inputs.costPerUnit)
            ? existing.inputs.costPerUnit.slice()
            : (existing.inputs.costPerUnit != null
                ? [{ value: Number(existing.inputs.costPerUnit), effectiveFrom: existing.created || Date.now() }]
                : []);
          existingHistory.push({ value: newCost, effectiveFrom: effectiveFrom });
          working.inputs.costPerUnit = existingHistory;
          audit.push({
            field: 'inputs.costPerUnit',
            oldValue: oldFmt,
            newValue: newFmt,
            note: 'Cost ' + direction + ' to ' + newFmt + ' effective ' + new Date(effectiveFrom).toLocaleDateString()
          });
        }
        applyAndClose();
      });
    }
  }

  function renderFormStep(working, isNew) {
    let html = '';

    if (isNew) {
      html += '<div class="field"><label>Quick start — pick a preset or skip</label>';
      html += '<div class="preset-grid" id="tb-preset-grid">';
      const presets = TB.Data.presets || [];
      for (const p of presets) {
        const icon = TB.UI.iconHTML(p.iconId);
        html += '<div class="preset-card" data-preset-id="' + p.id + '">' +
          '  <div class="preset-icon">' + icon + '</div>' +
          '  <div class="preset-name">' + TB.UI.escapeHtml(p.name) + '</div>' +
          '  <div class="preset-type">' + p.type + '</div>' +
          '</div>';
      }
      html += '</div></div>';
      html += '<hr style="border:none;border-top:1px solid var(--border); margin: 20px 0;">';
    }

    html += '<div class="field">' +
      '  <label for="tb-name">Tracker name</label>' +
      '  <input type="text" id="tb-name" placeholder="e.g. Quit smoking" value="' + TB.UI.escapeHtml(working.name) + '" maxlength="60">' +
      '</div>';

    html += '<div class="field"><label>Type</label>' +
      '<div class="type-grid" id="tb-type-grid">' +
      typeCard('quit', '🚭', 'Quitting', 'Build a streak away from something', working.type) +
      typeCard('build', '🌱', 'Building', 'Do something more', working.type) +
      typeCard('observe', '👀', 'Observing', 'Count what you see', working.type) +
      typeCard('earn', '💰', 'Earning', 'Track money in (sales, tips, freelance)', working.type) +
      typeCard('neutral', '📊', 'Tracking', 'Just count things', working.type) +
      '</div></div>';

    html += '<div class="field"><label>Pick an icon</label>' +
      '<div class="icon-search">' +
      '  <input type="text" id="tb-icon-search" placeholder="Search icons (e.g. bee, water, money)">' +
      '</div>' +
      '<div class="icon-grid" id="tb-icon-grid"></div>' +
      '</div>';

    // Unit names — earn type uses different defaults & labels
    const unitLabel = working.type === 'earn' ? 'What\'s a single "sale" called?' : 'What are you counting?';
    html += '<div class="field">' +
      '  <label>' + unitLabel + '</label>' +
      '  <div class="field-row">' +
      '    <input type="text" id="tb-unit-singular" placeholder="' + (working.type === 'earn' ? 'sale' : 'thing') + '" value="' + TB.UI.escapeHtml(working.unitName) + '">' +
      '    <input type="text" id="tb-unit-plural" placeholder="' + (working.type === 'earn' ? 'sales' : 'things') + '" value="' + TB.UI.escapeHtml(working.unitNamePlural) + '">' +
      '  </div>' +
      '  <div class="field-help">Singular and plural.</div>' +
      '</div>';

    // ---- Optional details — collapsible ----
    if (working.type !== 'earn') {
      html += renderOptionalDetails(working);
    } else {
      // Earn-specific: no cost/baseline. Just optional projected-yearly target.
      html += '<div class="field"><label>Optional</label>' +
        '<div class="field"><input type="number" id="tb-yearly-target" placeholder="Yearly earnings goal ($, optional)" value="' + (working.inputs.yearlyTarget ?? '') + '"></div>' +
        '</div>';
    }

    // ---- v0.004: Live timer toggle (not for quit) ----
    if (working.type !== 'quit') {
      const timerOn = working.hasTimer === true;
      html += '<div class="field"><label>Live timer</label>' +
        '<div class="metric-toggle ' + (timerOn ? 'active' : '') + '" id="tb-timer-toggle" style="cursor:pointer;">' +
        '  <div class="metric-toggle-info">' +
        '    <div class="metric-toggle-label">' + (timerOn ? '⏱ Timer enabled' : '⏱ Enable live timer') + '</div>' +
        '    <div class="metric-toggle-desc">Replace the + button with a start/stop stopwatch. Great for meditation, workouts, reading sessions, focus blocks.</div>' +
        '  </div>' +
        '  <div class="face-star">' + (timerOn ? '✓' : '○') + '</div>' +
        '</div></div>';
    }

    // ---- v0.004: Custom log fields editor ----
    html += '<div class="field"><label>Custom log fields <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>' +
      '<div class="field-help">Each time you log, you can be prompted for these. Useful for tracking extras like pages read, intensity, or notes about a sale.</div>' +
      '<div id="tb-log-schema-list">' + renderLogSchemaList(working) + '</div>' +
      '<button type="button" class="btn btn-secondary" id="tb-add-schema-field" style="margin-top:8px;">+ Add a field</button>' +
      '</div>';

    html += '<div class="field"><label>Show on tile face <span style="font-weight:400;color:var(--text-muted);">(tap ⭐ to add — max ' + shapeCapacity(working.shape || 'square') + ' for ' + (working.shape || 'square') + ' tiles)</span></label>' +
      '<div class="metric-list" id="tb-metric-list"></div>' +
      '</div>';

    html += '<div class="field"><label>Tile size</label>' +
      '<div class="pill-group" id="tb-shape-group">' +
      shapePill('square', 'Square (4 stats)', working.shape) +
      shapePill('wide', 'Wide (6 stats)', working.shape) +
      shapePill('tall', 'Tall (6 stats)', working.shape) +
      shapePill('large', 'Large (8 stats)', working.shape) +
      '</div></div>';

    return html;
  }

  function renderLogSchemaList(working) {
    const schema = working.logSchema || [];
    if (schema.length === 0) {
      return '<div style="color:var(--text-muted); font-size:0.85rem; padding:8px 0;">No custom fields. Add one to track extra info with each log.</div>';
    }
    let h = '';
    schema.forEach((f, i) => {
      h += '<div class="schema-field-row" data-schema-index="' + i + '">' +
        '  <input type="text" class="schema-label-input" placeholder="Field name (e.g. pages)" value="' + TB.UI.escapeHtml(f.label || '') + '">' +
        '  <select class="schema-type-input">' +
        '    <option value="number"' + (f.type === 'number' ? ' selected' : '') + '>Number</option>' +
        '    <option value="text"' + (f.type === 'text' ? ' selected' : '') + '>Text</option>' +
        '  </select>' +
        '  <label class="schema-required"><input type="checkbox" class="schema-required-input" ' + (f.required ? 'checked' : '') + '> required</label>' +
        '  <button type="button" class="schema-remove-btn" data-remove-index="' + i + '" title="Remove">×</button>' +
        '</div>';
    });
    return h;
  }

  function renderOptionalDetails(working) {
    const currentCost = extractCurrentCost(working);
    const hasAdvanced = !!(working.inputs.costPerBundle || working.inputs.bundleSize);
    return '<div class="field"><label>Optional details — unlock more metrics</label>' +
      '  <div class="field" style="margin-top:8px;">' +
      '    <label style="font-weight:600;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Cost per ' + TB.UI.escapeHtml(working.unitName || 'unit') + '</label>' +
      '    <input type="number" step="0.01" id="tb-cost-per-unit-simple" placeholder="e.g. 0.60" value="' + (currentCost != null ? currentCost.toFixed(2) : '') + '">' +
      '    <div class="field-help">Just the price of one ' + TB.UI.escapeHtml(working.unitName || 'unit') + '. Powers money-saved & money-spent metrics.</div>' +
      '    <button type="button" class="btn-ghost" id="tb-show-advanced-pricing" style="font-size:0.8rem; padding:4px 0; margin-top:4px; color:var(--accent);">' + (hasAdvanced ? '▼ Hide bundle pricing' : '▸ Or enter bundle pricing instead') + '</button>' +
      '  </div>' +
      '  <div class="field" id="tb-advanced-pricing" style="' + (hasAdvanced ? '' : 'display:none;') + '">' +
      '    <div class="field-row">' +
      '      <input type="number" step="0.01" id="tb-cost-per-bundle" placeholder="Pack cost ($)" value="' + (working.inputs.costPerBundle ?? '') + '">' +
      '      <input type="number" id="tb-bundle-size" placeholder="Items per pack" value="' + (working.inputs.bundleSize ?? '') + '">' +
      '    </div>' +
      '    <input type="text" id="tb-bundle-name" placeholder="Pack name (e.g. pack, box)" value="' + TB.UI.escapeHtml(working.inputs.bundleName ?? '') + '" style="margin-top:8px;">' +
      '    <div class="field-help">If you fill these in, we calculate per-unit cost automatically.</div>' +
      '  </div>' +
      '  <div class="field">' +
      '    <label style="font-weight:600;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">For "quit" trackers</label>' +
      '    <div class="field-row">' +
      '      <input type="number" id="tb-baseline" placeholder="Normal use per day" value="' + (working.inputs.baselinePerDay ?? '') + '">' +
      '      <input type="number" id="tb-time-per-unit" placeholder="Minutes each takes" value="' + (working.inputs.timePerUnitMinutes ?? '') + '">' +
      '    </div>' +
      '    <div class="field-help">How many you\'d normally have per day. Powers money-saved, units-avoided.</div>' +
      '  </div>' +
      '  <div class="field">' +
      '    <label style="font-weight:600;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">For "build" trackers</label>' +
      '    <input type="number" id="tb-daily-goal" placeholder="Daily goal" value="' + (working.inputs.dailyGoal ?? '') + '">' +
      '  </div>' +
      '</div>';
  }

  function typeCard(id, emoji, title, desc, currentType) {
    const cls = currentType === id ? 'type-card active' : 'type-card';
    return '<div class="' + cls + '" data-type="' + id + '">' +
      '  <div class="type-card-emoji">' + emoji + '</div>' +
      '  <div class="type-card-title">' + title + '</div>' +
      '  <div class="type-card-desc">' + desc + '</div>' +
      '</div>';
  }

  function shapePill(id, label, current) {
    const cls = current === id ? 'pill active' : 'pill';
    return '<div class="' + cls + '" data-shape="' + id + '">' + label + '</div>';
  }

  function wireFormHandlers(modal, working, isNew) {
    if (isNew) {
      modal.querySelectorAll('[data-preset-id]').forEach(card => {
        card.addEventListener('click', () => {
          const preset = (TB.Data.presets || []).find(p => p.id === card.dataset.presetId);
          if (!preset) return;
          working.name = preset.name;
          working.type = preset.type;
          working.iconId = preset.iconId;
          working.color = preset.color;
          working.unitName = preset.unitName;
          working.unitNamePlural = preset.unitNamePlural;
          working.inputs = JSON.parse(JSON.stringify(preset.suggestedInputs || {}));
          working.faceMetrics = (preset.defaultMetrics || []).slice();
          // v0.004: copy timer + schema from preset
          working.hasTimer = preset.hasTimer === true;
          working.logSchema = Array.isArray(preset.logSchema) ? JSON.parse(JSON.stringify(preset.logSchema)) : [];
          const body = modal.querySelector('#tb-form-body');
          body.innerHTML = renderFormStep(working, isNew);
          wireFormHandlers(modal, working, isNew);
        });
      });
    }

    const nameInput = modal.querySelector('#tb-name');
    if (nameInput) nameInput.addEventListener('input', e => { working.name = e.target.value; });

    modal.querySelectorAll('[data-type]').forEach(card => {
      card.addEventListener('click', () => {
        const newType = card.dataset.type;
        if (newType === working.type) return;
        working.type = newType;
        // Re-render form because type changes what fields show
        const body = modal.querySelector('#tb-form-body');
        body.innerHTML = renderFormStep(working, isNew);
        wireFormHandlers(modal, working, isNew);
      });
    });

    const sing = modal.querySelector('#tb-unit-singular');
    const plur = modal.querySelector('#tb-unit-plural');
    if (sing) sing.addEventListener('input', e => { working.unitName = e.target.value; });
    if (plur) plur.addEventListener('input', e => { working.unitNamePlural = e.target.value; });

    // Simple cost field
    const simpleCost = modal.querySelector('#tb-cost-per-unit-simple');
    if (simpleCost) {
      simpleCost.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '') {
          delete working.inputs.costPerUnit;
        } else {
          working.inputs.costPerUnit = parseFloat(v);
        }
        renderMetricList(modal, working);
      });
    }

    // Advanced pricing toggle
    const advToggle = modal.querySelector('#tb-show-advanced-pricing');
    const advBlock = modal.querySelector('#tb-advanced-pricing');
    if (advToggle && advBlock) {
      advToggle.addEventListener('click', () => {
        const open = advBlock.style.display !== 'none';
        advBlock.style.display = open ? 'none' : '';
        advToggle.textContent = open ? '▸ Or enter bundle pricing instead' : '▼ Hide bundle pricing';
      });
    }

    const wireNumInput = (sel, key) => {
      const el = modal.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '') delete working.inputs[key];
        else working.inputs[key] = parseFloat(v);
        // If bundle pricing changes, sync simple cost field
        if (key === 'costPerBundle' || key === 'bundleSize') {
          const bc = working.inputs.costPerBundle, bs = working.inputs.bundleSize;
          if (bc && bs) {
            working.inputs.costPerUnit = Number(bc) / Number(bs);
            const sf = modal.querySelector('#tb-cost-per-unit-simple');
            if (sf) sf.value = (Number(bc) / Number(bs)).toFixed(2);
          }
        }
        renderMetricList(modal, working);
      });
    };
    const wireTextInput = (sel, key) => {
      const el = modal.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '') delete working.inputs[key];
        else working.inputs[key] = v;
      });
    };
    wireNumInput('#tb-cost-per-bundle', 'costPerBundle');
    wireNumInput('#tb-bundle-size', 'bundleSize');
    wireTextInput('#tb-bundle-name', 'bundleName');
    wireNumInput('#tb-baseline', 'baselinePerDay');
    wireNumInput('#tb-time-per-unit', 'timePerUnitMinutes');
    wireNumInput('#tb-daily-goal', 'dailyGoal');
    wireNumInput('#tb-yearly-target', 'yearlyTarget');

    renderIconPicker(modal, working);
    const search = modal.querySelector('#tb-icon-search');
    if (search) search.addEventListener('input', () => renderIconPicker(modal, working));

    renderMetricList(modal, working);

    // v0.004: timer toggle
    const timerToggle = modal.querySelector('#tb-timer-toggle');
    if (timerToggle) {
      timerToggle.addEventListener('click', () => {
        working.hasTimer = !working.hasTimer;
        // Re-render the toggle visual
        const labelEl = timerToggle.querySelector('.metric-toggle-label');
        const starEl = timerToggle.querySelector('.face-star');
        if (working.hasTimer) {
          timerToggle.classList.add('active');
          if (labelEl) labelEl.textContent = '⏱ Timer enabled';
          if (starEl) starEl.textContent = '✓';
        } else {
          timerToggle.classList.remove('active');
          if (labelEl) labelEl.textContent = '⏱ Enable live timer';
          if (starEl) starEl.textContent = '○';
        }
      });
    }

    // v0.004: schema field handlers
    wireSchemaHandlers(modal, working);

    modal.querySelectorAll('[data-shape]').forEach(p => {
      p.addEventListener('click', () => {
        modal.querySelectorAll('[data-shape]').forEach(c => c.classList.remove('active'));
        p.classList.add('active');
        working.shape = p.dataset.shape;
        const cap = shapeCapacity(working.shape);
        if (working.faceMetrics.length > cap) {
          working.faceMetrics = working.faceMetrics.slice(0, cap);
          renderMetricList(modal, working);
          TB.UI.toast('Trimmed to ' + cap + ' metrics for this shape', 'warning', 2000);
        }
      });
    });
  }

  function wireSchemaHandlers(modal, working) {
    const list = modal.querySelector('#tb-log-schema-list');
    const addBtn = modal.querySelector('#tb-add-schema-field');
    if (!list || !addBtn) return;

    function rerender() {
      list.innerHTML = renderLogSchemaList(working);
      attachRowHandlers();
    }
    function attachRowHandlers() {
      list.querySelectorAll('.schema-field-row').forEach(row => {
        const idx = parseInt(row.dataset.schemaIndex, 10);
        const labelInput = row.querySelector('.schema-label-input');
        const typeInput = row.querySelector('.schema-type-input');
        const reqInput = row.querySelector('.schema-required-input');
        const removeBtn = row.querySelector('.schema-remove-btn');
        if (labelInput) {
          labelInput.addEventListener('input', e => {
            const v = e.target.value;
            working.logSchema[idx].label = v;
            // Auto-generate key from label (camelCase, alphanumeric only)
            working.logSchema[idx].key = v.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field' + idx;
          });
        }
        if (typeInput) {
          typeInput.addEventListener('change', e => {
            working.logSchema[idx].type = e.target.value;
          });
        }
        if (reqInput) {
          reqInput.addEventListener('change', e => {
            working.logSchema[idx].required = e.target.checked;
          });
        }
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            working.logSchema.splice(idx, 1);
            rerender();
          });
        }
      });
    }
    addBtn.addEventListener('click', () => {
      if (!Array.isArray(working.logSchema)) working.logSchema = [];
      working.logSchema.push({ key: 'field' + working.logSchema.length, label: '', type: 'text', required: false });
      rerender();
    });
    attachRowHandlers();
  }

  function renderIconPicker(modal, working) {
    const grid = modal.querySelector('#tb-icon-grid');
    if (!grid) return;
    const search = modal.querySelector('#tb-icon-search');
    const query = search ? search.value.toLowerCase().trim() : '';

    const icons = TB.Data.icons || [];
    const filtered = query
      ? icons.filter(i => i.label.toLowerCase().includes(query) || (i.tags || []).some(t => t.includes(query)))
      : icons;

    let html = '';
    html += '<label class="icon-upload-btn" for="tb-icon-upload">' +
      '<span class="icon-upload-icon">📷</span><span>Upload</span></label>' +
      '<input type="file" id="tb-icon-upload" accept="image/*" style="display:none;">';

    if (working.customIcon) {
      html += '<div class="icon-option active" data-custom="true" title="Your custom image">' +
        '<img src="' + working.customIcon + '" alt=""></div>';
    }
    for (const icon of filtered) {
      const active = !working.customIcon && working.iconId === icon.id ? ' active' : '';
      html += '<div class="icon-option' + active + '" data-icon-id="' + icon.id + '" title="' + TB.UI.escapeHtml(icon.label) + '">' +
        TB.UI.iconHTML(icon.id) + '</div>';
    }
    grid.innerHTML = html;

    grid.querySelectorAll('[data-icon-id]').forEach(opt => {
      opt.addEventListener('click', () => {
        working.iconId = opt.dataset.iconId;
        working.customIcon = null;
        renderIconPicker(modal, working);
      });
    });

    const upload = modal.querySelector('#tb-icon-upload');
    if (upload) {
      upload.addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        // v0.004: raise limit (we'll downscale anyway). 10MB original ceiling.
        if (file.size > 10 * 1024 * 1024) {
          TB.UI.toast('Image too large — pick one under 10MB', 'warning');
          return;
        }
        if (!file.type.startsWith('image/')) {
          TB.UI.toast('That doesn\'t look like an image', 'warning');
          return;
        }
        TB.UI.toast('Resizing image…', 'success', 1000);
        resizeImageToDataURL(file, 256, 0.85).then(dataUrl => {
          working.customIcon = dataUrl;
          renderIconPicker(modal, working);
        }).catch(err => {
          console.error('Image resize failed:', err);
          // Fallback: use the original if resize fails
          const reader = new FileReader();
          reader.onload = ev => {
            working.customIcon = ev.target.result;
            renderIconPicker(modal, working);
          };
          reader.readAsDataURL(file);
        });
      });
    }
  }

  // v0.004: client-side image resize via canvas. Returns JPEG dataURL ~ targetPx square.
  function resizeImageToDataURL(file, targetPx, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          try {
            const srcW = img.naturalWidth;
            const srcH = img.naturalHeight;
            if (!srcW || !srcH) { reject(new Error('Invalid image dimensions')); return; }
            // Center-crop to square
            const side = Math.min(srcW, srcH);
            const sx = (srcW - side) / 2;
            const sy = (srcH - side) / 2;
            const canvas = document.createElement('canvas');
            canvas.width = targetPx;
            canvas.height = targetPx;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, side, side, 0, 0, targetPx, targetPx);
            const out = canvas.toDataURL('image/jpeg', quality || 0.85);
            resolve(out);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = ev.target.result;
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  function renderMetricList(modal, working) {
    const list = modal.querySelector('#tb-metric-list');
    if (!list) return;
    const all = TB.Data.metrics || [];
    const applicable = all.filter(m =>
      !m.appliesTo || m.appliesTo.includes(working.type || 'neutral'));

    const cap = shapeCapacity(working.shape || 'square');

    let html = '';
    for (const m of applicable) {
      const missing = (m.needsInputs || []).filter(key => {
        if (key === 'costPerUnit') {
          return !(working.inputs.costPerUnit || (working.inputs.costPerBundle && working.inputs.bundleSize));
        }
        return working.inputs[key] == null || working.inputs[key] === '';
      });
      const disabled = missing.length > 0;
      const onFace = working.faceMetrics.includes(m.id);
      const cls = 'metric-toggle' + (onFace ? ' active on-face' : '');
      const opacity = disabled ? 'opacity:0.45;' : '';
      const note = disabled ? '<span style="color:var(--warning);"> · needs: ' + missing.join(', ') + '</span>' : '';

      html += '<div class="' + cls + '" data-metric-id="' + m.id + '" style="' + opacity + '">' +
        '  <div class="metric-toggle-info">' +
        '    <div class="metric-toggle-label">' + m.label + '</div>' +
        '    <div class="metric-toggle-desc">' + m.description + note + '</div>' +
        '  </div>' +
        '  <div class="face-star">' + (onFace ? '★' : '☆') + '</div>' +
        '</div>';
    }
    list.innerHTML = html;

    list.querySelectorAll('[data-metric-id]').forEach(tEl => {
      tEl.addEventListener('click', () => {
        const mid = tEl.dataset.metricId;
        const idx = working.faceMetrics.indexOf(mid);
        if (idx > -1) {
          working.faceMetrics.splice(idx, 1);
        } else {
          if (working.faceMetrics.length >= cap) {
            TB.UI.toast('Max ' + cap + ' metrics for this tile shape — pick a bigger shape for more', 'warning');
            return;
          }
          working.faceMetrics.push(mid);
        }
        renderMetricList(modal, working);
      });
    });
  }

  // ===== Detail modal =====
  function openDetail(tileId) {
    const tile = TB.Storage.getTile(tileId);
    if (!tile) return;

    const iconHtml = TB.UI.iconHTML(tile.iconId, tile.customIcon);
    const all = TB.Data.metrics || [];

    // Split metrics into "current" and "lifetime" sections for quit tiles
    let currentMetrics = [];
    let lifetimeMetrics = [];
    let allApplicable = [];

    if (tile.system) {
      allApplicable = (tile.faceMetrics || []).map(id => ({ id, label: getMetricLabel(id) }));
      currentMetrics = allApplicable;
    } else {
      allApplicable = all.filter(m => !m.appliesTo || m.appliesTo.includes(tile.type || 'neutral'));
      if (tile.type === 'quit') {
        currentMetrics = allApplicable.filter(m => !m.id.startsWith('lifetime-') && m.id !== 'total-attempts' && m.id !== 'avg-attempt-length' && m.id !== 'best-attempt');
        lifetimeMetrics = allApplicable.filter(m => m.id.startsWith('lifetime-') || m.id === 'total-attempts' || m.id === 'avg-attempt-length' || m.id === 'best-attempt' || m.id === 'longest-streak');
      } else {
        currentMetrics = allApplicable;
      }
    }

    function renderMetricGrid(metrics) {
      let h = '';
      for (const m of metrics) {
        const result = TB.Metrics.compute(m.id, tile, TB.Storage.getState());
        h += '<div class="detail-metric">' +
          '  <div class="detail-metric-label">' + m.label + '</div>' +
          '  <div class="detail-metric-value" data-metric="' + m.id + '">' + result.formatted + '</div>' +
          '</div>';
      }
      return h;
    }

    // Recent activity
    const logs = (tile.logs || []).slice().sort((a, b) => b.time - a.time).slice(0, 50);
    let historyHTML = '';
    if (logs.length === 0) {
      historyHTML = '<div class="history-empty">No history yet. Tap the corner button on the tile to log your first one.</div>';
    } else {
      const schemaKeys = (tile.logSchema || []).map(s => s.key);
      const schemaLabels = {};
      (tile.logSchema || []).forEach(s => { schemaLabels[s.key] = s.label || s.key; });
      for (const l of logs) {
        const tagClass = l.type === 'lapse' ? 'lapse' : 'log';
        let tagText;
        if (l.type === 'lapse') tagText = 'Slip';
        else if (l.durationMs != null) tagText = TB.Metrics.formatDuration(l.durationMs, { compact: true });
        else if (l.amount != null) tagText = '$' + Number(l.amount).toFixed(2);
        else tagText = '+' + (l.count || 1);

        // Build extra-fields chip list
        let extrasHTML = '';
        schemaKeys.forEach(k => {
          if (l[k] != null && l[k] !== '') {
            extrasHTML += '<span class="log-extra"><strong>' + TB.UI.escapeHtml(schemaLabels[k]) + ':</strong> ' + TB.UI.escapeHtml(String(l[k])) + '</span>';
          }
        });
        if (l.note) {
          extrasHTML += '<span class="log-extra log-note-extra">"' + TB.UI.escapeHtml(l.note) + '"</span>';
        }

        historyHTML += '<div class="history-item">' +
          '  <span class="history-item-tag ' + tagClass + '">' + tagText + '</span>' +
          '  <span class="history-item-time">' + TB.UI.formatTime(l.time) + '</span>' +
          (extrasHTML ? '  <div class="history-item-extras">' + extrasHTML + '</div>' : '') +
          '  <button class="history-delete" data-log-time="' + l.time + '" title="Delete">×</button>' +
          '</div>';
      }
    }

    // Attempts history (quit tiles only)
    let attemptsHTML = '';
    if (tile.type === 'quit' && tile.attempts && tile.attempts.length > 1) {
      const sorted = tile.attempts.slice().reverse();
      // Compute max duration for bar scaling
      const maxDur = Math.max.apply(null, tile.attempts.map(a => {
        const end = a.endTime || Date.now();
        return a.durationMs != null ? a.durationMs : Math.max(0, end - a.startTime);
      }));
      // Timeline (chronological, left = oldest, right = newest)
      let timelineHTML = '<div class="attempts-timeline">';
      tile.attempts.forEach((a, idx) => {
        const isCurrent = a.endTime == null;
        const end = a.endTime || Date.now();
        const dur = a.durationMs != null ? a.durationMs : Math.max(0, end - a.startTime);
        const pct = maxDur > 0 ? (dur / maxDur) * 100 : 0;
        const cls = isCurrent ? 'current' : (a.closedBy === 'lapse' ? 'lapse' : 'manual');
        const tooltip = '#' + (idx + 1) + ' · ' + TB.Metrics.formatDays(dur) + (isCurrent ? ' (in progress)' : '');
        timelineHTML += '<div class="timeline-bar ' + cls + '" style="height:' + Math.max(4, pct) + '%;" title="' + TB.UI.escapeHtml(tooltip) + '">' +
          '<div class="timeline-bar-tooltip">' + TB.UI.escapeHtml(tooltip) + '</div>' +
          '</div>';
      });
      timelineHTML += '</div>' +
        '<div class="timeline-legend">' +
        '<span><span class="timeline-legend-dot" style="background:var(--accent,#5BA856);"></span>ended clean / in progress</span>' +
        '<span><span class="timeline-legend-dot" style="background:var(--danger,#E5484D);"></span>slip</span>' +
        '<span><span class="timeline-legend-dot" style="background:var(--warning,#FFB627);"></span>manual reset</span>' +
        '</div>';

      attemptsHTML = '<div class="detail-section">' +
        '<div class="detail-section-title section-title-with-mascot">' +
        '  <div class="section-title-mascot">' + TB.UI.mascotHTML('calendar') + '</div>' +
        '  <span>Attempts history</span>' +
        '</div>' +
        timelineHTML +
        '<div class="attempts-list">';
      sorted.forEach((a, idx) => {
        const isCurrent = a.endTime == null;
        const end = a.endTime || Date.now();
        const dur = a.durationMs != null ? a.durationMs : Math.max(0, end - a.startTime);
        const num = sorted.length - idx;
        const status = isCurrent ? '<span class="attempt-current">In progress</span>' :
                      (a.closedBy === 'lapse' ? '<span class="attempt-lapse">ended by slip</span>' : '<span class="attempt-manual">manually reset</span>');
        attemptsHTML += '<div class="attempt-item">' +
          '  <div class="attempt-num">#' + num + '</div>' +
          '  <div class="attempt-info">' +
          '    <div class="attempt-dur">' + TB.Metrics.formatDays(dur) + '</div>' +
          '    <div class="attempt-meta">' +
          '      ' + new Date(a.startTime).toLocaleDateString() + ' → ' + (isCurrent ? 'now' : new Date(a.endTime).toLocaleDateString()) +
          '      · ' + status +
          '    </div>' +
          '  </div>' +
          '</div>';
      });
      attemptsHTML += '</div></div>';
    }

    // Audit log
    let auditHTML = '';
    if (tile.auditLog && tile.auditLog.length > 1 && !tile.system) {
      const sortedAudit = tile.auditLog.slice().sort((a, b) => b.time - a.time).slice(0, 30);
      auditHTML = '<details class="detail-section detail-collapsible"><summary class="detail-section-title">Tile history (' + tile.auditLog.length + ' changes)</summary>' +
        '<div class="audit-list">';
      for (const a of sortedAudit) {
        auditHTML += '<div class="audit-item">' +
          '<span class="audit-time">' + TB.UI.formatTime(a.time) + '</span>' +
          '<span class="audit-note">' + TB.UI.escapeHtml(a.note || a.field) + '</span>' +
          '</div>';
      }
      auditHTML += '</div></details>';
    }

    // Actions
    let actionsHTML = '';
    if (!tile.system) {
      if (tile.type === 'quit') {
        actionsHTML += '<button class="btn btn-secondary" data-action="log-slip">+1 ' + TB.UI.escapeHtml(tile.unitName || 'slip') + ' (slipped)</button>';
        actionsHTML += '<button class="btn btn-secondary" data-action="reset-streak">Reset streak now</button>';
      } else if (tile.type === 'earn') {
        actionsHTML += '<button class="btn btn-primary" data-action="log-amount">+ Log a sale</button>';
      } else {
        actionsHTML += '<button class="btn btn-primary" data-action="log-one">+1 ' + TB.UI.escapeHtml(tile.unitName || 'count') + '</button>';
        actionsHTML += '<button class="btn btn-secondary" data-action="log-custom">Log custom amount</button>';
      }
      actionsHTML += '<button class="btn btn-secondary" data-action="' + (tile.paused ? 'resume' : 'pause') + '">' +
                     (tile.paused ? '▶ Resume' : '⏸ Pause') + '</button>';
      actionsHTML += '<button class="btn btn-secondary" data-action="edit">Edit tracker</button>';
      actionsHTML += '<button class="btn btn-secondary" data-action="duplicate">Duplicate</button>';
      actionsHTML += '<button class="btn btn-secondary" data-action="delete" style="color:var(--danger);">Delete</button>';
    } else {
      actionsHTML += '<button class="btn btn-secondary" data-action="hide-system">Hide this tile</button>';
    }

    let metricsHTML = '<div class="detail-section">';
    if (tile.type === 'quit' && lifetimeMetrics.length > 0) {
      metricsHTML += '<div class="detail-section-title">Current attempt</div>';
      metricsHTML += '<div class="detail-metrics">' + renderMetricGrid(currentMetrics) + '</div>';
      metricsHTML += '<div class="detail-section-title" style="margin-top:18px;">Lifetime — across all attempts</div>';
      metricsHTML += '<div class="detail-metrics">' + renderMetricGrid(lifetimeMetrics) + '</div>';
    } else {
      metricsHTML += '<div class="detail-metrics">' + renderMetricGrid(currentMetrics) + '</div>';
    }
    metricsHTML += '</div>';

    const html = '' +
      '<div class="modal-header">' +
      '  <h2>Details</h2>' +
      '  <button class="modal-close" data-close-modal>×</button>' +
      '</div>' +
      '<div class="modal-body">' +
      '  <div class="detail-hero">' +
      '    <div class="detail-hero-icon">' + iconHtml + '</div>' +
      '    <div class="detail-hero-name">' + TB.UI.escapeHtml(tile.name) +
      (tile.paused ? '<span class="detail-paused-mascot" title="This tracker is paused">' + TB.UI.mascotHTML('think') + '</span>' : '') +
      '</div>' +
      '    <div class="detail-hero-type">' + (tile.type || 'tracker') + (tile.paused ? ' · paused' : '') + '</div>' +
      '  </div>' +
      metricsHTML +
      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Actions</div>' +
      '    <div class="detail-actions">' + actionsHTML + '</div>' +
      '  </div>' +
      attemptsHTML +
      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Recent activity</div>' +
      '    <div class="history-list">' + historyHTML + '</div>' +
      '  </div>' +
      auditHTML +
      '</div>';

    const modal = TB.UI.openModal(html);
    modal.dataset.tileId = tileId;
    wireDetailHandlers(modal, tile);

    // Live update metrics in detail view
    const liveInterval = setInterval(() => {
      if (!document.getElementById('tb-modal-backdrop')) { clearInterval(liveInterval); return; }
      const freshTile = TB.Storage.getTile(tileId);
      if (!freshTile) { clearInterval(liveInterval); return; }
      modal.querySelectorAll('.detail-metric-value').forEach(vEl => {
        const mid = vEl.dataset.metric;
        const r = TB.Metrics.compute(mid, freshTile, TB.Storage.getState());
        if (r.formatted !== vEl.textContent) vEl.textContent = r.formatted;
      });
    }, 1000);
  }

  function wireDetailHandlers(modal, tile) {
    modal.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'log-one') {
          TB.Storage.logTile(tile.id, 'log');
          TB.UI.toast('Logged', 'success', 1200);
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        } else if (action === 'log-amount') {
          TB.UI.prompt('Sale amount ($)', '', { confirmText: 'Log' }).then(val => {
            if (!val) return;
            const amount = parseFloat(val);
            if (isNaN(amount) || amount < 0) { TB.UI.toast('Enter a valid amount', 'warning'); return; }
            TB.Storage.logTile(tile.id, 'log', { amount: amount });
            TB.UI.toast('Logged $' + amount.toFixed(2), 'success', 1500);
            TB.UI.closeModal();
            TB.Dashboard.refresh();
          });
        } else if (action === 'log-custom') {
          TB.UI.prompt('How many?', '1', { confirmText: 'Log' }).then(val => {
            if (!val) return;
            const n = parseInt(val, 10);
            if (isNaN(n) || n < 1) { TB.UI.toast('Enter a number ≥ 1', 'warning'); return; }
            TB.Storage.logTile(tile.id, 'log', { count: n });
            TB.UI.toast('Logged ' + n, 'success', 1500);
            TB.UI.closeModal();
            TB.Dashboard.refresh();
          });
        } else if (action === 'log-slip') {
          handleQuickLog(tile.id);
        } else if (action === 'reset-streak') {
          TB.UI.confirm('Reset your streak timer to now? Your previous streak gets saved to attempts history, and lifetime stats keep growing.', { confirmText: 'Reset', danger: true })
            .then(ok => {
              if (ok) {
                TB.Storage.resetStreak(tile.id);
                TB.UI.toast('Streak reset', 'warning');
                TB.UI.closeModal();
                TB.Dashboard.refresh();
              }
            });
        } else if (action === 'pause') {
          TB.Storage.pauseTile(tile.id);
          TB.UI.toast('Paused — timers held in place', 'warning');
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        } else if (action === 'resume') {
          TB.Storage.resumeTile(tile.id);
          TB.UI.toast('Resumed', 'success');
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        } else if (action === 'edit') {
          TB.UI.closeModal();
          setTimeout(() => openEditModal(tile.id), 200);
        } else if (action === 'duplicate') {
          TB.Storage.duplicateTile(tile.id);
          TB.UI.toast('Duplicated', 'success');
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        } else if (action === 'delete') {
          TB.UI.confirm(
            'Delete "' + TB.UI.escapeHtml(tile.name) + '"? All its history will be lost. Consider exporting a backup first.',
            { confirmText: 'Delete', danger: true }
          ).then(ok => {
            if (ok) {
              TB.Storage.deleteTile(tile.id);
              TB.UI.toast('Deleted', 'warning');
              TB.UI.closeModal();
              TB.Dashboard.refresh();
            }
          });
        } else if (action === 'hide-system') {
          TB.Storage.deleteTile(tile.id);
          TB.UI.toast('Hidden. Restore from Settings anytime — your data keeps tracking.', 'warning', 3500);
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        }
      });
    });

    modal.querySelectorAll('.history-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const t = parseInt(btn.dataset.logTime, 10);
        TB.Storage.deleteLogEntry(tile.id, t);
        btn.closest('.history-item').remove();
        TB.UI.toast('Entry removed', 'warning', 1200);
      });
    });
  }

  return {
    renderTileElement,
    openCreateModal,
    openEditModal,
    openDetail,
    handleQuickLog,
    refreshTileMetrics,
    getMetricLabel,
    shapeCapacity
  };
})();
