/* ===================================================================
   Tracking Buddy — ui.js
   Shared UI helpers: toasts, modals, confetti, image fallbacks.
   =================================================================== */

const TB = window.TB = window.TB || {};

TB.UI = (function () {
  // ===== Toast =====
  function ensureToastContainer() {
    let c = document.querySelector('.toast-container');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toast-container';
      document.body.appendChild(c);
    }
    return c;
  }

  function toast(message, kind, duration) {
    const c = ensureToastContainer();
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = message;
    c.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transition = 'opacity 0.25s';
      setTimeout(() => t.remove(), 300);
    }, duration || 2200);
  }

  // ===== Confetti =====
  function confetti(opts) {
    opts = opts || {};
    const count = opts.count || 35;
    const colors = ['#FF7849', '#FFB627', '#4CB944', '#3498DB', '#9D7FE0', '#FF8FA3'];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + '%';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.4) + 's';
      piece.style.animationDuration = (1.8 + Math.random() * 1.2) + 's';
      piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      piece.style.transform = 'rotate(' + (Math.random() * 360) + 'deg)';
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3500);
    }
  }

  // ===== Image fallback =====
  // Returns an HTML string for a tile/preset/etc icon, with emoji fallback when image fails
  function iconHTML(iconId, customIconData, emojiFallback) {
    const icons = TB.Data ? TB.Data.icons : null;
    const icon = icons && icons.find ? icons.find(i => i.id === iconId) : null;
    const emoji = emojiFallback || (icon && icon.emoji) || '⭐';

    // Custom uploaded icon takes priority
    if (customIconData) {
      const safe = customIconData.replace(/"/g, '&quot;');
      return '<img src="' + safe + '" alt="" onerror="this.outerHTML=\'<span class=tile-icon-emoji>' + emoji + '</span>\'">';
    }

    if (icon && icon.filename) {
      // Try to load image, fall back to emoji on error
      return '<img src="assets/icons/' + icon.filename + '" alt="" ' +
             'onerror="this.outerHTML=\'<span class=tile-icon-emoji>' + emoji + '</span>\'">';
    }

    return '<span class="tile-icon-emoji">' + emoji + '</span>';
  }

  // Mascot HTML with emoji fallback (turtle for Tally)
  function mascotHTML(variant) {
    variant = variant || 'hero';
    const filename = 'mascot-' + variant + '.png';
    return '<img src="assets/mascot/' + filename + '" alt="Tally" ' +
           'onerror="this.outerHTML=\'<span style=\\\'font-size:0.85em\\\'>🐢</span>\'">';
  }

  // ===== Modal management =====
  let activeModalCloseHandler = null;

  function openModal(contentHTML, opts) {
    opts = opts || {};
    closeModal();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'tb-modal-backdrop';

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-grip"></div>' + contentHTML;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';

    // Close on backdrop click
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && !opts.persistent) closeModal();
    });

    // Close on Escape
    const esc = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', esc);
    activeModalCloseHandler = () => document.removeEventListener('keydown', esc);

    // Wire close buttons
    modal.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal());
    });

    return modal;
  }

  function closeModal() {
    const backdrop = document.getElementById('tb-modal-backdrop');
    if (backdrop) {
      backdrop.style.opacity = '0';
      backdrop.style.transition = 'opacity 0.2s';
      setTimeout(() => {
        backdrop.remove();
        document.body.style.overflow = '';
      }, 220);
    }
    if (activeModalCloseHandler) { activeModalCloseHandler(); activeModalCloseHandler = null; }
  }

  function confirm(message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const html = '' +
        '<div class="modal-header">' +
        '  <h2>' + (opts.title || 'Are you sure?') + '</h2>' +
        '  <button class="modal-close" data-close-modal>×</button>' +
        '</div>' +
        '<div class="modal-body">' +
        '  <p style="font-size:0.95rem; line-height:1.5;">' + message + '</p>' +
        '</div>' +
        '<div class="modal-footer">' +
        '  <button class="btn btn-secondary" data-action="cancel">' + (opts.cancelText || 'Cancel') + '</button>' +
        '  <button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-action="confirm">' + (opts.confirmText || 'Confirm') + '</button>' +
        '</div>';
      const modal = openModal(html);
      modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        closeModal(); resolve(false);
      });
      modal.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        closeModal(); resolve(true);
      });
      modal.querySelector('.modal-close').addEventListener('click', () => {
        resolve(false);
      });
    });
  }

  function prompt(label, defaultValue, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const html = '' +
        '<div class="modal-header">' +
        '  <h2>' + (opts.title || 'Enter a value') + '</h2>' +
        '  <button class="modal-close" data-close-modal>×</button>' +
        '</div>' +
        '<div class="modal-body">' +
        '  <div class="field">' +
        '    <label>' + label + '</label>' +
        '    <input type="text" id="tb-prompt-input" value="' + (defaultValue || '').replace(/"/g, '&quot;') + '">' +
        '  </div>' +
        '</div>' +
        '<div class="modal-footer">' +
        '  <button class="btn btn-secondary" data-action="cancel">Cancel</button>' +
        '  <button class="btn btn-primary" data-action="confirm">' + (opts.confirmText || 'OK') + '</button>' +
        '</div>';
      const modal = openModal(html);
      const input = modal.querySelector('#tb-prompt-input');
      setTimeout(() => { input.focus(); input.select(); }, 100);
      const submit = () => {
        const v = input.value.trim();
        closeModal();
        resolve(v || null);
      };
      modal.querySelector('[data-action="confirm"]').addEventListener('click', submit);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      modal.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        closeModal(); resolve(null);
      });
      modal.querySelector('.modal-close').addEventListener('click', () => resolve(null));
    });
  }

  // ===== Escape HTML for safe insertion =====
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===== Format date for history =====
  function formatTime(t) {
    const d = new Date(t);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (sameDay) return 'Today, ' + timeStr;
    if (isYesterday) return 'Yesterday, ' + timeStr;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + timeStr;
  }

  return {
    toast, confetti,
    iconHTML, mascotHTML,
    openModal, closeModal, confirm, prompt,
    escapeHtml, formatTime
  };
})();
