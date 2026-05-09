// content.js — element inspector & capture UI

(function () {
  'use strict';

  if (window.__domSnapInit) return;
  window.__domSnapInit = true;

  // ─── State ────────────────────────────────────────────────────────────────
  let active = false;
  let hoveredEl = null;
  let selectedEl = null;
  let hlBox = null;
  let hlLabel = null;
  let panelHost = null;

  // ─── Message bridge ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.action === 'toggle') {
      active ? stop() : start();
      reply({ active });
    } else if (msg.action === 'getStatus') {
      reply({ active });
    }
    return false;
  });

  // ─── Activation ───────────────────────────────────────────────────────────
  function start() {
    active = true;
    mountOverlays();
    document.addEventListener('mouseover', onHover,  true);
    document.addEventListener('click',     onSelect, true);
    document.addEventListener('keydown',   onKey,    true);
    document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
    toast('DomSnap active — hover to inspect, click to capture  •  ESC to exit');
    chrome.runtime.sendMessage({ action: 'statusChanged', active: true });
  }

  function stop() {
    active = false;
    hoveredEl = null;
    selectedEl = null;
    remove(hlBox);    hlBox = null;
    remove(hlLabel);  hlLabel = null;
    hidePanel();
    document.removeEventListener('mouseover', onHover,  true);
    document.removeEventListener('click',     onSelect, true);
    document.removeEventListener('keydown',   onKey,    true);
    document.documentElement.style.removeProperty('cursor');
    chrome.runtime.sendMessage({ action: 'statusChanged', active: false });
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  function onHover(e) {
    if (!active || isOwn(e.target)) return;
    if (e.target === hoveredEl) return;
    hoveredEl = e.target;
    moveHighlight(hoveredEl);
  }

  function onSelect(e) {
    if (!active || isOwn(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    selectedEl = e.target;
    hlBox.style.setProperty('display', 'none', 'important');
    hlLabel.style.setProperty('display', 'none', 'important');
    showPanel(selectedEl);
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (selectedEl) {
      selectedEl = null;
      hidePanel();
      if (hoveredEl) moveHighlight(hoveredEl);
    } else {
      stop();
    }
  }

  // ─── Highlight overlay ────────────────────────────────────────────────────
  function mountOverlays() {
    if (!hlBox) {
      hlBox = document.createElement('div');
      hlBox.id = 'domsnap-highlight';
      document.documentElement.appendChild(hlBox);
    }
    if (!hlLabel) {
      hlLabel = document.createElement('div');
      hlLabel.id = 'domsnap-label';
      document.documentElement.appendChild(hlLabel);
    }
  }

  function moveHighlight(el) {
    if (!hlBox || !hlLabel) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    hlBox.style.setProperty('display', 'block', 'important');
    hlBox.style.setProperty('left',   `${r.left}px`,   'important');
    hlBox.style.setProperty('top',    `${r.top}px`,    'important');
    hlBox.style.setProperty('width',  `${r.width}px`,  'important');
    hlBox.style.setProperty('height', `${r.height}px`, 'important');

    const tag = el.tagName.toLowerCase();
    const id  = el.id ? `#${el.id}` : '';
    const cls = el.classList.length
      ? '.' + [...el.classList].slice(0, 2).join('.')
      : '';
    const w = Math.round(r.width);
    const h = Math.round(r.height);

    hlLabel.textContent = `${tag}${id}${cls}  ${w}×${h}`;
    hlLabel.style.setProperty('display', 'block', 'important');

    const lh = 26;
    const below = r.bottom + 6;
    const above = r.top - lh - 6;
    const top = below + lh < window.innerHeight ? below : Math.max(4, above);
    const left = Math.min(r.left, window.innerWidth - 320);
    hlLabel.style.setProperty('top',  `${top}px`,  'important');
    hlLabel.style.setProperty('left', `${Math.max(4, left)}px`, 'important');
  }

  // ─── Panel (Shadow DOM) ───────────────────────────────────────────────────
  function showPanel(el) {
    if (!panelHost) buildPanel();

    const r   = el.getBoundingClientRect();
    const tag = el.tagName.toLowerCase();
    const id  = el.id ? `#${el.id}` : '';
    const cls = el.classList.length
      ? '.' + [...el.classList].slice(0, 3).join('.')
      : '';

    const shadow = panelHost.shadowRoot;
    shadow.querySelector('.ds-el-name').textContent = `${tag}${id}${cls}`;
    shadow.querySelector('.ds-el-size').textContent =
      `${Math.round(r.width)} × ${Math.round(r.height)} px`;

    placePanel(r);
    panelHost.style.display = 'block';
    requestAnimationFrame(() => {
      shadow.querySelector('.ds-panel').classList.add('ds-open');
    });
  }

  function hidePanel() {
    if (!panelHost) return;
    panelHost.shadowRoot.querySelector('.ds-panel').classList.remove('ds-open');
    setTimeout(() => { if (panelHost) panelHost.style.display = 'none'; }, 220);
  }

  function placePanel(elRect) {
    const W = 300, H = 250, GAP = 14;
    const vw = window.innerWidth, vh = window.innerHeight;
    let l, t;

    if (elRect.right + W + GAP < vw)       { l = elRect.right + GAP;        t = elRect.top; }
    else if (elRect.left - W - GAP > 0)    { l = elRect.left - W - GAP;     t = elRect.top; }
    else if (elRect.bottom + H + GAP < vh) { l = elRect.left;                t = elRect.bottom + GAP; }
    else                                    { l = vw - W - GAP;              t = GAP; }

    l = Math.max(GAP, Math.min(l, vw - W - GAP));
    t = Math.max(GAP, Math.min(t, vh - H - GAP));
    panelHost.style.left = `${l}px`;
    panelHost.style.top  = `${t}px`;
  }

  function buildPanel() {
    panelHost = document.createElement('div');
    panelHost.id = 'domsnap-panel-host';
    Object.assign(panelHost.style, {
      position: 'fixed',
      zIndex: '2147483647',
      display: 'none',
      width: '300px'
    });
    document.documentElement.appendChild(panelHost);

    const shadow = panelHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = PANEL_HTML;

    // Close
    shadow.getElementById('ds-close').onclick = () => {
      selectedEl = null;
      hidePanel();
      if (hoveredEl) moveHighlight(hoveredEl);
    };

    // Format buttons
    shadow.querySelectorAll('[data-fmt]').forEach(btn => {
      btn.addEventListener('click', () => doCapture(btn.dataset.fmt));
    });

    // Clipboard
    shadow.getElementById('ds-clip').addEventListener('click', () => doCapture('clipboard'));

    // Drag
    makeDraggable(panelHost, shadow.getElementById('ds-drag-handle'));
  }

  // ─── Drag ─────────────────────────────────────────────────────────────────
  function makeDraggable(host, handle) {
    let ox, oy, ol, ot;
    handle.addEventListener('mousedown', e => {
      if (e.target.closest('#ds-close')) return;
      e.preventDefault();
      ox = e.clientX; oy = e.clientY;
      ol = parseInt(host.style.left) || 0;
      ot = parseInt(host.style.top)  || 0;
      const move = ev => {
        host.style.left = `${ol + ev.clientX - ox}px`;
        host.style.top  = `${ot + ev.clientY - oy}px`;
      };
      const up = () => {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup',   up,   true);
      };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup',   up,   true);
    });
  }

  // ─── Capture flow ─────────────────────────────────────────────────────────
  async function doCapture(fmt) {
    if (!selectedEl) return;
    const el = selectedEl;
    const shadow = panelHost.shadowRoot;
    const loading = shadow.getElementById('ds-loading');
    loading.classList.add('ds-show');

    try {
      let dataUrl;

      if (fmt === 'svg') {
        dataUrl = await exportSVG(el);
      } else {
        if (!el.isConnected) {
          throw new Error('Element was removed from the page — please re-select.');
        }

        // Hide DomSnap overlays so they don't bleed into the render
        if (hlBox)   hlBox.style.setProperty('display', 'none', 'important');
        if (hlLabel) hlLabel.style.setProperty('display', 'none', 'important');
        panelHost.style.visibility = 'hidden';

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: null,
        });

        panelHost.style.visibility = '';

        dataUrl = fmt === 'jpg'
          ? canvas.toDataURL('image/jpeg', 0.95)
          : canvas.toDataURL('image/png');

        if (fmt === 'favicon') {
          loading.classList.remove('ds-show');
          flashSuccess('Building favicon.zip…');
          await doFaviconBundle(dataUrl);
          flashSuccess('favicon.zip downloaded!');
          setTimeout(() => { selectedEl = null; hidePanel(); }, 1800);
          return;
        }
      }

      loading.classList.remove('ds-show');

      if (fmt === 'clipboard') {
        await writeClipboard(dataUrl);
        flashSuccess('Copied to clipboard!');
        toast('Copied to clipboard!', 'success');
      } else {
        const ext  = fmt === 'svg' ? 'svg' : fmt;
        const name = `domsnap-${Date.now()}.${ext}`;
        await triggerDownload(dataUrl, name);
        flashSuccess(`Saved: ${name}`);
        setTimeout(() => { selectedEl = null; hidePanel(); }, 1600);
      }
    } catch (err) {
      loading.classList.remove('ds-show');
      if (panelHost) panelHost.style.visibility = '';
      console.error('[DomSnap]', err);
      toast(err.message, 'error');
    }
  }

  async function exportSVG(el) {
    const r     = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    inlineComputedStyles(el, clone);

    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${r.width}" height="${r.height}">`,
      `<foreignObject width="100%" height="100%">`,
      `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;width:${r.width}px;height:${r.height}px;overflow:hidden">`,
      clone.outerHTML,
      `</div></foreignObject></svg>`
    ].join('\n');

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    return URL.createObjectURL(blob);
  }

  function inlineComputedStyles(source, target) {
    const apply = (src, tgt) => {
      const cs = window.getComputedStyle(src);
      let s = '';
      for (let i = 0; i < cs.length; i++) {
        const p = cs[i];
        s += `${p}:${cs.getPropertyValue(p)};`;
      }
      tgt.style.cssText = s;
    };
    apply(source, target);
    const srcKids = source.querySelectorAll('*');
    const tgtKids = target.querySelectorAll('*');
    const len = Math.min(srcKids.length, tgtKids.length);
    for (let i = 0; i < len; i++) apply(srcKids[i], tgtKids[i]);
  }

  // ─── Favicon bundle → single favicon.zip ────────────────────────────────────
  async function doFaviconBundle(dataUrl) {
    // Generate all assets in parallel
    const [ico, p96, p180, svg, p192, p512] = await Promise.all([
      encodeICO(dataUrl, [16, 32, 48]),
      resizeToPNG(dataUrl, 96),
      resizeToPNG(dataUrl, 180),
      encodeEmbeddedSVG(dataUrl),
      resizeToPNG(dataUrl, 192),
      resizeToPNG(dataUrl, 512),
    ]);

    const entries = [
      ['favicon.ico',                  ico],
      ['favicon-96x96.png',            p96],
      ['apple-touch-icon.png',         p180],
      ['favicon.svg',                  svg],
      ['web-app-manifest-192x192.png', p192],
      ['web-app-manifest-512x512.png', p512],
    ];

    // Convert every data URL to a Uint8Array
    const files = entries.map(([name, url]) => {
      const b64  = url.split(',')[1];
      const raw  = atob(b64);
      const data = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);
      return { name, data };
    });

    const zipBytes = buildZip(files);

    // Convert ZIP bytes → data URL
    let binary = '';
    for (let i = 0; i < zipBytes.length; i += 8192) {
      binary += String.fromCharCode(...zipBytes.subarray(i, i + 8192));
    }
    await triggerDownload(`data:application/zip;base64,${btoa(binary)}`, 'favicon.zip');
  }

  // ─── ZIP encoder (STORE, no compression — PNGs/ICO are already compressed) ──
  function buildZip(files) {
    const crcTable = makeCRCTable();
    const locals   = [];
    let offset = 0;

    for (const { name, data } of files) {
      const nameBytes = new TextEncoder().encode(name);
      const crc       = crc32(data, crcTable);
      const lh        = new ArrayBuffer(30 + nameBytes.length);
      const v         = new DataView(lh);
      v.setUint32(0,  0x04034b50, true);
      v.setUint16(4,  20,         true);
      v.setUint16(6,  0,          true);
      v.setUint16(8,  0,          true); // STORE
      v.setUint16(10, 0,          true);
      v.setUint16(12, 0,          true);
      v.setUint32(14, crc,        true);
      v.setUint32(18, data.length,true);
      v.setUint32(22, data.length,true);
      v.setUint16(26, nameBytes.length, true);
      v.setUint16(28, 0,          true);
      new Uint8Array(lh).set(nameBytes, 30);
      locals.push({ lh, data, nameBytes, crc, offset });
      offset += lh.byteLength + data.length;
    }

    const cdOffset = offset;
    const cds = locals.map(({ lh, nameBytes, crc, data, offset: lo }) => {
      const cd = new ArrayBuffer(46 + nameBytes.length);
      const v  = new DataView(cd);
      v.setUint32(0,  0x02014b50,   true);
      v.setUint16(4,  20,           true);
      v.setUint16(6,  20,           true);
      v.setUint16(8,  0,            true);
      v.setUint16(10, 0,            true); // STORE
      v.setUint16(12, 0,            true);
      v.setUint16(14, 0,            true);
      v.setUint32(16, crc,          true);
      v.setUint32(20, data.length,  true);
      v.setUint32(24, data.length,  true);
      v.setUint16(28, nameBytes.length, true);
      v.setUint16(30, 0,            true);
      v.setUint16(32, 0,            true);
      v.setUint16(34, 0,            true);
      v.setUint16(36, 0,            true);
      v.setUint32(38, 0,            true);
      v.setUint32(42, lo,           true);
      new Uint8Array(cd).set(nameBytes, 46);
      return cd;
    });

    const cdSize = cds.reduce((n, cd) => n + cd.byteLength, 0);
    const eocd   = new ArrayBuffer(22);
    const ev     = new DataView(eocd);
    ev.setUint32(0,  0x06054b50,   true);
    ev.setUint16(4,  0,            true);
    ev.setUint16(6,  0,            true);
    ev.setUint16(8,  files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize,       true);
    ev.setUint32(16, cdOffset,     true);
    ev.setUint16(20, 0,            true);

    const total  = offset + cdSize + 22;
    const result = new Uint8Array(total);
    let pos = 0;
    for (const { lh, data } of locals) {
      result.set(new Uint8Array(lh), pos); pos += lh.byteLength;
      result.set(data,               pos); pos += data.length;
    }
    for (const cd of cds) { result.set(new Uint8Array(cd), pos); pos += cd.byteLength; }
    result.set(new Uint8Array(eocd), pos);
    return result;
  }

  function makeCRCTable() {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  }

  function crc32(data, table) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  async function resizeToPNG(dataUrl, size) {
    const buf = await resizeToPNGBuffer(dataUrl, size);
    const u8  = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < u8.length; i += 8192) {
      binary += String.fromCharCode(...u8.subarray(i, i + 8192));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  }

  function encodeEmbeddedSVG(dataUrl) {
    // SVG favicon that embeds the PNG — renders crisply at all sizes
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image href="${dataUrl}" width="512" height="512" preserveAspectRatio="xMidYMid slice"/></svg>`;
    const u8  = new TextEncoder().encode(svg);
    let binary = '';
    for (let i = 0; i < u8.length; i += 8192) {
      binary += String.fromCharCode(...u8.subarray(i, i + 8192));
    }
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  }

  // Encode a proper multi-size .ico (PNG frames inside ICO container)
  async function encodeICO(dataUrl, sizes = [16, 32, 48]) {
    const pngBuffers = await Promise.all(sizes.map(s => resizeToPNGBuffer(dataUrl, s)));

    // ICO binary layout: 6-byte ICONDIR + 16-byte ICONDIRENTRY per image + PNG data
    const DIR_HEADER  = 6;
    const ENTRY_SIZE  = 16;
    const dataStart   = DIR_HEADER + ENTRY_SIZE * sizes.length;
    const totalBytes  = dataStart + pngBuffers.reduce((n, b) => n + b.byteLength, 0);

    const buf  = new ArrayBuffer(totalBytes);
    const view = new DataView(buf);
    const u8   = new Uint8Array(buf);

    // ICONDIR
    view.setUint16(0, 0, true); // reserved
    view.setUint16(2, 1, true); // type: 1 = ICO
    view.setUint16(4, sizes.length, true);

    // ICONDIRENTRY + copy PNG frames
    let writeAt = dataStart;
    sizes.forEach((sz, i) => {
      const e = DIR_HEADER + i * ENTRY_SIZE;
      view.setUint8 (e,      sz);                        // width  (0 = 256)
      view.setUint8 (e + 1,  sz);                        // height
      view.setUint8 (e + 2,  0);                         // colorCount
      view.setUint8 (e + 3,  0);                         // reserved
      view.setUint16(e + 4,  1,                   true); // planes
      view.setUint16(e + 6,  32,                  true); // bitCount
      view.setUint32(e + 8,  pngBuffers[i].byteLength, true); // size
      view.setUint32(e + 12, writeAt,             true); // offset
      u8.set(new Uint8Array(pngBuffers[i]), writeAt);
      writeAt += pngBuffers[i].byteLength;
    });

    // Convert ArrayBuffer → data URL
    let binary = '';
    for (let i = 0; i < u8.length; i += 8192) {
      binary += String.fromCharCode(...u8.subarray(i, i + 8192));
    }
    return `data:image/x-icon;base64,${btoa(binary)}`;
  }

  function resizeToPNGBuffer(dataUrl, size) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        c.getContext('2d').drawImage(img, 0, 0, size, size);
        c.toBlob(blob => blob.arrayBuffer().then(resolve), 'image/png');
      };
      img.src = dataUrl;
    });
  }

  async function writeClipboard(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  }

  async function triggerDownload(url, name) {
    // Blob URLs are content-script-local — convert to data URL before handing to background
    if (url.startsWith('blob:')) {
      const blob   = await fetch(url).then(r => r.blob());
      const buf    = await blob.arrayBuffer();
      const bytes  = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }
      url = `data:${blob.type};base64,${btoa(binary)}`;
      URL.revokeObjectURL(url);
    }
    // Use background's chrome.downloads.download — the only reliable download path
    chrome.runtime.sendMessage({ action: 'download', url, filename: name });
  }

  // ─── Panel feedback ───────────────────────────────────────────────────────
  function flashSuccess(msg) {
    const shadow = panelHost.shadowRoot;
    const el = shadow.getElementById('ds-success');
    shadow.getElementById('ds-success-msg').textContent = msg;
    el.classList.add('ds-show');
    setTimeout(() => el.classList.remove('ds-show'), 2000);
  }

  // ─── Toast ────────────────────────────────────────────────────────────────
  function toast(msg, type = 'info') {
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
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function isOwn(el) {
    return !!(el && el.closest &&
      el.closest('#domsnap-panel-host, #domsnap-highlight, #domsnap-label, #domsnap-toast'));
  }

  function remove(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

  function waitFrames(n) {
    return new Promise(resolve => {
      let count = 0;
      const tick = () => { if (++count >= n) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  }

  // ─── Panel HTML + CSS (shadow DOM) ────────────────────────────────────────
  const PANEL_HTML = `
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :host { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }

  .ds-panel {
    width: 300px;
    background: linear-gradient(160deg, rgba(18,10,40,0.97) 0%, rgba(10,8,24,0.97) 100%);
    border: 1px solid rgba(124,58,237,0.38);
    border-radius: 18px;
    box-shadow:
      0 28px 72px rgba(0,0,0,0.7),
      0 0 0 1px rgba(255,255,255,0.04),
      inset 0 1px 0 rgba(255,255,255,0.06);
    overflow: hidden;
    position: relative;
    transform: scale(0.9) translateY(-12px);
    opacity: 0;
    transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease;
    user-select: none;
  }
  .ds-panel.ds-open {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  /* ── Header ── */
  .ds-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 14px;
    background: rgba(124,58,237,0.13);
    border-bottom: 1px solid rgba(124,58,237,0.18);
    cursor: grab;
  }
  .ds-header:active { cursor: grabbing; }

  .ds-logo {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #c4b5fd;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.4px;
  }
  .ds-logo-icon {
    width: 22px; height: 22px;
    background: rgba(124,58,237,0.28);
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid rgba(167,139,250,0.3);
    flex-shrink: 0;
  }

  #ds-close {
    width: 22px; height: 22px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 50%;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px;
    line-height: 1;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    flex-shrink: 0;
  }
  #ds-close:hover {
    background: rgba(239,68,68,0.28);
    border-color: rgba(239,68,68,0.45);
    color: #fca5a5;
  }

  /* ── Element info ── */
  .ds-info {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  .ds-el-name {
    color: #e2e8f0;
    font-size: 12px;
    font-family: 'SF Mono','Fira Code','Cascadia Code',monospace;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ds-el-size {
    color: rgba(255,255,255,0.35);
    font-size: 11px;
    margin-top: 2px;
  }

  /* ── Section label ── */
  .ds-sec {
    color: rgba(255,255,255,0.3);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 1.1px;
    text-transform: uppercase;
    padding: 10px 14px 5px;
  }

  /* ── Format grid ── */
  .ds-fmts {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 7px;
    padding: 0 12px 12px;
  }
  .ds-fmt {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px;
    color: rgba(255,255,255,0.65);
    cursor: pointer;
    padding: 9px 4px 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: background 0.14s, border-color 0.14s, color 0.14s, transform 0.12s;
  }
  .ds-fmt:hover {
    background: rgba(124,58,237,0.28);
    border-color: rgba(167,139,250,0.45);
    color: #c4b5fd;
    transform: translateY(-2px);
  }
  .ds-fmt:active { transform: translateY(0); }
  .ds-fmt-icon { font-size: 17px; line-height: 1; }
  .ds-fmt-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  /* PNG blue tint, JPG orange, SVG green, ICO yellow */
  .ds-fmt[data-fmt="png"]:hover  { background: rgba(59,130,246,0.22); border-color: rgba(147,197,253,0.4); color: #93c5fd; }
  .ds-fmt[data-fmt="jpg"]:hover  { background: rgba(234,88,12,0.22);  border-color: rgba(253,186,116,0.4); color: #fdba74; }
  .ds-fmt[data-fmt="svg"]:hover  { background: rgba(16,185,129,0.2);  border-color: rgba(110,231,183,0.4); color: #6ee7b7; }
  .ds-fmt[data-fmt="favicon"]:hover { background: rgba(234,179,8,0.2); border-color: rgba(253,224,71,0.4); color: #fde047; }

  /* ── Divider ── */
  .ds-div {
    height: 1px;
    background: rgba(255,255,255,0.055);
    margin: 0 12px 10px;
  }

  /* ── Clipboard button ── */
  #ds-clip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0 12px 13px;
    padding: 10px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 11px;
    color: rgba(255,255,255,0.65);
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.14s, border-color 0.14s, color 0.14s;
    width: calc(100% - 24px);
  }
  #ds-clip:hover {
    background: rgba(56,189,248,0.16);
    border-color: rgba(125,211,252,0.38);
    color: #7dd3fc;
  }

  /* ── Loading ── */
  #ds-loading {
    display: none;
    position: absolute;
    inset: 0;
    background: rgba(10,8,24,0.88);
    backdrop-filter: blur(4px);
    border-radius: 18px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #a78bfa;
    font-size: 13px;
    font-weight: 500;
  }
  #ds-loading.ds-show { display: flex; }
  .ds-spinner {
    width: 30px; height: 30px;
    border: 3px solid rgba(167,139,250,0.18);
    border-top-color: #a78bfa;
    border-radius: 50%;
    animation: ds-spin 0.65s linear infinite;
  }
  @keyframes ds-spin { to { transform: rotate(360deg); } }

  /* ── Success flash ── */
  #ds-success {
    display: none;
    position: absolute;
    inset: 0;
    background: rgba(10,8,24,0.92);
    border-radius: 18px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: #86efac;
    font-size: 13px;
    font-weight: 500;
    animation: ds-fade 0.2s ease;
  }
  #ds-success.ds-show { display: flex; }
  .ds-check { font-size: 36px; animation: ds-pop 0.3s cubic-bezier(0.34,1.56,0.64,1); }
  @keyframes ds-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-pop  { from { transform: scale(0.5); opacity:0; } to { transform: scale(1); opacity:1; } }
</style>

<div class="ds-panel" id="ds-panel">

  <div class="ds-header" id="ds-drag-handle">
    <div class="ds-logo">
      <div class="ds-logo-icon">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1.5 4 L1.5 1.5 L4 1.5" stroke="#a78bfa" stroke-width="1.4" stroke-linecap="round" fill="none"/>
          <path d="M9 1.5 L11.5 1.5 L11.5 4" stroke="#a78bfa" stroke-width="1.4" stroke-linecap="round" fill="none"/>
          <path d="M11.5 9 L11.5 11.5 L9 11.5" stroke="#a78bfa" stroke-width="1.4" stroke-linecap="round" fill="none"/>
          <path d="M4 11.5 L1.5 11.5 L1.5 9" stroke="#a78bfa" stroke-width="1.4" stroke-linecap="round" fill="none"/>
          <circle cx="6.5" cy="6.5" r="1.2" fill="#c4b5fd"/>
          <line x1="6.5" y1="3.8" x2="6.5" y2="4.9" stroke="#c4b5fd" stroke-width="1" stroke-linecap="round"/>
          <line x1="6.5" y1="8.1" x2="6.5" y2="9.2" stroke="#c4b5fd" stroke-width="1" stroke-linecap="round"/>
          <line x1="3.8" y1="6.5" x2="4.9" y2="6.5" stroke="#c4b5fd" stroke-width="1" stroke-linecap="round"/>
          <line x1="8.1" y1="6.5" x2="9.2" y2="6.5" stroke="#c4b5fd" stroke-width="1" stroke-linecap="round"/>
        </svg>
      </div>
      DomSnap
    </div>
    <button id="ds-close" title="Close (Esc)">✕</button>
  </div>

  <div class="ds-info">
    <div class="ds-el-name"></div>
    <div class="ds-el-size"></div>
  </div>

  <div class="ds-sec">Export as</div>
  <div class="ds-fmts">
    <button class="ds-fmt" data-fmt="png" title="Download PNG">
      <span class="ds-fmt-icon">🖼</span>
      <span class="ds-fmt-label">PNG</span>
    </button>
    <button class="ds-fmt" data-fmt="jpg" title="Download JPG">
      <span class="ds-fmt-icon">📷</span>
      <span class="ds-fmt-label">JPG</span>
    </button>
    <button class="ds-fmt" data-fmt="svg" title="Download SVG">
      <span class="ds-fmt-icon">✦</span>
      <span class="ds-fmt-label">SVG</span>
    </button>
    <button class="ds-fmt" data-fmt="favicon" title="Download favicon.zip (6 files)">
      <span class="ds-fmt-icon">⭐</span>
      <span class="ds-fmt-label">ICO</span>
    </button>
  </div>

  <div class="ds-div"></div>

  <button id="ds-clip" title="Copy as PNG to clipboard">
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="4.5" y="1" width="8.5" height="10" rx="2" stroke="currentColor" stroke-width="1.25" fill="none"/>
      <path d="M2 4 L2 13.2 C2 13.64 2.36 14 2.8 14 L10.5 14" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" fill="none"/>
    </svg>
    Copy to Clipboard
  </button>

  <div id="ds-loading">
    <div class="ds-spinner"></div>
    <span>Capturing…</span>
  </div>

  <div id="ds-success">
    <span class="ds-check">✓</span>
    <span id="ds-success-msg"></span>
  </div>

</div>
`;

})();
