// content-panel.js — shadow DOM panel UI
(function () {
  'use strict';
  const DS = window.__DS;

  DS.elLabel = function (el) {
    const tag = el.tagName.toLowerCase();
    const id  = el.id ? `#${el.id}` : '';
    const cls = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '';
    return `${tag}${id}${cls}`;
  };

  DS.showPanel = function (el, previewUrl) {
    if (!DS.panelHost) DS.buildPanel();

    const r      = el.getBoundingClientRect();
    const shadow = DS.panelHost.shadowRoot;

    shadow.querySelector('.ds-el-name').textContent = DS.elLabel(el);
    shadow.querySelector('.ds-el-size').textContent =
      `${Math.round(r.width)} × ${Math.round(r.height)} px`;

    const chain = [];
    let cursor = el;
    while (cursor && cursor !== document.documentElement) {
      chain.unshift(cursor);
      if (cursor === document.body) break;
      cursor = cursor.parentElement;
    }
    const bc = shadow.getElementById('ds-breadcrumb');
    bc.innerHTML = chain.map((node, i) => {
      const active = i === chain.length - 1;
      return `<span class="ds-bc-chip${active ? ' ds-bc-active' : ''}" data-idx="${i}">${DS.elLabel(node)}</span>`
           + (i < chain.length - 1 ? '<span class="ds-bc-sep">›</span>' : '');
    }).join('');
    bc._chain = chain;

    const previewImg  = shadow.getElementById('ds-preview-img');
    const previewSpin = shadow.getElementById('ds-preview-spinner');
    if (previewUrl) {
      previewImg.src = previewUrl;
      previewImg.style.display  = 'block';
      previewSpin.style.display = 'none';
    } else {
      previewImg.style.display  = 'none';
      previewSpin.style.display = 'none';
    }

    DS.placePanel(r);
    DS.panelHost.style.display = 'block';
    requestAnimationFrame(() => shadow.querySelector('.ds-panel').classList.add('ds-open'));
  };

  DS.hidePanel = function () {
    if (!DS.panelHost) return;
    const shadow = DS.panelHost.shadowRoot;
    shadow.querySelector('.ds-panel').classList.remove('ds-open');
    setTimeout(() => {
      if (!DS.panelHost) return;
      DS.panelHost.style.display = 'none';
      const img = shadow.getElementById('ds-preview-img');
      if (img) { img.src = ''; img.style.display = 'none'; }
      const spin = shadow.getElementById('ds-preview-spinner');
      if (spin) spin.style.display = 'none';
    }, 220);
  };

  DS.placePanel = function (elRect) {
    const W = 300, H = 380, GAP = 14;
    const vw = window.innerWidth, vh = window.innerHeight;
    let l, t;
    if (elRect.right + W + GAP < vw)       { l = elRect.right + GAP;    t = elRect.top; }
    else if (elRect.left - W - GAP > 0)    { l = elRect.left - W - GAP; t = elRect.top; }
    else if (elRect.bottom + H + GAP < vh) { l = elRect.left;            t = elRect.bottom + GAP; }
    else                                    { l = vw - W - GAP;          t = GAP; }
    l = Math.max(GAP, Math.min(l, vw - W - GAP));
    t = Math.max(GAP, Math.min(t, vh - H - GAP));
    DS.panelHost.style.left = `${l}px`;
    DS.panelHost.style.top  = `${t}px`;
  };

  DS.buildPanel = function () {
    DS.panelHost = document.createElement('div');
    DS.panelHost.id = 'domsnap-panel-host';
    Object.assign(DS.panelHost.style, { position: 'fixed', zIndex: '2147483647', display: 'none', width: '300px' });
    document.documentElement.appendChild(DS.panelHost);

    const shadow = DS.panelHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = DS.PANEL_HTML;

    shadow.getElementById('ds-close').onclick = () => {
      DS.selectedEl = null;
      DS.hidePanel();
      DS.reattachOverlays();
    };

    shadow.querySelectorAll('[data-fmt]').forEach(btn => {
      btn.addEventListener('click', () => DS.doCapture(btn.dataset.fmt));
    });

    shadow.getElementById('ds-clip').addEventListener('click', () => DS.doCapture('clipboard'));

    shadow.getElementById('ds-breadcrumb').addEventListener('click', async e => {
      const chip = e.target.closest('.ds-bc-chip');
      if (!chip) return;
      const bc  = shadow.getElementById('ds-breadcrumb');
      const idx = parseInt(chip.dataset.idx, 10);
      const el  = bc._chain[idx];
      if (!el || el === DS.selectedEl) return;
      DS.selectedEl = el;
      DS.moveHighlight(el);
      const r = el.getBoundingClientRect();
      shadow.querySelector('.ds-el-name').textContent = DS.elLabel(el);
      shadow.querySelector('.ds-el-size').textContent = `${Math.round(r.width)} × ${Math.round(r.height)} px`;
      bc.querySelectorAll('.ds-bc-chip').forEach((c, i) => c.classList.toggle('ds-bc-active', i === idx));
      const previewImg  = shadow.getElementById('ds-preview-img');
      const previewSpin = shadow.getElementById('ds-preview-spinner');
      previewImg.style.display  = 'none';
      previewSpin.style.display = 'flex';
      const url = await DS.capturePreview(el);
      previewSpin.style.display = 'none';
      if (url) { previewImg.src = url; previewImg.style.display = 'block'; }
    });

    makeDraggable(DS.panelHost, shadow.getElementById('ds-drag-handle'));
  };

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

  DS.flashSuccess = function (msg) {
    const shadow = DS.panelHost.shadowRoot;
    const el = shadow.getElementById('ds-success');
    shadow.getElementById('ds-success-msg').textContent = msg;
    el.classList.add('ds-show');
    setTimeout(() => el.classList.remove('ds-show'), 2000);
  };

  DS.PANEL_HTML = `
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :host { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }

  .ds-panel {
    width: 300px;
    background: linear-gradient(160deg, rgba(18,10,40,0.97) 0%, rgba(10,8,24,0.97) 100%);
    border: 1px solid rgba(124,58,237,0.38);
    border-radius: 18px;
    box-shadow: 0 28px 72px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06);
    overflow: hidden;
    position: relative;
    transform: scale(0.9) translateY(-12px);
    opacity: 0;
    transition: transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease;
    user-select: none;
  }
  .ds-panel.ds-open { transform: scale(1) translateY(0); opacity: 1; }

  .ds-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 14px;
    background: rgba(124,58,237,0.13);
    border-bottom: 1px solid rgba(124,58,237,0.18);
    cursor: grab;
  }
  .ds-header:active { cursor: grabbing; }
  .ds-logo { display: flex; align-items: center; gap: 7px; color: #c4b5fd; font-size: 13px; font-weight: 700; letter-spacing: 0.4px; }
  .ds-logo-icon { width: 22px; height: 22px; background: rgba(124,58,237,0.28); border-radius: 7px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(167,139,250,0.3); flex-shrink: 0; }

  #ds-close {
    width: 22px; height: 22px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 50%;
    color: rgba(255,255,255,0.4); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; line-height: 1;
    transition: background 0.15s, color 0.15s, border-color 0.15s; flex-shrink: 0;
  }
  #ds-close:hover { background: rgba(239,68,68,0.28); border-color: rgba(239,68,68,0.45); color: #fca5a5; }

  #ds-breadcrumb {
    display: flex; flex-wrap: wrap; align-items: center; gap: 2px;
    padding: 7px 14px; border-bottom: 1px solid rgba(255,255,255,0.05);
    overflow-x: auto; scrollbar-width: none;
  }
  #ds-breadcrumb::-webkit-scrollbar { display: none; }
  .ds-bc-chip { font-family: 'SF Mono','Fira Code','Cascadia Code',monospace; font-size: 10px; color: rgba(255,255,255,0.35); cursor: pointer; padding: 2px 5px; border-radius: 4px; white-space: nowrap; transition: background 0.12s, color 0.12s; }
  .ds-bc-chip:hover { background: rgba(124,58,237,0.22); color: #c4b5fd; }
  .ds-bc-chip.ds-bc-active { color: #c4b5fd; background: rgba(124,58,237,0.18); }
  .ds-bc-sep { color: rgba(255,255,255,0.18); font-size: 10px; }

  .ds-info { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.05); }
  .ds-el-name { color: #e2e8f0; font-size: 12px; font-family: 'SF Mono','Fira Code','Cascadia Code',monospace; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ds-el-size { color: rgba(255,255,255,0.35); font-size: 11px; margin-top: 2px; }

  .ds-sec { color: rgba(255,255,255,0.3); font-size: 9.5px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; padding: 10px 14px 5px; }

  .ds-fmts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; padding: 0 12px 12px; }
  .ds-fmt { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; color: rgba(255,255,255,0.65); cursor: pointer; padding: 9px 4px 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; transition: background 0.14s, border-color 0.14s, color 0.14s, transform 0.12s; }
  .ds-fmt:hover { background: rgba(124,58,237,0.28); border-color: rgba(167,139,250,0.45); color: #c4b5fd; transform: translateY(-2px); }
  .ds-fmt:active { transform: translateY(0); }
  .ds-fmt-icon { font-size: 17px; line-height: 1; }
  .ds-fmt-label { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; line-height: 1; }
  .ds-fmt[data-fmt="png"]:hover     { background: rgba(59,130,246,0.22);  border-color: rgba(147,197,253,0.4); color: #93c5fd; }
  .ds-fmt[data-fmt="jpg"]:hover     { background: rgba(234,88,12,0.22);   border-color: rgba(253,186,116,0.4); color: #fdba74; }
  .ds-fmt[data-fmt="svg"]:hover     { background: rgba(16,185,129,0.2);   border-color: rgba(110,231,183,0.4); color: #6ee7b7; }
  .ds-fmt[data-fmt="favicon"]:hover { background: rgba(234,179,8,0.2);    border-color: rgba(253,224,71,0.4);  color: #fde047; }

  .ds-div { height: 1px; background: rgba(255,255,255,0.055); margin: 0 12px 10px; }

  #ds-clip { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0 12px 13px; padding: 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); border-radius: 11px; color: rgba(255,255,255,0.65); cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.14s, border-color 0.14s, color 0.14s; width: calc(100% - 24px); }
  #ds-clip:hover { background: rgba(56,189,248,0.16); border-color: rgba(125,211,252,0.38); color: #7dd3fc; }

  #ds-preview { margin: 0 12px 8px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.07); background: repeating-conic-gradient(rgba(255,255,255,0.035) 0% 25%, transparent 0% 50%) 0 0 / 10px 10px; min-height: 72px; display: flex; align-items: center; justify-content: center; }
  #ds-preview-spinner { display: none; align-items: center; justify-content: center; width: 100%; height: 72px; }
  .ds-mini-spin { width: 20px; height: 20px; border: 2px solid rgba(167,139,250,0.18); border-top-color: #a78bfa; border-radius: 50%; animation: ds-spin 0.65s linear infinite; }
  #ds-preview-img { max-width: 100%; max-height: 140px; object-fit: contain; display: block; }

  #ds-loading { display: none; position: absolute; inset: 0; background: rgba(10,8,24,0.88); backdrop-filter: blur(4px); border-radius: 18px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #a78bfa; font-size: 13px; font-weight: 500; }
  #ds-loading.ds-show { display: flex; }
  .ds-spinner { width: 30px; height: 30px; border: 3px solid rgba(167,139,250,0.18); border-top-color: #a78bfa; border-radius: 50%; animation: ds-spin 0.65s linear infinite; }
  @keyframes ds-spin { to { transform: rotate(360deg); } }

  #ds-success { display: none; position: absolute; inset: 0; background: rgba(10,8,24,0.92); border-radius: 18px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #86efac; font-size: 13px; font-weight: 500; animation: ds-fade 0.2s ease; }
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

  <div id="ds-breadcrumb"></div>

  <div class="ds-info">
    <div class="ds-el-name"></div>
    <div class="ds-el-size"></div>
  </div>

  <div id="ds-preview">
    <div id="ds-preview-spinner"><div class="ds-mini-spin"></div></div>
    <img id="ds-preview-img" alt="preview" style="display:none"/>
  </div>

  <div class="ds-sec">Export as</div>
  <div class="ds-fmts">
    <button class="ds-fmt" data-fmt="png"     title="Download PNG"><span class="ds-fmt-icon">🖼</span><span class="ds-fmt-label">PNG</span></button>
    <button class="ds-fmt" data-fmt="jpg"     title="Download JPG"><span class="ds-fmt-icon">📷</span><span class="ds-fmt-label">JPG</span></button>
    <button class="ds-fmt" data-fmt="svg"     title="Download SVG"><span class="ds-fmt-icon">✦</span><span class="ds-fmt-label">SVG</span></button>
    <button class="ds-fmt" data-fmt="favicon" title="Download favicon.zip (6 files)"><span class="ds-fmt-icon">⭐</span><span class="ds-fmt-label">ICO</span></button>
  </div>

  <div class="ds-div"></div>

  <button id="ds-clip" title="Copy as PNG to clipboard">
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="4.5" y="1" width="8.5" height="10" rx="2" stroke="currentColor" stroke-width="1.25" fill="none"/>
      <path d="M2 4 L2 13.2 C2 13.64 2.36 14 2.8 14 L10.5 14" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" fill="none"/>
    </svg>
    Copy to Clipboard
  </button>

  <div id="ds-loading"><div class="ds-spinner"></div><span>Capturing…</span></div>
  <div id="ds-success"><span class="ds-check">✓</span><span id="ds-success-msg"></span></div>
</div>
`;
})();
