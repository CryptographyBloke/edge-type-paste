const keyForTab = (tabId) => `focus:${tabId}`;
const busyTabs = new Set();
const UUID = /^[0-9a-f-]{36}$/i;
const fromExtensionPage = (sender) =>
  sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

function keyInfo(character) {
  if (/^[a-z]$/i.test(character)) {
    return {
      key: character,
      code: `Key${character.toUpperCase()}`,
      windowsVirtualKeyCode: character.toUpperCase().charCodeAt(0),
      modifiers: character === character.toUpperCase() ? 8 : 0
    };
  }
  if (/^[0-9]$/.test(character)) {
    return {
      key: character,
      code: `Digit${character}`,
      windowsVirtualKeyCode: character.charCodeAt(0),
      modifiers: 0
    };
  }
  if (character === ' ') {
    return { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, modifiers: 0 };
  }
  return null;
}

async function typeUnit(target, unit) {
  if (unit === '\n') {
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: '\n' });
    return;
  }
  const key = keyInfo(unit);
  if (key) {
    await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
      type: 'rawKeyDown', ...key
    });
  }
  try {
    await chrome.debugger.sendCommand(target, 'Input.insertText', { text: unit });
  } finally {
    if (key) {
      await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp', ...key
      });
    }
  }
}

async function selectGeneratedIndent(target) {
  const home = { key: 'Home', code: 'Home', windowsVirtualKeyCode: 36, modifiers: 8 };
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'rawKeyDown', ...home
  });
  await chrome.debugger.sendCommand(target, 'Input.dispatchKeyEvent', {
    type: 'keyUp', ...home
  });
}

async function generatedIndentLength(tabId, frameId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { kind: 'GET_INDENT' }, { frameId });
    return Number.isInteger(response?.length) ? response.length : 0;
  } catch {
    return 0;
  }
}

async function typeText(message) {
  const { tabId, text, delay } = message;
  if (!Number.isInteger(tabId) || typeof text !== 'string' || !text.length ||
      [...text].length > 5000 || !Number.isInteger(delay) || delay < 0 || delay > 500) {
    throw new Error('输入参数无效。');
  }
  if (busyTabs.has(tabId)) throw new Error('此网页正在输入上一段文字。');
  const record = (await chrome.storage.session.get(keyForTab(tabId)))[keyForTab(tabId)];
  if (!record || !UUID.test(record.targetId)) {
    throw new Error('请先在网页中点击一个可编辑输入框。');
  }
  const normalized = text.replace(/\r\n?/g, '\n');
  const units = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    .segment(normalized)].map(({ segment }) => segment);
  busyTabs.add(tabId);
  const target = { tabId };
  let attached = false;
  let typed = 0;
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    const prepared = await chrome.tabs.sendMessage(tabId, {
      kind: 'PREPARE', targetId: record.targetId
    }, { frameId: record.frameId });
    if (!prepared?.ok) {
      throw new Error(prepared?.error || '输入框已失效，请重新点击网页输入位置。');
    }
    if (prepared.singleLine && normalized.includes('\n')) {
      throw new Error('单行输入框不能输入换行；请改选多行文本框。');
    }
    const editorAutoIndents = prepared.autoIndentEditor === true;
    let afterNewline = false;
    for (const unit of units) {
      if (afterNewline) {
        if (editorAutoIndents && (unit === ' ' || unit === '\t')) {
          typed += [...unit].length;
          continue;
        }
        if (!editorAutoIndents && await generatedIndentLength(tabId, record.frameId) > 0) {
          await selectGeneratedIndent(target);
        }
      }
      await typeUnit(target, unit);
      afterNewline = unit === '\n';
      typed += [...unit].length;
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    if (afterNewline && !editorAutoIndents && await generatedIndentLength(tabId, record.frameId) > 0) {
      await selectGeneratedIndent(target);
      await chrome.debugger.sendCommand(target, 'Input.insertText', { text: '' });
    }
    return { ok: true, typed };
  } finally {
    busyTabs.delete(tabId);
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.kind === 'FOCUS') {
    if (!sender.tab?.id || !Number.isInteger(sender.frameId) ||
        typeof message.targetId !== 'string' || !UUID.test(message.targetId)) {
      sendResponse({ ok: false });
      return;
    }
    chrome.storage.session.set({
      [keyForTab(sender.tab.id)]: {
        tabId: sender.tab.id,
        frameId: sender.frameId,
        targetId: message.targetId
      }
    }).then(() => {
      sendResponse({ ok: true });
      chrome.runtime.sendMessage({
        kind: 'TARGET_CHANGED', tabId: sender.tab.id,
        targetId: message.targetId, ready: message.ready === true
      }).catch(() => {});
    }, () => sendResponse({ ok: false }));
    return true;
  }

  if (message?.kind === 'GET_FOCUS') {
    if (!fromExtensionPage(sender) || !Number.isInteger(message.tabId)) {
      sendResponse({ ok: false, error: '请求无效。' });
      return;
    }
    chrome.storage.session.get(keyForTab(message.tabId)).then((state) => {
      sendResponse({ ok: true, focus: state[keyForTab(message.tabId)] ?? null });
    }, () => sendResponse({ ok: false, error: '无法读取输入位置。' }));
    return true;
  }

  if (message?.kind === 'ENSURE_CONTENT') {
    if (!fromExtensionPage(sender) || !Number.isInteger(message.tabId)) {
      sendResponse({ ok: false, error: '请求无效。' });
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: message.tabId, allFrames: true },
      files: ['content.js']
    }).then(() => sendResponse({ ok: true }), (error) => {
      sendResponse({ ok: false, error: `无法接入网页：${error.message}。请确认当前是普通网页。` });
    });
    return true;
  }

  if (message?.kind === 'TYPE') {
    if (!fromExtensionPage(sender)) {
      sendResponse({ ok: false, error: '仅扩展窗口可以开始输入。' });
      return;
    }
    typeText(message).then(sendResponse, (error) => {
      sendResponse({ ok: false, error: error.message || '输入失败。' });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(keyForTab(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.storage.session.remove(keyForTab(tabId));
  }
});
