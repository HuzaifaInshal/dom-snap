// background.js — service worker

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.action === 'captureTab') {
    handleCapture(msg, sender.tab).then(reply).catch(err => reply({ success: false, error: err.message }));
    return true;
  }

  if (msg.action === 'download') {
    chrome.downloads.download({ url: msg.url, filename: msg.filename, saveAs: false });
    reply({ success: true });
    return false;
  }

  if (msg.action === 'statusChanged') {
    const tabId = sender.tab?.id;
    if (tabId == null) return;
    if (msg.active) {
      chrome.action.setBadgeText({ text: 'ON', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#7c3aed', tabId });
      chrome.action.setBadgeTextColor({ color: '#ffffff', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  }
});

async function handleCapture(msg, tab) {
  const { rect, scale = 1, format = 'png' } = msg;

  if (!rect) throw new Error('No element selected.');

  const captureFormat = format === 'jpg' ? 'jpeg' : 'png';
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: captureFormat,
    quality: 95
  });

  const cropped = await cropImage(dataUrl, rect, scale, captureFormat);
  return { success: true, dataUrl: cropped };

}

async function cropImage(dataUrl, rect, scale, format) {
  // Service workers have no DOM — use createImageBitmap instead of new Image()
  const blob   = await fetch(dataUrl).then(r => r.blob());
  const bitmap = await createImageBitmap(blob);

  const x = Math.round(rect.x * scale);
  const y = Math.round(rect.y * scale);
  const w = Math.max(1, Math.round(rect.width  * scale));
  const h = Math.max(1, Math.round(rect.height * scale));

  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h);
  bitmap.close();

  const mime       = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const resultBlob = await canvas.convertToBlob({ type: mime, quality: 0.95 });

  // FileReader is also DOM-only — convert via arrayBuffer + btoa
  const buffer = await resultBlob.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
