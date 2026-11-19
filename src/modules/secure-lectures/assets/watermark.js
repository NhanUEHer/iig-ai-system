(function secureLectureWatermark() {
  'use strict';

  var config = window.__SL_WATERMARK__ || {};
  var watermarkId = 'sl-trace-watermark';
  var text = String(config.text || '');
  if (!text) return;

  function create() {
    var layer = document.createElement('div');
    layer.id = watermarkId;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;inset:-45%;z-index:2147483646;pointer-events:none;overflow:hidden;'
      + 'display:grid;grid-template-columns:repeat(4,minmax(220px,1fr));gap:72px 96px;'
      + 'align-content:center;transform:rotate(-24deg);color:rgba(36,37,33,.07);'
      + 'font:700 18px system-ui,sans-serif;white-space:nowrap;user-select:none;';
    for (var index = 0; index < 32; index += 1) {
      var item = document.createElement('span');
      item.textContent = text;
      layer.appendChild(item);
    }
    return layer;
  }

  function ensure() {
    if (!document.getElementById(watermarkId)) {
      (document.body || document.documentElement).appendChild(create());
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure, { once: true });
  else ensure();
  new MutationObserver(ensure).observe(document.documentElement, { childList: true, subtree: true });
}());
