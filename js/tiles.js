/* ===================================================================
   Tracking Buddy — tiles.js
   Tile rendering, create/edit modal, detail view, quick log handling.
   =================================================================== */

const TB = window.TB = window.TB || {};

TB.Tiles = (function () {
  // ===== Renders a single tile element =====
  function renderTileElement(tile, index) {
    const el = document.createElement('div');
    el.className = 'tile shape-' + (tile.shape || 'square');
    if (tile.paused) el.classList.add('paused');
    if (tile.system) el.classList.add('system');
    el.dataset.tileId = tile.id;
    el.style.setProperty('--tile-i', index);
    if (tile.color) el.style.borderColor = tile.color;

    // ---- Header (icon + name) ----
    const iconHtml = TB.UI.iconHTML(tile.iconId, tile.customIcon);
    const typeBadge = tile.type && tile.type !== 'neutral'
      ? '<span class="tile-type-badge">' + tile.type + '</span>'
      : '';

    const iconColor = tile.color ? 'background:' + hexToSoft(tile.color) + ';' : '';

    let html = '' +
      typeBadge +
      '<div class="tile-edit-handle" data-action="delete-tile">×</div>' +
      '<div class="tile-header">' +
      '  <div class="tile-icon" style="' + iconColor + '">' + iconHtml + '</div>' +
      '  <div class="tile-name">' + TB.UI.escapeHtml(tile.name) + '</div>' +
      '</div>';

    // ---- Body (metrics) ----
    const metricsToShow = (tile.faceMetrics || []).slice(0, 4);
    if (metricsToShow.length > 0) {
      html += '<div class="tile-body">';
      for (const metricId of metricsToShow) {
        const result = TB.Metrics.compute(metricId, tile, TB.Storage.getState());
        const label = getMetricLabel(metricId);
        const liveClass = result.isLive ? ' live' : '';
        html += '' +
          '<div class="tile-metric">' +
          '  <div class="tile-metric-value' + liveClass + '" data-metric="' + metricId + '">' + result.formatted + '</div>' +
          '  <div class="tile-metric-label">' + label + '</div>' +
          '</div>';
      }
      html += '</div>';
    }

    // ---- Quick log button ----
    if (!tile.system) {
      const isQuit = tile.type === 'quit';
      const label = isQuit ? '!' : '+';
      const cls = isQuit ? 'tile-quick-log quit-mode' : 'tile-quick-log';
      const title = isQuit ? 'Log a slip' : 'Log one';
      html += '<button class="' + cls + '" data-action="quick-log" aria-label="' + title + '">' + label + '</button>';
    }

    el.innerHTML = html;
    return el;
  }

  function getMetricLabel(metricId) {
    const all = TB.Data && TB.Data.metrics ? TB.Data.metrics : [];
    const m = all.find(x => x.id === metricId);
    if (m) return m.label;
    // System tile metrics
    const sysLabels = {
      'tb-time-since': 'Using app',
      'tb-days-using': 'Days using app',
      'tb-tiles-created': 'Tiles ever made',
      'tb-active-tiles': 'Active tiles',
      'tb-total-logs': 'Total logs',
      'tb-total-lapses': 'Total slips',
      'tb-longest-tile': 'Longest tracker',
      'tb-money-saved': 'Total saved'
    };
    return sysLabels[metricId] || metricId;
  }

  // ===== Convert hex color to soft background =====
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

    if (tile.type === 'quit') {
      // Confirm before breaking a streak
      const streakDur = TB.Metrics.getStreakDuration(tile);
      const streakLabel = TB.Metrics.formatDays(streakDur);
      TB.UI.confirm(
        '<strong>Your current streak is ' + streakLabel + '.</strong><br><br>' +
        'Logging a slip will reset the timer. Your longest streak will be preserved, ' +
        'and your old streak gets saved to history.<br><br>' +
        'You\'ve got this — slips are part of the journey.',
        { title: 'Log a slip?', confirmText: 'Yes, log it', danger: true }
      ).then(ok => {
        if (ok) {
          TB.Storage.logTile(tileId, 'lapse');
          TB.UI.toast('Streak reset. You\'re back at day 1 — keep going.', 'warning', 3500);
          TB.Dashboard.refresh();
        }
      });
    } else {
      // Simple log
      TB.Storage.logTile(tileId, 'log');
      showFloatingFeedback(tileId);
      // Refresh just the tile's metrics inline (no full reflow)
      refreshTileMetrics(tileId);

      // Celebrate at certain thresholds
      const newTotal = TB.Metrics.compute('total-count', TB.Storage.getTile(tileId)).rawValue;
      if (newTotal === 1 || newTotal === 10 || newTotal === 50 || newTotal === 100 ||
          newTotal === 500 || newTotal === 1000 || (newTotal > 100 && newTotal % 500 === 0)) {
        TB.UI.confetti({ count: 30 });
        TB.UI.toast('🎉 ' + newTotal + ' logged — nice work!', 'success', 2400);
      }

      // Goal hit celebration
      const tile2 = TB.Storage.getTile(tileId);
      if (tile2.type === 'build' && tile2.inputs && tile2.inputs.dailyGoal) {
        const today = TB.Metrics.compute('count-today', tile2).rawValue;
        if (today === tile2.inputs.dailyGoal) {
          TB.UI.confetti({ count: 40 });
          TB.UI.toast('🌟 Daily goal hit! Tally is proud.', 'success', 2800);
        }
      }
    }
  }

  function showFloatingFeedback(tileId) {
    const tileEl = document.querySelector('[data-tile-id="' + tileId + '"]');
    if (!tileEl) return;
    const fb = document.createElement('div');
    fb.className = 'tile-floating-feedback';
    fb.textContent = '+1';
    tileEl.appendChild(fb);
    setTimeout(() => fb.remove(), 1200);
  }

  function refreshTileMetrics(tileId) {
    const tile = TB.Storage.getTile(tileId);
    if (!tile) return;
    const tileEl = document.querySelector('[data-tile-id="' + tileId + '"]');
    if (!tileEl) return;
    const valueEls = tileEl.querySelectorAll('.tile-metric-value');
    valueEls.forEach(vEl => {
      const metricId = vEl.dataset.metric;
      if (metricId) {
        const result = TB.Metrics.compute(metricId, tile, TB.Storage.getState());
        vEl.textContent = result.formatted;
      }
    });
  }

  // ===== Create / Edit tile modal =====
  function openCreateModal() {
    openTileForm(null);
  }

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
        name: '',
        type: 'neutral',
        iconId: 'star',
        customIcon: null,
        color: null,
        shape: 'square',
        unitName: 'thing',
        unitNamePlural: 'things',
        inputs: {},
        faceMetrics: []
      };

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
        working.faceMetrics = ['total-count']; // sensible default
      }

      if (isNew) {
        const t = TB.Storage.createTile(working);
        TB.UI.toast('Tracker created — Tally approves!', 'success');
        TB.UI.closeModal();
        TB.Dashboard.refresh();
      } else {
        TB.Storage.updateTile(existing.id, working);
        TB.UI.toast('Saved', 'success');
        TB.UI.closeModal();
        TB.Dashboard.refresh();
      }
    });
  }

  function renderFormStep(working, isNew) {
    let html = '';

    // ---- Step: pick preset (only on create) ----
    if (isNew) {
      html += '<div class="field"><label>Quick start — pick a preset or skip</label>';
      html += '<div class="preset-grid" id="tb-preset-grid">';
      const presets = TB.Data.presets || [];
      for (const p of presets) {
        const icon = TB.UI.iconHTML(p.iconId);
        html += '' +
          '<div class="preset-card" data-preset-id="' + p.id + '">' +
          '  <div class="preset-icon">' + icon + '</div>' +
          '  <div class="preset-name">' + TB.UI.escapeHtml(p.name) + '</div>' +
          '  <div class="preset-type">' + p.type + '</div>' +
          '</div>';
      }
      html += '</div></div>';
      html += '<hr style="border:none;border-top:1px solid var(--border); margin: 20px 0;">';
    }

    // ---- Name ----
    html += '<div class="field">' +
      '  <label for="tb-name">Tracker name</label>' +
      '  <input type="text" id="tb-name" placeholder="e.g. Quit smoking" value="' + TB.UI.escapeHtml(working.name) + '" maxlength="60">' +
      '</div>';

    // ---- Type ----
    html += '<div class="field"><label>Type — what kind of tracker is this?</label>' +
      '<div class="type-grid" id="tb-type-grid">' +
      typeCard('quit', '🚭', 'Quitting', 'Building a streak away from something', working.type) +
      typeCard('build', '🌱', 'Building', 'Doing something more', working.type) +
      typeCard('observe', '👀', 'Observing', 'Counting something you see', working.type) +
      typeCard('neutral', '📊', 'Just tracking', 'Neutral count', working.type) +
      '</div></div>';

    // ---- Icon ----
    html += '<div class="field"><label>Pick an icon</label>' +
      '<div class="icon-search">' +
      '  <input type="text" id="tb-icon-search" placeholder="Search icons (e.g. bee, water, money)">' +
      '</div>' +
      '<div class="icon-grid" id="tb-icon-grid"></div>' +
      '</div>';

    // ---- Unit names ----
    html += '<div class="field">' +
      '  <label>What are you counting?</label>' +
      '  <div class="field-row">' +
      '    <input type="text" id="tb-unit-singular" placeholder="cigarette" value="' + TB.UI.escapeHtml(working.unitName) + '">' +
      '    <input type="text" id="tb-unit-plural" placeholder="cigarettes" value="' + TB.UI.escapeHtml(working.unitNamePlural) + '">' +
      '  </div>' +
      '  <div class="field-help">Singular and plural. Used in metrics and prompts.</div>' +
      '</div>';

    // ---- Inputs (cost, baseline, time, daily goal) ----
    html += '<div class="field"><label>Optional details — unlock more metrics</label>' +
      '  <div class="field" style="margin-top:8px;">' +
      '    <label style="font-weight:600;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">Cost</label>' +
      '    <div class="field-row">' +
      '      <input type="number" step="0.01" id="tb-cost-per-unit" placeholder="Per unit ($)" value="' + (working.inputs.costPerUnit ?? '') + '">' +
      '      <input type="number" step="0.01" id="tb-cost-per-bundle" placeholder="Per pack ($)" value="' + (working.inputs.costPerBundle ?? '') + '">' +
      '    </div>' +
      '    <div class="field-row" style="margin-top:8px;">' +
      '      <input type="number" id="tb-bundle-size" placeholder="Items per pack" value="' + (working.inputs.bundleSize ?? '') + '">' +
      '      <input type="text" id="tb-bundle-name" placeholder="Pack name (e.g. pack)" value="' + TB.UI.escapeHtml(working.inputs.bundleName ?? '') + '">' +
      '    </div>' +
      '    <div class="field-help">Enter cost any way you like. We do the math.</div>' +
      '  </div>' +
      '  <div class="field">' +
      '    <label style="font-weight:600;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">For "quit" trackers</label>' +
      '    <div class="field-row">' +
      '      <input type="number" id="tb-baseline" placeholder="Normal use per day" value="' + (working.inputs.baselinePerDay ?? '') + '">' +
      '      <input type="number" id="tb-time-per-unit" placeholder="Minutes each takes" value="' + (working.inputs.timePerUnitMinutes ?? '') + '">' +
      '    </div>' +
      '    <div class="field-help">How many you\'d normally have per day, and how many minutes each one takes.</div>' +
      '  </div>' +
      '  <div class="field">' +
      '    <label style="font-weight:600;font-size:0.8rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">For "build" trackers</label>' +
      '    <input type="number" id="tb-daily-goal" placeholder="Daily goal (e.g. 8 glasses of water)" value="' + (working.inputs.dailyGoal ?? '') + '">' +
      '  </div>' +
      '</div>';

    // ---- Metric picker ----
    html += '<div class="field"><label>Which metrics to show on the tile face? <span style="font-weight:400;color:var(--text-muted);">(Tap the ⭐ to add to face)</span></label>' +
      '<div class="metric-list" id="tb-metric-list"></div>' +
      '</div>';

    // ---- Shape ----
    html += '<div class="field"><label>Tile size</label>' +
      '<div class="pill-group" id="tb-shape-group">' +
      shapePill('square', 'Square', working.shape) +
      shapePill('wide', 'Wide', working.shape) +
      shapePill('tall', 'Tall', working.shape) +
      shapePill('large', 'Large', working.shape) +
      '</div></div>';

    return html;
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
    // ---- Presets ----
    if (isNew) {
      modal.querySelectorAll('[data-preset-id]').forEach(card => {
        card.addEventListener('click', () => {
          const preset = (TB.Data.presets || []).find(p => p.id === card.dataset.presetId);
          if (!preset) return;
          // Apply preset to working
          working.name = preset.name;
          working.type = preset.type;
          working.iconId = preset.iconId;
          working.color = preset.color;
          working.unitName = preset.unitName;
          working.unitNamePlural = preset.unitNamePlural;
          working.inputs = JSON.parse(JSON.stringify(preset.suggestedInputs || {}));
          working.faceMetrics = (preset.defaultMetrics || []).slice();
          // Re-render form
          const body = modal.querySelector('#tb-form-body');
          body.innerHTML = renderFormStep(working, isNew);
          wireFormHandlers(modal, working, isNew);
        });
      });
    }

    // ---- Name input ----
    const nameInput = modal.querySelector('#tb-name');
    if (nameInput) nameInput.addEventListener('input', e => { working.name = e.target.value; });

    // ---- Type ----
    modal.querySelectorAll('[data-type]').forEach(card => {
      card.addEventListener('click', () => {
        modal.querySelectorAll('[data-type]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        working.type = card.dataset.type;
        // Refresh metric list since type filters which metrics show
        renderMetricList(modal, working);
      });
    });

    // ---- Unit names ----
    const sing = modal.querySelector('#tb-unit-singular');
    const plur = modal.querySelector('#tb-unit-plural');
    if (sing) sing.addEventListener('input', e => { working.unitName = e.target.value; });
    if (plur) plur.addEventListener('input', e => { working.unitNamePlural = e.target.value; });

    // ---- Inputs ----
    const wireNumInput = (sel, key) => {
      const el = modal.querySelector(sel);
      if (!el) return;
      el.addEventListener('input', e => {
        const v = e.target.value;
        if (v === '') delete working.inputs[key];
        else working.inputs[key] = parseFloat(v);
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
    wireNumInput('#tb-cost-per-unit', 'costPerUnit');
    wireNumInput('#tb-cost-per-bundle', 'costPerBundle');
    wireNumInput('#tb-bundle-size', 'bundleSize');
    wireTextInput('#tb-bundle-name', 'bundleName');
    wireNumInput('#tb-baseline', 'baselinePerDay');
    wireNumInput('#tb-time-per-unit', 'timePerUnitMinutes');
    wireNumInput('#tb-daily-goal', 'dailyGoal');

    // ---- Icon picker ----
    renderIconPicker(modal, working);
    const search = modal.querySelector('#tb-icon-search');
    if (search) {
      search.addEventListener('input', () => renderIconPicker(modal, working));
    }

    // ---- Metric picker ----
    renderMetricList(modal, working);

    // ---- Shape ----
    modal.querySelectorAll('[data-shape]').forEach(p => {
      p.addEventListener('click', () => {
        modal.querySelectorAll('[data-shape]').forEach(c => c.classList.remove('active'));
        p.classList.add('active');
        working.shape = p.dataset.shape;
      });
    });
  }

  function renderIconPicker(modal, working) {
    const grid = modal.querySelector('#tb-icon-grid');
    if (!grid) return;
    const search = modal.querySelector('#tb-icon-search');
    const query = search ? search.value.toLowerCase().trim() : '';

    const icons = TB.Data.icons || [];
    const filtered = query
      ? icons.filter(i =>
          i.label.toLowerCase().includes(query) ||
          (i.tags || []).some(t => t.includes(query)))
      : icons;

    let html = '';

    // Custom image upload tile
    html += '<label class="icon-upload-btn" for="tb-icon-upload">' +
      '<span class="icon-upload-icon">📷</span>' +
      '<span>Upload</span>' +
      '</label>' +
      '<input type="file" id="tb-icon-upload" accept="image/*" style="display:none;">';

    // Show custom image if set
    if (working.customIcon) {
      html += '<div class="icon-option active" data-custom="true" title="Your custom image">' +
        '<img src="' + working.customIcon + '" alt="">' +
        '</div>';
    }

    for (const icon of filtered) {
      const active = !working.customIcon && working.iconId === icon.id ? ' active' : '';
      const iconHtml = TB.UI.iconHTML(icon.id);
      html += '<div class="icon-option' + active + '" data-icon-id="' + icon.id + '" title="' + TB.UI.escapeHtml(icon.label) + '">' +
        iconHtml + '</div>';
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
        if (file.size > 800000) {
          TB.UI.toast('Image too large — pick one under 800KB', 'warning');
          return;
        }
        const reader = new FileReader();
        reader.onload = ev => {
          working.customIcon = ev.target.result;
          renderIconPicker(modal, working);
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function renderMetricList(modal, working) {
    const list = modal.querySelector('#tb-metric-list');
    if (!list) return;
    const all = TB.Data.metrics || [];
    const applicable = all.filter(m =>
      !m.appliesTo || m.appliesTo.includes(working.type || 'neutral'));

    let html = '';
    for (const m of applicable) {
      // Check if needed inputs are present
      const missing = (m.needsInputs || []).filter(key => {
        if (key === 'costPerUnit') {
          // accept either costPerUnit or (costPerBundle + bundleSize)
          return !(working.inputs.costPerUnit || (working.inputs.costPerBundle && working.inputs.bundleSize));
        }
        return working.inputs[key] == null || working.inputs[key] === '';
      });
      const disabled = missing.length > 0;
      const onFace = working.faceMetrics.includes(m.id);
      const cls = 'metric-toggle' + (onFace ? ' active on-face' : '');
      const star = onFace ? '★' : '☆';
      const opacity = disabled ? 'opacity:0.45;' : '';
      const note = disabled ? '<span style="color:var(--warning);"> · needs: ' + missing.join(', ') + '</span>' : '';

      html += '<div class="' + cls + '" data-metric-id="' + m.id + '" style="' + opacity + '">' +
        '  <div class="metric-toggle-info">' +
        '    <div class="metric-toggle-label">' + m.label + '</div>' +
        '    <div class="metric-toggle-desc">' + m.description + note + '</div>' +
        '  </div>' +
        '  <div class="face-star">' + star + '</div>' +
        '</div>';
    }
    list.innerHTML = html;

    list.querySelectorAll('[data-metric-id]').forEach(tEl => {
      tEl.addEventListener('click', () => {
        const id = tEl.dataset.metric;
        const mid = tEl.dataset.metricId;
        const idx = working.faceMetrics.indexOf(mid);
        if (idx > -1) {
          working.faceMetrics.splice(idx, 1);
        } else {
          if (working.faceMetrics.length >= 4) {
            TB.UI.toast('Max 4 metrics on the face — consider a larger tile', 'warning');
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

    // All applicable metrics (not just face) for detail
    const all = TB.Data.metrics || [];
    let applicable;
    if (tile.system) {
      // System tile shows its hardcoded metrics
      applicable = (tile.faceMetrics || []).map(id => ({ id, label: getMetricLabel(id) }));
    } else {
      applicable = all.filter(m =>
        (!m.appliesTo || m.appliesTo.includes(tile.type || 'neutral'))
      );
    }

    let metricsHTML = '';
    for (const m of applicable) {
      const result = TB.Metrics.compute(m.id, tile, TB.Storage.getState());
      metricsHTML += '<div class="detail-metric">' +
        '  <div class="detail-metric-label">' + m.label + '</div>' +
        '  <div class="detail-metric-value" data-metric="' + m.id + '">' + result.formatted + '</div>' +
        '</div>';
    }

    // Recent history
    const logs = (tile.logs || []).slice().sort((a, b) => b.time - a.time).slice(0, 50);
    let historyHTML = '';
    if (logs.length === 0) {
      historyHTML = '<div class="history-empty">No history yet. Tap the + on the tile to log your first one.</div>';
    } else {
      for (const l of logs) {
        const tagClass = l.type === 'lapse' ? 'lapse' : 'log';
        const tagText = l.type === 'lapse' ? 'Slip' : '+' + (l.count || 1);
        historyHTML += '<div class="history-item">' +
          '  <span class="history-item-tag ' + tagClass + '">' + tagText + '</span>' +
          '  <span>' + TB.UI.formatTime(l.time) + '</span>' +
          '  <button class="history-delete" data-log-time="' + l.time + '" title="Delete">×</button>' +
          '</div>';
      }
    }

    // Actions vary by tile type / state
    let actionsHTML = '';
    if (!tile.system) {
      if (tile.type === 'quit') {
        actionsHTML += '<button class="btn btn-secondary" data-action="log-clean">+1 ' + TB.UI.escapeHtml(tile.unitName || 'use') + ' (slipped)</button>';
        actionsHTML += '<button class="btn btn-secondary" data-action="reset-streak">Reset streak now</button>';
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

    const html = '' +
      '<div class="modal-header">' +
      '  <h2>Details</h2>' +
      '  <button class="modal-close" data-close-modal>×</button>' +
      '</div>' +
      '<div class="modal-body">' +
      '  <div class="detail-hero">' +
      '    <div class="detail-hero-icon">' + iconHtml + '</div>' +
      '    <div class="detail-hero-name">' + TB.UI.escapeHtml(tile.name) + '</div>' +
      '    <div class="detail-hero-type">' + (tile.type || 'tracker') + (tile.paused ? ' · paused' : '') + '</div>' +
      '  </div>' +
      '  <div class="detail-metrics" id="tb-detail-metrics">' + metricsHTML + '</div>' +
      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Actions</div>' +
      '    <div class="detail-actions">' + actionsHTML + '</div>' +
      '  </div>' +
      '  <div class="detail-section">' +
      '    <div class="detail-section-title">Recent activity</div>' +
      '    <div class="history-list">' + historyHTML + '</div>' +
      '  </div>' +
      '</div>';

    const modal = TB.UI.openModal(html);
    modal.dataset.tileId = tileId;

    wireDetailHandlers(modal, tile);

    // Live update metrics in detail view
    const liveInterval = setInterval(() => {
      const stillOpen = document.getElementById('tb-modal-backdrop');
      if (!stillOpen) { clearInterval(liveInterval); return; }
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
        } else if (action === 'log-clean') {
          handleQuickLog(tile.id); // re-use the confirm flow
        } else if (action === 'reset-streak') {
          TB.UI.confirm('Reset your streak timer to now? This is for manual corrections — your longest streak is preserved.', { confirmText: 'Reset', danger: true })
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
          TB.Storage.deleteTile(tile.id); // for system tiles this just hides
          TB.UI.toast('Hidden. Restore from Settings anytime — your data keeps tracking.', 'warning', 3500);
          TB.UI.closeModal();
          TB.Dashboard.refresh();
        }
      });
    });

    // History delete handlers
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

  // ===== Public renderers =====
  return {
    renderTileElement,
    openCreateModal,
    openEditModal,
    openDetail,
    handleQuickLog,
    refreshTileMetrics,
    getMetricLabel
  };
})();
