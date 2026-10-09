const statusElement = document.getElementById('target-status');
const resultElement = document.getElementById('result');
const textArea = document.getElementById('text');
const armButton = document.getElementById('arm');
const typeButton = document.getElementById('type');
const clearButton = document.getElementById('clear');
const DRAFT_KEY = 'draft:text';
let armed = null;
let sending = false;

function show(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle('error', error);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!Number.isInteger(tab?.id)) throw new Error('找不到当前网页标签。');
  return tab;
}

async function focusedEditor(tabId) {
  const response = await chrome.runtime.sendMessage({ kind: 'GET_FOCUS', tabId });
  if (!response?.ok) throw new Error(response?.error || '无法读取网页输入位置。');
  return response.focus;
}

async function ensureContent(tabId) {
  const response = await chrome.runtime.sendMessage({ kind: 'ENSURE_CONTENT', tabId });
  if (!response?.ok) throw new Error(response?.error || '无法接入当前网页。');
}

async function refreshStatus() {
  if (armed) return;
  try {
    const tab = await activeTab();
    const focus = await focusedEditor(tab.id);
    show(statusElement, focus ? '已找到网页输入框。' : '等待选择网页输入框。');
  } catch (error) {
    show(statusElement, error.message, true);
  }
}

function readRequest() {
  const text = textArea.value;
  const delay = Number(document.getElementById('delay').value);
  if (!text) throw new Error('请先在侧边栏粘贴或输入文字。');
  if ([...text].length > 5000) throw new Error('一次最多输入 5000 个字符。');
  if (!Number.isInteger(delay) || delay < 0 || delay > 500) {
    throw new Error('每字符间隔需为 0–500 毫秒的整数。');
  }
  return { text, delay };
}

function disarm() {
  armed = null;
  armButton.textContent = '等待选择网页输入框';
}

async function sendToTab(tabId, request) {
  if (sending) return;
  sending = true;
  armButton.disabled = true;
  typeButton.disabled = true;
  show(resultElement, '正在逐字输入…');
  try {
    const response = await chrome.runtime.sendMessage({ kind: 'TYPE', tabId, ...request });
    if (!response?.ok) throw new Error(response?.error || '输入失败。');
    show(resultElement, `已逐字发送 ${response.typed} 个字符，请检查网页内容。`);
    show(statusElement, '输入完成。');
  } catch (error) {
    show(resultElement, error.message || '输入失败。', true);
  } finally {
    sending = false;
    armButton.disabled = false;
    typeButton.disabled = false;
  }
}

armButton.addEventListener('click', async () => {
  if (armed) {
    disarm();
    show(statusElement, '已取消等待。');
    return;
  }
  try {
    const request = readRequest();
    const tab = await activeTab();
    await ensureContent(tab.id);
    armed = { tabId: tab.id, request };
    armButton.textContent = '取消等待选择';
    show(statusElement, '现在点击网页中的目标输入框；选中后会自动输入。');
    show(resultElement, '');
  } catch (error) {
    show(resultElement, error.message, true);
  }
});

typeButton.addEventListener('click', async () => {
  try {
    const request = readRequest();
    const tab = await activeTab();
    disarm();
    await ensureContent(tab.id);
    const focus = await focusedEditor(tab.id);
    if (!focus) throw new Error('请先点击网页输入框，或使用上方的「等待选择」。');
    await sendToTab(tab.id, request);
  } catch (error) {
    show(resultElement, error.message, true);
  }
});

clearButton.addEventListener('click', () => {
  disarm();
  textArea.value = '';
  chrome.storage.session.remove(DRAFT_KEY).catch(() => {});
  show(resultElement, '侧边栏文字已清空。');
  textArea.focus();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.kind !== 'TARGET_CHANGED') return;
  if (armed && message.tabId === armed.tabId && message.ready === true) {
    const { tabId, request } = armed;
    disarm();
    void sendToTab(tabId, request);
  } else {
    void refreshStatus();
  }
});

textArea.addEventListener('input', () => {
  chrome.storage.session.set({ [DRAFT_KEY]: textArea.value }).catch(() => {});
});

chrome.storage.session.get(DRAFT_KEY).then((state) => {
  if (!textArea.value && typeof state[DRAFT_KEY] === 'string') {
    textArea.value = state[DRAFT_KEY];
  }
}).catch(() => {});
chrome.tabs.onActivated.addListener(refreshStatus);
window.addEventListener('focus', refreshStatus);
refreshStatus();
setTimeout(() => textArea.focus(), 50);
