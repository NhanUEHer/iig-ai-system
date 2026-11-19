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

  // DevTools detection runs in the parent viewer and only writes an audit log.
  // It must never blank, lock or terminate a lecture because the heuristic has
  // unavoidable false positives in embedded browsers and side panels.
}());
