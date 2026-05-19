/* ===================================================================
   Tracking Buddy — dragdrop.js (v0.002)
   Drag-to-reorder tiles. Touch-first, iOS Safari friendly.
   =================================================================== */

var TB = window.TB = window.TB || {};

TB.DragDrop = (function () {
  let dragging = null;
  let placeholder = null;
  let startPoint = null;
  let isEditMode = false;
  let containerEl = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function setEditMode(on, container) {
    isEditMode = on;
    containerEl = container;
    if (on) {
      container.classList.add('edit-mode');
      attach();
    } else {
      container.classList.remove('edit-mode');
      detach();
    }
  }

  function attach() {
    if (!containerEl) return;
    // Touch events on individual tiles for iOS compatibility
    containerEl.querySelectorAll('.tile').forEach(tile => {
      if (tile.classList.contains('system')) return;
      tile.addEventListener('touchstart', onTouchStart, { passive: false });
      tile.addEventListener('mousedown', onMouseDown);
    });
  }

  function detach() {
    if (!containerEl) return;
    containerEl.querySelectorAll('.tile').forEach(tile => {
      tile.removeEventListener('touchstart', onTouchStart);
      tile.removeEventListener('mousedown', onMouseDown);
    });
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    cleanupDrag();
  }

  // ---- Touch handlers ----
  function onTouchStart(e) {
    if (!isEditMode) return;
    if (e.target.closest('[data-action="delete-tile"]')) return;
    if (e.touches.length !== 1) return;
    const tileEl = e.currentTarget;
    if (tileEl.classList.contains('system')) return;

    const t = e.touches[0];
    startPoint = { x: t.clientX, y: t.clientY, tileEl };

    // Begin drag immediately on touchstart in edit mode — feels snappier
    startDrag(tileEl, t.clientX, t.clientY);
    e.preventDefault();

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: false });
    document.addEventListener('touchcancel', onTouchEnd, { passive: false });
  }

  function onTouchMove(e) {
    if (!dragging) return;
    e.preventDefault();
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    moveTo(t.clientX, t.clientY);
  }

  function onTouchEnd(e) {
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchEnd);
    finishDrag();
  }

  // ---- Mouse handlers (desktop) ----
  function onMouseDown(e) {
    if (!isEditMode) return;
    if (e.button !== 0) return;
    if (e.target.closest('[data-action="delete-tile"]')) return;
    const tileEl = e.currentTarget;
    if (tileEl.classList.contains('system')) return;
    startPoint = { x: e.clientX, y: e.clientY, tileEl };
    startDrag(tileEl, e.clientX, e.clientY);
    e.preventDefault();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  function onMouseMove(e) {
    if (!dragging) return;
    e.preventDefault();
    moveTo(e.clientX, e.clientY);
  }
  function onMouseUp(e) {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    finishDrag();
  }

  // ---- Drag logic ----
  function startDrag(tileEl, x, y) {
    dragging = tileEl;
    tileEl.classList.add('dragging');

    // Create placeholder that holds the grid slot
    const rect = tileEl.getBoundingClientRect();
    placeholder = document.createElement('div');
    placeholder.className = 'tile-placeholder';
    tileEl.classList.forEach(c => { if (c.startsWith('shape-')) placeholder.classList.add(c); });
    placeholder.style.minHeight = rect.height + 'px';
    placeholder.style.background = 'transparent';
    placeholder.style.outline = '3px dashed var(--accent)';
    placeholder.style.outlineOffset = '-3px';
    placeholder.style.borderRadius = 'var(--radius-lg)';
    tileEl.parentNode.insertBefore(placeholder, tileEl);

    // Pin tile to viewport, offset so pointer stays where user grabbed
    dragOffsetX = x - rect.left;
    dragOffsetY = y - rect.top;
    tileEl.style.position = 'fixed';
    tileEl.style.top = rect.top + 'px';
    tileEl.style.left = rect.left + 'px';
    tileEl.style.width = rect.width + 'px';
    tileEl.style.height = rect.height + 'px';
    tileEl.style.zIndex = '1000';
    tileEl.style.pointerEvents = 'none';
    tileEl.style.transform = 'scale(1.05)';
    tileEl.style.transition = 'none';
  }

  function moveTo(x, y) {
    if (!dragging) return;
    dragging.style.left = (x - dragOffsetX) + 'px';
    dragging.style.top = (y - dragOffsetY) + 'px';

    // Find element under pointer
    dragging.style.visibility = 'hidden';
    const below = document.elementFromPoint(x, y);
    dragging.style.visibility = '';
    if (!below) return;

    const target = below.closest('.tile');
    if (!target || target === dragging || target === placeholder) return;
    if (target.classList.contains('system')) return;

    const targetRect = target.getBoundingClientRect();
    const placeAfter = y > targetRect.top + targetRect.height / 2;
    if (placeAfter) {
      target.parentNode.insertBefore(placeholder, target.nextSibling);
    } else {
      target.parentNode.insertBefore(placeholder, target);
    }
  }

  function finishDrag() {
    if (!dragging || !placeholder) { cleanupDrag(); return; }

    // Drop in placeholder location
    placeholder.parentNode.insertBefore(dragging, placeholder);
    placeholder.remove();
    placeholder = null;

    // Reset dragging style
    dragging.style.position = '';
    dragging.style.top = '';
    dragging.style.left = '';
    dragging.style.width = '';
    dragging.style.height = '';
    dragging.style.zIndex = '';
    dragging.style.pointerEvents = '';
    dragging.style.transform = '';
    dragging.style.transition = '';
    dragging.classList.remove('dragging');

    // Save new order
    const order = [];
    containerEl.querySelectorAll('.tile').forEach(t => order.push(t.dataset.tileId));
    TB.Storage.reorderTiles(order);

    dragging = null;
    startPoint = null;
  }

  function cleanupDrag() {
    if (dragging) {
      dragging.style.cssText = '';
      dragging.classList.remove('dragging');
      dragging = null;
    }
    if (placeholder) { placeholder.remove(); placeholder = null; }
    startPoint = null;
  }

  return { setEditMode };
})();
