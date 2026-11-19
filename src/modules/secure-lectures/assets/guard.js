function parseSecureLectureSlideHash(hash) {
  var value = String(hash || '');
  var match = /^#(?:slide)?(\d+)$/i.exec(value);
  if (match) return `slide-${Number(match[1])}`;
  return value || 'default';
}

if (typeof module === 'object' && module.exports) module.exports = { parseSecureLectureSlideHash };

if (typeof window !== 'undefined' && typeof document !== 'undefined') (function secureLectureGuard() {
  'use strict';

  var EDITABLE = 'input, textarea, [contenteditable="true"]';
  var drawingMode = false;
  var lastSlideKey;

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

  function presenterKey(event) {
    var key = String(event.key || '').toLowerCase();
    var command = event.ctrlKey || event.metaKey;
    return ['v', 'p', 'h', 't', 'a', 'r', 'o', 'e', 'l', 'w', 'n', 'escape'].indexOf(key) >= 0
      || (command && (key === 'z' || key === 'y'));
  }

  function reportSlide() {
    var key = parseSecureLectureSlideHash(window.location.hash);
    if (key === lastSlideKey) return;
    lastSlideKey = key;
    window.parent.postMessage({ type: 'sl:slide', key: key }, '*');
  }

  ['pushState', 'replaceState'].forEach(function (name) {
    var original = window.history[name];
    if (typeof original !== 'function') return;
    window.history[name] = function () {
      var result = original.apply(this, arguments);
      reportSlide();
      return result;
    };
  });
  window.addEventListener('hashchange', reportSlide);
  reportSlide();

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || !event.data) return;
    if (event.data.type === 'sl:tool') drawingMode = event.data.drawing === true;
    if (event.data.type === 'sl:request-slide') {
      window.parent.postMessage({ type: 'sl:slide', key: parseSecureLectureSlideHash(window.location.hash) }, '*');
    }
  });

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
    if (blockedKey(event)) { stop(event); return; }
    if (isEditable(event.target) || !presenterKey(event)) return;
    window.parent.postMessage({
      type: 'sl:key',
      key: event.key,
      ctrl: Boolean(event.ctrlKey || event.metaKey),
      shift: Boolean(event.shiftKey),
    }, '*');
    if (drawingMode) stop(event);
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
