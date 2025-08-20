document.addEventListener('DOMContentLoaded', () => {
  const $id = (id) => document.getElementById(id);

  // Loading overlay helpers
  const overlay = $id('loadingOverlay');
  let loadingCounter = 0;
  const showLoading = () => {
    loadingCounter++;
    overlay && overlay.classList.add('is-active');
  };
  const hideLoading = () => {
    loadingCounter = Math.max(0, loadingCounter - 1);
    if (loadingCounter === 0 && overlay) overlay.classList.remove('is-active');
  };

  const storageGet = (keys, cb) => chrome.storage.local.get(keys, cb);
  const storageSet = (obj, cb) => chrome.storage.local.set(obj, cb || (() => {}));

  const sendToActiveTab = (message, cb) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id != null) {
        chrome.tabs.sendMessage(tabs[0].id, message, cb);
      } else {
        cb && cb();
      }
    });
  };

  // Theme toggle
  $id('toggleTheme').addEventListener('click', () => {
    document.body.dataset.theme =
      document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  });

  // Open ChatGPT
  $id('openChatGPT').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chat.openai.com/' });
  });

  // Toggle shortcuts table
  const shortcutsTable = $id('shortcutsTable');
  $id('openShortcuts').addEventListener('click', () => {
    shortcutsTable.style.display =
      shortcutsTable.style.display === 'none' ? 'block' : 'none';
  });

  // Populate prompts from FORJA_PROMPTS
  const promptSelect = $id('promptSelect');
  if (Array.isArray(window.FORJA_PROMPTS)) {
    window.FORJA_PROMPTS.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = p.title || p.name || `Prompt ${i + 1}`;
      opt.dataset.keywords =
        (p.text || p.instruction || '').split(/\s+/).slice(0, 5).join(' ');
      promptSelect.appendChild(opt);
    });
  }
  $id('copyPrompt').addEventListener('click', () => {
    const p = window.FORJA_PROMPTS?.[promptSelect.value];
    if (p) navigator.clipboard.writeText(p.text || p.instruction || '');
  });

  // Queue management
  let queue = [];
  const renderQueue = () => {
    $id('queueCount').textContent = queue.length;
    const list = $id('queueList');
    list.innerHTML = '';
    queue.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
  };

  $id('queueButton').addEventListener('click', () => {
    const raw = $id('bulkQueueInput').value;
    const items = raw
      .split('~')
      .map((s) => s.trim())
      .filter(Boolean);
    queue.push(...items);
    $id('bulkQueueInput').value = '';
    renderQueue();
  });

  $id('clearQueue').addEventListener('click', () => {
    queue = [];
    renderQueue();
  });

  // Apply selected tool
  $id('applyTool').addEventListener('click', () => {
    const tool = $id('toolSelect').value;
    sendToActiveTab({ action: 'applyTool', tool });
  });

  // Quick actions
  $id('pasteStart').addEventListener('click', async () => {
    const txt = await navigator.clipboard.readText();
    sendToActiveTab({ action: 'pasteAndStart', text: txt });
  });
  $id('startAutomation').addEventListener('click', () => {
    sendToActiveTab({ action: 'startAutomation' });
  });
  $id('copyResult').addEventListener('click', () => {
    navigator.clipboard.writeText($id('lastResponse').value || '');
  });

  // Notes and exports
  $id('save').addEventListener('click', () => {
    showLoading();
    storageSet({ note: $id('note').value }, () => {
      $id('status').textContent = 'Nota salva';
      setTimeout(() => ($id('status').textContent = ''), 1000);
      hideLoading();
    });
  });
  $id('load').addEventListener('click', () => {
    showLoading();
    storageGet(['note'], (res) => {
      $id('note').value = res.note || '';
      hideLoading();
    });
  });
  $id('exportJson').addEventListener('click', () => {
    sendToActiveTab({ action: 'exportJson' });
  });
  $id('exportLogs').addEventListener('click', () => {
    sendToActiveTab({ action: 'exportLogs' });
  });
  $id('resetChat').addEventListener('click', () => {
    sendToActiveTab({ action: 'resetChat' });
  });

  // Service status polling
  const updateServiceStatus = () => {
    chrome.runtime.sendMessage({ type: 'status' }, (bg) => {
      if (chrome.runtime.lastError) return;
      const bgText = bg?.status || 'bg ocioso';
      sendToActiveTab({ action: 'status' }, (ct) => {
        const ctText = ct?.status ? `${ct.status} - queue: ${ct.queueLength}` : 'ct ocioso';
        const toolText = ct?.active ? ` - tool: ${ct.active}` : '';
        $id('serviceStatus').textContent = `${bgText} | ${ctText}${toolText}`;
      });
    });
  };
  updateServiceStatus();
  setInterval(updateServiceStatus, 3000);

  // Shortcuts
  const defaultShortcuts = {
    applyTool: 'Ctrl+Enter',
    pasteStart: 'Ctrl+Shift+V',
    queue: 'Ctrl+Q',
    clearQueue: 'Ctrl+Shift+Q',
    copyPrompt: 'Ctrl+Shift+C',
    copyResult: 'Ctrl+Alt+C',
  };
  let shortcuts = { ...defaultShortcuts };

  const fillShortcutInputs = () => {
    $id('scApplyTool').value = shortcuts.applyTool;
    $id('scPasteStart').value = shortcuts.pasteStart;
    $id('scQueue').value = shortcuts.queue;
    $id('scClearQueue').value = shortcuts.clearQueue;
    $id('scCopyPrompt').value = shortcuts.copyPrompt;
    $id('scCopyResult').value = shortcuts.copyResult;
  };

  storageGet(['shortcuts'], (res) => {
    shortcuts = { ...shortcuts, ...(res.shortcuts || {}) };
    fillShortcutInputs();
  });

  $id('saveShortcuts').addEventListener('click', () => {
    showLoading();
    shortcuts = {
      applyTool: $id('scApplyTool').value || defaultShortcuts.applyTool,
      pasteStart: $id('scPasteStart').value || defaultShortcuts.pasteStart,
      queue: $id('scQueue').value || defaultShortcuts.queue,
      clearQueue: $id('scClearQueue').value || defaultShortcuts.clearQueue,
      copyPrompt: $id('scCopyPrompt').value || defaultShortcuts.copyPrompt,
      copyResult: $id('scCopyResult').value || defaultShortcuts.copyResult,
    };
    storageSet({ shortcuts }, () => {
      $id('status').textContent = 'Atalhos salvos';
      setTimeout(() => ($id('status').textContent = ''), 1000);
      hideLoading();
    });
  });

  $id('resetShortcuts').addEventListener('click', () => {
    showLoading();
    shortcuts = { ...defaultShortcuts };
    fillShortcutInputs();
    storageSet({ shortcuts }, () => {
      $id('status').textContent = 'Atalhos restaurados';
      setTimeout(() => ($id('status').textContent = ''), 1000);
      hideLoading();
    });
  });

  function formatCombo(e) {
    const parts = [];
    e.ctrlKey && parts.push('Ctrl');
    e.shiftKey && parts.push('Shift');
    e.altKey && parts.push('Alt');
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(key);
    return parts.join('+');
  }

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
    const combo = formatCombo(e);
    if (combo === shortcuts.queue) {
      e.preventDefault();
      $id('queueButton').click();
    }
    if (combo === shortcuts.clearQueue) {
      e.preventDefault();
      $id('clearQueue').click();
    }
    if (combo === shortcuts.copyPrompt) {
      e.preventDefault();
      $id('copyPrompt').click();
    }
    if (combo === shortcuts.applyTool) {
      e.preventDefault();
      $id('applyTool').click();
    }
    if (combo === shortcuts.pasteStart) {
      e.preventDefault();
      $id('pasteStart').click();
    }
    if (combo === shortcuts.copyResult) {
      e.preventDefault();
      $id('copyResult').click();
    }
  });

  // Listen for last response updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'lastResponse') {
      $id('lastResponse').value = msg.text || '';
    }
  });
});

