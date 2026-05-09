// content-utils.js — shared helpers & toast
(function () {
  'use strict';
  const DS = window.__DS;

  DS.isOwn = function (el) {
    return !!(el && el.closest &&
      el.closest('#domsnap-panel-host, #domsnap-highlight, #domsnap-label, #domsnap-toast'));
  };

  DS.remove = function (el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };

  DS.waitFrames = function (n) {
    return new Promise(resolve => {
      let count = 0;
      const tick = () => { if (++count >= n) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  };

  DS.toast = function (msg, type = 'info') {
    const existing = document.getElementById('domsnap-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'domsnap-toast';
    t.setAttribute('data-type', type);
    t.textContent = msg;
    document.documentElement.appendChild(t);
    setTimeout(() => {
      t.classList.add('domsnap-toast-out');
      setTimeout(() => t.remove(), 320);
    }, 2800);
  };
})();
