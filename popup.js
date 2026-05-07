// popup.js

const btn       = document.getElementById('btn-toggle');
const btnLabel  = document.getElementById('btn-label');
const dot       = document.getElementById('dot');
const statusTxt = document.getElementById('status-text');

function setUI(active) {
  if (active) {
    dot.classList.add('active');
    statusTxt.textContent = 'Active — inspecting';
    statusTxt.classList.add('active');
    btn.className = 'btn-toggle stop';
    btnLabel.textContent = 'Stop Inspection';
    document.querySelector('.btn-icon').textContent = '◼';
  } else {
    dot.classList.remove('active');
    statusTxt.textContent = 'Inactive';
    statusTxt.classList.remove('active');
    btn.className = 'btn-toggle start';
    btnLabel.textContent = 'Start Inspection';
    document.querySelector('.btn-icon').textContent = '⊹';
  }
}

// Query current tab's content script for status
async function syncStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const res = await chrome.tabs.sendMessage(tab.id, { action: 'getStatus' });
    setUI(res?.active ?? false);
  } catch {
    setUI(false); // content script not injected yet (e.g. chrome:// page)
  }
}

// Toggle inspection on/off
btn.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Inject content script if not yet loaded (first click)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
    } catch {
      // already injected — that's fine
    }

    const res = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
    setUI(res?.active ?? false);
    if (res?.active) window.close(); // close popup so user can interact with page
  } catch (err) {
    statusTxt.textContent = 'Cannot inject here';
    console.error('[DomSnap popup]', err);
  }
});

// Listen for status changes sent back from content script
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'statusChanged') setUI(msg.active);
});

syncStatus();
