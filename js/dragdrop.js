/* ===================================================================
   Tracking Buddy — dragdrop.js (v0.003)
   Drag-to-reorder tiles. Touch-first, iOS Safari friendly.

   Strategy: delegation at the grid level (not per-tile). Listeners
   are attached once when the grid mounts and stay; we just check
   editMode flag inside the handler. This avoids iOS Safari's
   inconsistent passive-listener registration mid-gesture.
   =================================================================== */

var TB = window.TB = window.TB || {};

TB.DragDrop = (function () {
  let dragging = null;       // the tile element being dragged
  let placeholder = null;    // DOM placeholder holding the grid slot
  let isEditMode = false;
  let containerEl = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let touchStarted = false;  // guards against duplicate touch/mouse on hybrid devices
  let listenersAttached = false;

  function setEditMode(on, container) {
    isEditMode = on;
    containerEl = container;
    if (on) {
      container.classList.add('edit-mode');
      attachOnce();
    } else {
      container.classList.remove('edit-mode');
      // Don't detach — listeners are cheap to leave attached and they short-circuit on !isEditMode
      cleanupDrag();
    }
  }

  // Attach grid-level listeners exactly once per container lifetime.
  function attachOnce() {
    if (!containerEl) return;
    if (listenersAttached && containerEl._tbDragAttached) return;

    // Touch — register at grid level with passive: false so we can preventDefault
    containerEl.addEventListener('touchstart', onTouchStart, { passive: false });
    containerEl.addEventListener('touchmove', onTouchMove, { passive: false });
    containerEl.addEventListener('touchend', onTouchEnd, { passive: false });
    containerEl.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Mouse for desktop
    containerEl.addEventListener('mousedown', onMouseDown);

    containerEl._tbDragAttached = true;
    listenersAttached = true;
  }

  // ---- Touch handlers ----
  function onTouchStart(e) {
    if (!isEditMode) return;
    if (e.touches.length !== 1) return;

    const target = e.target;
    // Ignore taps on the delete-X corner button
    if (target.closest && target.closest('[data-action="delete-tile"]')) return;

    // Find the tile root from event target (works even if touch starts on a child element)
    const tileEl = target.closest && target.closest('.tile');
    if (!tileEl) return;
    if (tileEl.classList.contains('system')) return;
    if (!containerEl.contains(tileEl)) return;

    touchStarted = true;
    const t = e.touches[0];
    startDrag(tileEl, t.clientX, t.clientY);
    e.preventDefault();
    e.stopPropagation();
  }

  function onTouchMove(e) {
    if (!isEditMode || !dragging) return;
    if (e.touches.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    const t = e.touches[0];
    moveTo(t.clientX, t.clientY);
  }

  function onTouchEnd(e) {
    if (!isEditMode) return;
    if (!dragging) return;
    e.preventDefault();
    finishDrag();
    // Allow a moment before allowing mouse events again (hybrid devices)
    setTimeout(() => { touchStarted = false; }, 350);
  }

  // ---- Mouse handlers (desktop) ----
  function onMouseDown(e) {
    if (!isEditMode) return;
    if (touchStarted) return;
    if (e.button !== 0) return;
    const target = e.target;
    if (target.closest && target.closest('[data-action="delete-tile"]')) return;
    const tileEl = target.closest && target.closest('.tile');
    if (!tileEl) return;
    if (tileEl.classList.contains('system')) return;
    if (!containerEl.contains(tileEl)) return;

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
    if (!dragging) return;
    finishDrag();
  }

  // ---- Drag logic ----
  function startDrag(tileEl, x, y) {
    dragging = tileEl;
    tileEl.classList.add('dragging');

    const rect = tileEl.getBoundingClientRect();

    // Placeholder holds the grid slot during drag
    placeholder = document.createElement('div');
    placeholder.className = 'tile-placeholder';
    tileEl.classList.forEach(c => { if (c.startsWith('shape-')) placeholder.classList.add(c); });
    placeholder.style.minHeight = rect.height + 'px';
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
    tileEl.style.animation = 'none'; // stop wiggle on the one being dragged

    // Provide haptic on supported devices
    if (navigator.vibrate) navigator.vibrate(15);
  }

  function moveTo(x, y) {
    if (!dragging) return;
    dragging.style.left = (x - dragOffsetX) + 'px';
    dragging.style.top = (y - dragOffsetY) + 'px';

    // Find element under pointer (hide dragging tile temporarily so hit-test sees what's behind)
    const prevVis = dragging.style.visibility;
    dragging.style.visibility = 'hidden';
    const below = document.elementFromPoint(x, y);
    dragging.style.visibility = prevVis;
    if (!below) return;

    const target = below.closest && below.closest('.tile');
    if (!target || target === dragging || target === placeholder) return;
    if (target.classList.contains('system')) return;
    if (!containerEl.contains(target)) return;

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

    placeholder.parentNode.insertBefore(dragging, placeholder);
    placeholder.remove();
    placeholder = null;

    dragging.style.position = '';
    dragging.style.top = '';
    dragging.style.left = '';
    dragging.style.width = '';
    dragging.style.height = '';
    dragging.style.zIndex = '';
    dragging.style.pointerEvents = '';
    dragging.style.transform = '';
    dragging.style.transition = '';
    dragging.style.animation = '';
    dragging.classList.remove('dragging');

    // Persist new order
    const order = [];
    containerEl.querySelectorAll('.tile').forEach(t => order.push(t.dataset.tileId));
    TB.Storage.reorderTiles(order);

    dragging = null;
  }

  function cleanupDrag() {
    if (dragging) {
      dragging.style.cssText = '';
      dragging.classList.remove('dragging');
      dragging = null;
    }
    if (placeholder) { placeholder.remove(); placeholder = null; }
  }

  return { setEditMode };
})();
