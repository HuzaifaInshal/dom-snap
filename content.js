// content.js — initialises shared state; must be injected first
(function () {
  'use strict';
  if (window.__domSnapInit) return;
  window.__domSnapInit = true;

  window.__DS = {
    active:      false,
    hoveredEl:   null,
    selectedEl:  null,
    hlBox:       null,
    hlLabel:     null,
    panelHost:   null,
    preserveBg:  false,
    h2c: typeof globalThis.html2canvas === 'function'
      ? globalThis.html2canvas
      : typeof html2canvas === 'function' ? html2canvas : null,
  };
})();
