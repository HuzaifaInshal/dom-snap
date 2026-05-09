// content-init.js — activation, events, highlight, capture flow
(function () {
  'use strict';
  const DS = window.__DS;

  // ─── Message bridge ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.action === 'toggle') {
      DS.active ? stop() : start();
      reply({ active: DS.active });
    } else if (msg.action === 'getStatus') {
      reply({ active: DS.active });
    }
    return false;
  });

  // ─── Activation ───────────────────────────────────────────────────────────
  function start() {
    DS.active = true;
    mountOverlays();
    document.addEventListener('mouseover', onHover,  true);
    document.addEventListener('click',     onSelect, true);
    document.addEventListener('keydown',   onKey,    true);
    document.documentElement.style.setProperty('cursor', 'crosshair', 'important');
    DS.toast('DomSnap active — hover to inspect, click to capture  •  ESC to exit');
    chrome.runtime.sendMessage({ action: 'statusChanged', active: true });
  }

  function stop() {
    DS.active = false;
    DS.hoveredEl = null;
    DS.selectedEl = null;
    DS.remove(DS.hlBox);   DS.hlBox = null;
    DS.remove(DS.hlLabel); DS.hlLabel = null;
    DS.hidePanel();
    document.removeEventListener('mouseover', onHover,  true);
    document.removeEventListener('click',     onSelect, true);
    document.removeEventListener('keydown',   onKey,    true);
    document.documentElement.style.removeProperty('cursor');
    chrome.runtime.sendMessage({ action: 'statusChanged', active: false });
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  // Remove overlays from DOM while panel is open so they never bleed into captures
  // or appear under the cursor during breadcrumb navigation.
  function detachOverlaysFromDOM() {
    DS.remove(DS.hlBox);
    DS.remove(DS.hlLabel);
  }

  // Re-attach overlays and resume hover highlight after panel is dismissed.
  DS.reattachOverlays = function () {
    if (DS.hlBox && !DS.hlBox.isConnected)
      document.documentElement.appendChild(DS.hlBox);
    if (DS.hlLabel && !DS.hlLabel.isConnected)
      document.documentElement.appendChild(DS.hlLabel);
    if (DS.hoveredEl) DS.moveHighlight(DS.hoveredEl);
  };

  function onHover(e) {
    // Panel is open — do not track hover at all
    if (!DS.active || DS.selectedEl || DS.isOwn(e.target)) return;
    if (e.target === DS.hoveredEl) return;
    DS.hoveredEl = e.target;
    DS.moveHighlight(DS.hoveredEl);
  }

  async function onSelect(e) {
    if (!DS.active || DS.isOwn(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    DS.selectedEl = el;
    // Remove overlays from DOM entirely — display:none is not enough as they
    // can still bleed into screenshot captures and breadcrumb previews.
    detachOverlaysFromDOM();
    const previewUrl = await DS.capturePreview(el);
    if (DS.selectedEl !== el) return;
    DS.showPanel(el, previewUrl);
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    if (DS.selectedEl) {
      DS.selectedEl = null;
      DS.hidePanel();
      DS.reattachOverlays();
    } else {
      stop();
    }
  }

  // ─── Highlight overlay ────────────────────────────────────────────────────
  function mountOverlays() {
    if (!DS.hlBox) {
      DS.hlBox = document.createElement('div');
      DS.hlBox.id = 'domsnap-highlight';
      document.documentElement.appendChild(DS.hlBox);
    }
    if (!DS.hlLabel) {
      DS.hlLabel = document.createElement('div');
      DS.hlLabel.id = 'domsnap-label';
      document.documentElement.appendChild(DS.hlLabel);
    }
  }

  DS.moveHighlight = function (el) {
    if (!DS.hlBox || !DS.hlLabel) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;

    DS.hlBox.style.setProperty('display', 'block', 'important');
    DS.hlBox.style.setProperty('left',   `${r.left}px`,   'important');
    DS.hlBox.style.setProperty('top',    `${r.top}px`,    'important');
    DS.hlBox.style.setProperty('width',  `${r.width}px`,  'important');
    DS.hlBox.style.setProperty('height', `${r.height}px`, 'important');

    const tag = el.tagName.toLowerCase();
    const id  = el.id ? `#${el.id}` : '';
    const cls = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '';
    DS.hlLabel.textContent = `${tag}${id}${cls}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    DS.hlLabel.style.setProperty('display', 'block', 'important');

    const lh    = 26;
    const below = r.bottom + 6;
    const above = r.top - lh - 6;
    const top   = below + lh < window.innerHeight ? below : Math.max(4, above);
    const left  = Math.min(r.left, window.innerWidth - 320);
    DS.hlLabel.style.setProperty('top',  `${top}px`,               'important');
    DS.hlLabel.style.setProperty('left', `${Math.max(4, left)}px`, 'important');
  };

  // ─── Capture flow ─────────────────────────────────────────────────────────
  DS.doCapture = async function (fmt) {
    if (!DS.selectedEl) return;
    const el      = DS.selectedEl;
    const shadow  = DS.panelHost.shadowRoot;
    const loading = shadow.getElementById('ds-loading');
    loading.classList.add('ds-show');

    try {
      let dataUrl;

      if (fmt === 'svg') {
        dataUrl = await DS.exportSVG(el);
      } else {
        if (!el.isConnected) throw new Error('Element was removed from the page — please re-select.');
        DS.panelHost.style.visibility = 'hidden';

        const canvas = await DS.captureElementCanvas(el);
        DS.panelHost.style.visibility = '';

        dataUrl = fmt === 'jpg'
          ? canvas.toDataURL('image/jpeg', 0.95)
          : canvas.toDataURL('image/png');

        if (fmt === 'favicon') {
          loading.classList.remove('ds-show');
          DS.flashSuccess('Building favicon.zip…');
          await DS.doFaviconBundle(dataUrl);
          DS.flashSuccess('favicon.zip downloaded!');
          setTimeout(() => { DS.selectedEl = null; DS.hidePanel(); DS.reattachOverlays(); }, 1800);
          return;
        }
      }

      loading.classList.remove('ds-show');

      if (fmt === 'clipboard') {
        await DS.writeClipboard(dataUrl);
        DS.flashSuccess('Copied to clipboard!');
        DS.toast('Copied to clipboard!', 'success');
        setTimeout(() => { DS.selectedEl = null; DS.hidePanel(); DS.reattachOverlays(); }, 1600);
      } else {
        const ext  = fmt === 'svg' ? 'svg' : fmt;
        const name = `domsnap-${Date.now()}.${ext}`;
        await DS.triggerDownload(dataUrl, name);
        DS.flashSuccess(`Saved: ${name}`);
        setTimeout(() => { DS.selectedEl = null; DS.hidePanel(); DS.reattachOverlays(); }, 1600);
      }
    } catch (err) {
      loading.classList.remove('ds-show');
      if (DS.panelHost) DS.panelHost.style.visibility = '';
      console.error('[DomSnap]', err);
      DS.toast(err.message, 'error');
    }
  };
})();
