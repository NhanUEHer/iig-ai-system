(function secureLectureGuard() {
  'use strict';

  var EDITABLE = 'input, textarea, [contenteditable="true"]';

  function isEditable(target) {
    return Boolean(target && target.closest && target.closest(EDITABLE));
  }

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function blockedKey(event) {
    var key = String(event.key || '').toLowerCase();
    var command = event.ctrlKey || event.metaKey;
    return key === 'f12'
      || (command && event.shiftKey && ['i', 'j', 'c'].indexOf(key) >= 0)
      || (command && ['u', 's', 'p'].indexOf(key) >= 0)
      || (event.metaKey && event.altKey && ['i', 'j', 'u'].indexOf(key) >= 0);
  }

  document.addEventListener('contextmenu', stop, true);
  document.addEventListener('dragstart', stop, true);
  document.addEventListener('selectstart', function (event) {
    if (!isEditable(event.target)) stop(event);
  }, true);
  ['copy', 'cut'].forEach(function (name) {
    document.addEventListener(name, function (event) {
      if (!isEditable(event.target)) stop(event);
    }, true);
  });
  document.addEventListener('keydown', function (event) {
    if (blockedKey(event)) stop(event);
  }, true);

  var printStyle = document.createElement('style');
  printStyle.textContent = '@media print { body { display:none !important; } }';
  (document.head || document.documentElement).appendChild(printStyle);
  window.addEventListener('beforeprint', function () {
    document.documentElement.setAttribute('data-sl-print-blocked', 'true');
  });
  window.addEventListener('afterprint', function () {
    document.documentElement.removeAttribute('data-sl-print-blocked');
  });

  // The page is served with a CSP sandbox, so its origin is opaque ("null").
  // DevTools detection lives in the parent viewer page: inside an iframe,
  // outerWidth/innerWidth compare the whole window to the frame and would
  // always look suspicious. The parent tells us when to hide the content.
  var overlayId = 'sl-content-protection-overlay';
  function setHidden(hidden) {
    var overlay = document.getElementById(overlayId);
    if (!hidden) { if (overlay) overlay.remove(); return; }
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.setAttribute('aria-live', 'polite');
    overlay.textContent = 'Đã tạm ẩn nội dung';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;'
      + 'background:rgba(30,31,28,.96);color:#fff;font:600 18px system-ui,sans-serif;';
    (document.body || document.documentElement).appendChild(overlay);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data) return;
    if (event.data.type === 'sl:hide') setHidden(Boolean(event.data.hidden));
  });
}());
