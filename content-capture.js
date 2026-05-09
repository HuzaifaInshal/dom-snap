// content-capture.js — element capture & export logic
(function () {
  'use strict';
  const DS = window.__DS;

  DS.detachOverlays = function () {
    const removed = [];
    for (const el of [DS.hlBox, DS.hlLabel]) {
      if (el && el.parentNode) { el.parentNode.removeChild(el); removed.push(el); }
    }
    return () => removed.forEach(el => document.documentElement.appendChild(el));
  };

  DS.captureElementCanvas = async function (el) {
    if (el.tagName === 'IMG') return DS.captureImgElement(el);

    // SVG elements rendered via html2canvas composite the parent background behind them.
    // Serialize the SVG directly to an image instead — gives a clean transparent render.
    if (el.tagName === 'SVG' || el.tagName === 'svg') return DS.captureSvgElement(el);

    if (DS.h2c) {
      const reattach = DS.detachOverlays();
      const restore  = DS.patchUnsupportedColors(el);
      try {
        const canvas = await DS.h2c(el, {
          scale: 2, useCORS: true, allowTaint: true, logging: false, backgroundColor: null,
        });
        restore(); reattach();
        return canvas;
      } catch (e) {
        restore(); reattach();
        console.warn('[DomSnap] html2canvas failed, using screenshot fallback:', e.message);
      }
    }
    return DS.screenshotFallback(el);
  };

  DS.captureSvgElement = function (el) {
    const r      = el.getBoundingClientRect();
    const w      = Math.round(r.width  || el.width.baseVal.value  || 100);
    const h      = Math.round(r.height || el.height.baseVal.value || 100);
    const serial = new XMLSerializer().serializeToString(el);
    const blob   = new Blob([serial], { type: 'image/svg+xml;charset=utf-8' });
    const url    = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const c   = document.createElement('canvas');
        c.width   = w * 2;   // 2× for sharpness
        c.height  = h * 2;
        const ctx = c.getContext('2d');
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); DS.screenshotFallback(el).then(resolve).catch(reject); };
      img.src = url;
    });
  };

  DS.captureImgElement = async function (el) {
    const src = el.currentSrc || el.src;
    if (!src) return DS.screenshotFallback(el);

    let dataUrl = src.startsWith('data:') ? src : null;
    if (!dataUrl) {
      try {
        const res = await chrome.runtime.sendMessage({ action: 'fetchImage', url: src });
        if (res.success) dataUrl = res.dataUrl;
      } catch (_) {}
    }

    if (dataUrl) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth  || img.width;
          const h = img.naturalHeight || img.height;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c);
        };
        img.onerror = () => DS.screenshotFallback(el).then(resolve).catch(reject);
        img.src = dataUrl;
      });
    }
    return DS.screenshotFallback(el);
  };

  DS.patchUnsupportedColors = function (root) {
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = 1;
    const ctx = tmp.getContext('2d');

    function resolveColor(val) {
      if (!val) return null;
      const low = val.toLowerCase();
      if (!low.includes('oklch') && !low.includes('oklab') &&
          !low.includes('lch(')  && !low.includes('lab('))  return null;
      try {
        ctx.fillStyle = '#000';
        ctx.fillStyle = val;
        const rgb = ctx.fillStyle;
        return rgb !== '#000000' ? rgb : null;
      } catch (_) { return null; }
    }

    function resolveInString(str) {
      if (!str) return null;
      const low = str.toLowerCase();
      if (!low.includes('oklch') && !low.includes('oklab') &&
          !low.includes('lch(')  && !low.includes('lab('))  return null;
      const patched = str.replace(/(oklch|oklab|lch|lab)\([^)]*\)/gi, m => resolveColor(m) || m);
      return patched !== str ? patched : null;
    }

    const SOLID = [
      'color', 'background-color',
      'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
      'outline-color', 'text-decoration-color', 'caret-color', 'fill', 'stroke',
    ];
    const STR = ['background-image', 'box-shadow', 'text-shadow'];
    const patches = [];

    for (const el of [root, ...root.querySelectorAll('*')]) {
      const cs = getComputedStyle(el);
      const saved = {};
      let hit = false;
      for (const p of SOLID) {
        const resolved = resolveColor(cs.getPropertyValue(p));
        if (resolved) { saved[p] = el.style.getPropertyValue(p); el.style.setProperty(p, resolved, 'important'); hit = true; }
      }
      for (const p of STR) {
        const resolved = resolveInString(cs.getPropertyValue(p));
        if (resolved) { saved[p] = el.style.getPropertyValue(p); el.style.setProperty(p, resolved, 'important'); hit = true; }
      }
      if (hit) patches.push({ el, saved });
    }

    return function restore() {
      for (const { el, saved } of patches) {
        for (const [p, orig] of Object.entries(saved)) {
          if (orig) el.style.setProperty(p, orig);
          else      el.style.removeProperty(p);
        }
      }
    };
  };

  DS.screenshotFallback = async function (el) {
    await DS.waitFrames(2);
    const r   = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const rw  = r.width  > 0 ? r.width  : (el.offsetWidth  || 1);
    const rh  = r.height > 0 ? r.height : (el.offsetHeight || 1);
    const res = await chrome.runtime.sendMessage({
      action: 'captureTab',
      rect: { x: r.left, y: r.top, width: rw, height: rh },
      scale: dpr, format: 'png',
    });
    if (!res.success) throw new Error(res.error || 'Screenshot failed');
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c);
      };
      img.src = res.dataUrl;
    });
  };

  DS.exportSVG = async function (el) {
    const r     = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    DS.inlineComputedStyles(el, clone);
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}">`,
      `<foreignObject width="100%" height="100%">`,
      `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;width:${r.width}px;height:${r.height}px;overflow:hidden">`,
      clone.outerHTML,
      `</div></foreignObject></svg>`,
    ].join('\n');
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    return URL.createObjectURL(blob);
  };

  DS.inlineComputedStyles = function (source, target) {
    const apply = (src, tgt) => {
      const cs = window.getComputedStyle(src);
      let s = '';
      for (let i = 0; i < cs.length; i++) s += `${cs[i]}:${cs.getPropertyValue(cs[i])};`;
      tgt.style.cssText = s;
    };
    apply(source, target);
    const srcKids = source.querySelectorAll('*');
    const tgtKids = target.querySelectorAll('*');
    const len = Math.min(srcKids.length, tgtKids.length);
    for (let i = 0; i < len; i++) apply(srcKids[i], tgtKids[i]);
  };

  DS.capturePreview = async function (el) {
    if (el.tagName === 'IMG' && el.src) return el.src;

    // With background: Chrome tab screenshot — hide panel first so it doesn't appear in shot
    if (DS.preserveBg) {
      if (DS.panelHost) DS.panelHost.style.visibility = 'hidden';
      await DS.waitFrames(2);
      const r   = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      try {
        const res = await chrome.runtime.sendMessage({
          action: 'captureTab',
          rect: { x: r.left, y: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) },
          scale: dpr, format: 'png',
        });
        if (DS.panelHost) DS.panelHost.style.visibility = '';
        if (res.success) return res.dataUrl;
      } catch (_) {
        if (DS.panelHost) DS.panelHost.style.visibility = '';
      }
      return null;
    }

    // No background — SVG: direct serialization (transparent, no parent bg)
    if (el.tagName === 'SVG' || el.tagName === 'svg') {
      try {
        const c = await DS.captureSvgElement(el);
        return c.toDataURL('image/png');
      } catch (_) {}
    }

    // No background — html2canvas transparent render
    if (DS.h2c) {
      const reattach = DS.detachOverlays();
      const restore  = DS.patchUnsupportedColors(el);
      try {
        const canvas = await DS.h2c(el, {
          scale: 1, useCORS: true, allowTaint: true, logging: false, backgroundColor: null,
        });
        restore(); reattach();
        return canvas.toDataURL('image/png');
      } catch (_) { restore(); reattach(); }
    }
    await DS.waitFrames(1);
    const r   = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'captureTab',
        rect: { x: r.left, y: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) },
        scale: dpr, format: 'png',
      });
      if (res.success) return res.dataUrl;
    } catch (_) {}
    return null;
  };

  DS.writeClipboard = async function (dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  };

  DS.triggerDownload = async function (url, name) {
    if (url.startsWith('blob:')) {
      const blob  = await fetch(url).then(r => r.blob());
      const buf   = await blob.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary  = '';
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      url = `data:${blob.type};base64,${btoa(binary)}`;
      URL.revokeObjectURL(url);
    }
    chrome.runtime.sendMessage({ action: 'download', url, filename: name });
  };
})();
