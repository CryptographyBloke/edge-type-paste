(() => {
  if (globalThis.__typePasteContentReady) return;
  globalThis.__typePasteContentReady = true;
  const ATTRIBUTE = 'data-type-paste-target';
  const INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'number']);
  const AUTO_INDENT_EDITORS = '.monaco-editor, .CodeMirror, .cm-editor, .ace_editor';
  let target = null;
  let targetId = null;
  let savedSelection = null;

  function uuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function editableFrom(node) {
    if (!(node instanceof Element)) return null;
    if (node instanceof HTMLTextAreaElement) {
      return node.disabled || node.readOnly ? null : node;
    }
    if (node instanceof HTMLInputElement) {
      return node.disabled || node.readOnly || !INPUT_TYPES.has(node.type) ? null : node;
    }
    if (!node.isContentEditable) return null;
    let host = node;
    while (host.parentElement?.isContentEditable) host = host.parentElement;
    return host;
  }

  function selectionFor(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      try {
        if (typeof element.selectionStart !== 'number') return null;
        return {
          kind: 'text',
          start: element.selectionStart,
          end: element.selectionEnd,
          direction: element.selectionDirection
        };
      } catch {
        return null;
      }
    }
    const root = element.getRootNode();
    const selection = typeof root.getSelection === 'function'
      ? root.getSelection()
      : document.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null;
    return { kind: 'range', range: range.cloneRange() };
  }

  function rememberSelection() {
    if (!target?.isConnected) return;
    const selection = selectionFor(target);
    if (selection) savedSelection = selection;
  }

  function generatedIndentLength() {
    if (!target?.isConnected) return 0;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      try {
        const position = target.selectionStart;
        if (typeof position !== 'number') return 0;
        const lineStart = target.value.lastIndexOf('\n', position - 1) + 1;
        const prefix = target.value.slice(lineStart, position);
        return /^[\t ]*$/.test(prefix) ? prefix.length : 0;
      } catch {
        return 0;
      }
    }
    const root = target.getRootNode();
    const selection = typeof root.getSelection === 'function'
      ? root.getSelection()
      : document.getSelection();
    const node = selection?.anchorNode;
    if (!selection?.isCollapsed || !node || !target.contains(node) || node.nodeType !== Node.TEXT_NODE) return 0;
    const prefix = node.textContent.slice(0, selection.anchorOffset).split('\n').pop();
    return /^[\t ]*$/.test(prefix) ? prefix.length : 0;
  }

  function usesAutoIndentEditor() {
    return Boolean(target?.closest(AUTO_INDENT_EDITORS));
  }

  document.addEventListener('focusin', (event) => {
    const path = event.composedPath?.() ?? [event.target];
    const next = path.map(editableFrom).find(Boolean);
    if (!next) return;
    if (target === next && targetId) return;
    if (target && target !== next) target.removeAttribute(ATTRIBUTE);
    target = next;
    targetId = uuid();
    target.setAttribute(ATTRIBUTE, targetId);
    savedSelection = null;
    rememberSelection();
    chrome.runtime.sendMessage({ kind: 'FOCUS', targetId }).catch(() => {});
  }, true);

  document.addEventListener('selectionchange', rememberSelection, true);
  document.addEventListener('keyup', rememberSelection, true);
  document.addEventListener('click', () => {
    setTimeout(() => {
      if (!target?.isConnected || !targetId) return;
      const active = target.getRootNode().activeElement;
      if (active !== target && !target.contains(active)) return;
      rememberSelection();
      chrome.runtime.sendMessage({ kind: 'FOCUS', targetId, ready: true }).catch(() => {});
    }, 0);
  }, true);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.kind === 'GET_INDENT') {
      sendResponse({ length: generatedIndentLength() });
      return;
    }
    if (message?.kind !== 'PREPARE') return;
    if (message.targetId !== targetId || !target?.isConnected ||
        target.getAttribute(ATTRIBUTE) !== targetId || !editableFrom(target)) {
      sendResponse({ ok: false, error: '先前的输入框已失效，请重新点击网页输入位置。' });
      return;
    }
    try {
      const selectionToRestore = savedSelection;
      target.focus({ preventScroll: true });
      if (selectionToRestore?.kind === 'text') {
        target.setSelectionRange(selectionToRestore.start, selectionToRestore.end, selectionToRestore.direction);
      } else if (selectionToRestore?.kind === 'range') {
        const root = target.getRootNode();
        const selection = typeof root.getSelection === 'function'
          ? root.getSelection()
          : document.getSelection();
        selection.removeAllRanges();
        selection.addRange(selectionToRestore.range);
      }
      sendResponse({
        ok: true,
        targetId,
        singleLine: target instanceof HTMLInputElement,
        autoIndentEditor: usesAutoIndentEditor()
      });
    } catch {
      sendResponse({ ok: false, error: '无法恢复光标，请重新点击网页输入位置。' });
    }
  });
})();
