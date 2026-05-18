/* ===================================================================
   Tracking Buddy — dragdrop.js
   Drag-to-reorder tiles. Mobile: long-press to start. Desktop: drag in edit mode.
   =================================================================== */

var TB = window.TB = window.TB || {};

TB.DragDrop = (function () {
  let dragging = null;
  let placeholder = null;
  let startPoint = null;
  let longPressTimer = null;
  let isEditMode = false;
  let containerEl = null;

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
    // Pointer events handle both mouse and touch uniformly
    containerEl.addEventListener('pointerdown', onPointerDown);
  }

  function detach() {
    if (!containerEl) return;
    containerEl.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    if (longPressTimer) clearTimeout(longPressTimer);
    cleanupDrag();
  }

  function onPointerDown(e) {
    // Must be in edit mode and click on a tile (not the delete button)
    if (!isEditMode) return;
    if (e.target.closest('[data-action="delete-tile"]')) return;
    const tileEl = e.target.closest('.tile');
    if (!tileEl || tileEl.classList.contains('system')) return; // don't drag system tile

    startPoint = { x: e.clientX, y: e.clientY, tileEl, pointerId: e.pointerId };

    // Slight delay before locking drag so taps aren't accidentally drags
    longPressTimer = setTimeout(() => {
      startDrag(tileEl, e);
    }, 150);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function startDrag(tileEl, e) {
    dragging = tileEl;
    tileEl.classList.add('dragging');
    // Create placeholder (invisible spacer that takes the tile's grid spot)
    placeholder = document.createElement('div');
    placeholder.className = 'tile-placeholder';
    placeholder.style.cssText = 'visibility:hidden;';
    // Copy shape class for grid sizing
    tileEl.classList.forEach(c => { if (c.startsWith('shape-')) placeholder.classList.add(c); });
    placeholder.style.minHeight = tileEl.offsetHeight + 'px';
    tileEl.parentNode.insertBefore(placeholder, tileEl);

    // Position the dragged tile absolutely under the pointer
    const rect = tileEl.getBoundingClientRect();
    tileEl.style.position = 'fixed';
    tileEl.style.top = rect.top + 'px';
    tileEl.style.left = rect.left + 'px';
    tileEl.style.width = rect.width + 'px';
    tileEl.style.height = rect.height + 'px';
    tileEl.style.zIndex = '1000';
    tileEl.style.pointerEvents = 'none';
    tileEl.style.transform = 'scale(1.05)';
  }

  function onPointerMove(e) {
    if (!startPoint) return;
    const dx = e.clientX - startPoint.x;
    const dy = e.clientY - startPoint.y;
    // If the user moved without long-press triggering, cancel long-press (they may be scrolling)
    if (!dragging && Math.sqrt(dx * dx + dy * dy) > 10) {
      // Begin drag immediately on movement past threshold
      clearTimeout(longPressTimer);
      startDrag(startPoint.tileEl, e);
    }

    if (!dragging) return;
    e.preventDefault();

    // Move tile to pointer
    const rect = dragging.getBoundingClientRect();
    const offsetX = e.clientX - (rect.left + rect.width / 2);
    const offsetY = e.clientY - (rect.top + rect.height / 2);
    dragging.style.left = (parseFloat(dragging.style.left) + offsetX) + 'px';
    dragging.style.top = (parseFloat(dragging.style.top) + offsetY) + 'px';

    // Find tile under pointer
    dragging.style.display = 'none';
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    dragging.style.display = '';
    const targetTile = elementBelow ? elementBelow.closest('.tile') : null;
    if (targetTile && targetTile !== dragging && targetTile !== placeholder &&
        !targetTile.classList.contains('system')) {
      // Move placeholder to before/after the target
      const targetRect = targetTile.getBoundingClientRect();
      const midX = targetRect.left + targetRect.width / 2;
      const midY = targetRect.top + targetRect.height / 2;
      const placeAfter = e.clientX > midX || e.clientY > midY;
      if (placeAfter) {
        targetTile.parentNode.insertBefore(placeholder, targetTile.nextSibling);
      } else {
        targetTile.parentNode.insertBefore(placeholder, targetTile);
      }
    }
  }

  function onPointerUp(e) {
    clearTimeout(longPressTimer);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);

    if (dragging && placeholder) {
      // Drop dragging in placeholder's spot
      placeholder.parentNode.insertBefore(dragging, placeholder);
      placeholder.remove();
      placeholder = null;

      // Reset styles
      dragging.style.position = '';
      dragging.style.top = '';
      dragging.style.left = '';
      dragging.style.width = '';
      dragging.style.height = '';
      dragging.style.zIndex = '';
      dragging.style.pointerEvents = '';
      dragging.style.transform = '';
      dragging.classList.remove('dragging');

      // Compute new order and save
      const order = [];
      const tiles = containerEl.querySelectorAll('.tile');
      tiles.forEach(t => order.push(t.dataset.tileId));
      TB.Storage.reorderTiles(order);

      dragging = null;
    }
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
