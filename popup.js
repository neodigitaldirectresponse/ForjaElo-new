document.addEventListener('DOMContentLoaded', () => {
  // --- Helpers ----------------------------------------------------------------
  const $id = (id) => document.getElementById(id);

  // Track pending operations to show/hide the loading overlay reliably
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

  const sendToActiveTab = (message, callback) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id != null) {
        chrome.tabs.sendMessage(tabs[0].id, message, (resp) => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || '';
            if (msg.includes('Could not establish connection')) {
              console.info('Conteudo nao ativo para receber mensagens');
            } else if (msg.includes('The message port closed')) {
              console.info('A aba recarregou ou fechou antes da resposta');
            } else {
              console.warn('sendMessage failed:', msg);
            }
          }
          callback && callback(resp);
        });
      } else {
        callback && callback();
      }
    });
  };

  const safeReadClipboard = async () => {
    if (!navigator.clipboard) {
      console.error('Clipboard API não disponível');
      return '';
    }
    if (!document.hasFocus()) {
      console.warn('Popup sem foco ao tentar ler a área de transferência');
    }
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      console.error('Erro ao ler a área de transferência', e);
      return '';
    }
  };

  // --- Elements ----------------------------------------------------------------
  const els = {
    bulkInput: 'bulkInput',
    queueBtn: 'queueButton',
    bulkInputField: 'bulkQueueInput',
    promptDelay: 'promptDelay',
    promptDelayMin: 'promptDelayMin',
    promptDelayMax: 'promptDelayMax',
    delayContainer: 'delaySettings',
    queueContainer: 'queueContainer',
    queueList: 'queueList',
    clearQueue: 'clearQueue',
    promptSelect: 'promptSelect',
    copyPrompt: 'copyPrompt',
    note: 'note',
    saveNote: 'save',
    loadNote: 'load',
    exportJson: 'exportJson',
    exportLogs: 'exportLogs',
    resetChat: 'resetChat',
    toolSelect: 'toolSelect',
    applyTool: 'applyTool',
    selectionModel: 'selectionModel',
    operationMode: 'operationMode',
    typingMode: 'typingMode',
    typingOptions: 'typingOptions',
    openTestPage: 'openTestPage',
    openChatGPT: 'openChatGPT',
    openShortcuts: 'openShortcuts',
    adsPowerApi: 'adsPowerApi',
    status: 'status',
    serviceStatus: 'serviceStatus',
    lastResponse: 'lastResponse',
    clicksContainer: 'clicksContainer',
    startSelect: 'startSelect',
    runClicks: 'runClicks',
    clearClicks: 'clearClicks',
    clickList: 'clickList',
    pasteStart: 'pasteStart',
    startAutomation: 'startAutomation',
    copyResult: 'copyResult',
    demoError: 'demoError',
    shortcutsContainer: 'shortcutsContainer',
    scQueue: 'scQueue',
    scClearQueue: 'scClearQueue',
    scCopyPrompt: 'scCopyPrompt',
    scApplyTool: 'scApplyTool',
    scSaveNote: 'scSaveNote',
    scLoadNote: 'scLoadNote',
    scExportJson: 'scExportJson',
    scExportLogs: 'scExportLogs',
    scResetChat: 'scResetChat',
    scSelect: 'scSelect',
    scRun: 'scRun',
    scClearClicks: 'scClearClicks',
    scPasteStart: 'scPasteStart',
    scStartAutomation: 'scStartAutomation',
    scCopyResult: 'scCopyResult',
    scDemoError: 'scDemoError',
    saveShortcuts: 'saveShortcuts',
    resetShortcuts: 'resetShortcuts'
  };

  // Map IDs to element references
  Object.keys(els).forEach((key) => {
    els[key] = $id(els[key]);
  });

  // --- State ------------------------------------------------------------------
  const defaultShortcuts = {
    queue: 'Ctrl+Enter',
    clearQueue: 'Ctrl+Shift+C',
    copyPrompt: 'Ctrl+Shift+P',
    applyTool: 'Ctrl+Shift+2',
    saveNote: 'Ctrl+S',
    loadNote: 'Ctrl+O',
    exportJson: 'Ctrl+Shift+J',
    exportLogs: 'Ctrl+Shift+L',
    resetChat: 'Ctrl+Shift+X',
    select: 'Ctrl+Shift+S',
    run: 'Ctrl+Shift+R',
    clearClicks: 'Ctrl+Shift+D',
    pasteStart: 'Ctrl+Shift+V',
    startAutomation: 'Ctrl+Shift+G',
    copyResult: 'Ctrl+Shift+B',
    demoError: 'Ctrl+Shift+M'
  };
  let shortcuts = { ...defaultShortcuts };
  let conversationKey = '';

  // Record shortcut combinations via popup inputs
  const shortcutInputs = [
    els.scQueue,
    els.scClearQueue,
    els.scCopyPrompt,
    els.scApplyTool,
    els.scSaveNote,
    els.scLoadNote,
    els.scExportJson,
    els.scExportLogs,
    els.scResetChat,
    els.scSelect,
    els.scRun,
    els.scClearClicks,
    els.scPasteStart,
    els.scStartAutomation,
    els.scCopyResult,
    els.scDemoError,
  ];

  function handleShortcutInput(e) {
    e.preventDefault();
    e.stopPropagation();
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    if (['Backspace', 'Delete'].includes(e.key)) {
      e.target.value = '';
      return;
    }
    e.target.value = formatCombo(e);
  }

  shortcutInputs.forEach((input) =>
    input.addEventListener('keydown', handleShortcutInput)
  );

  // --- Rendering --------------------------------------------------------------
  function renderList(container, items, onClick) {
    container.innerHTML = '';
    items.forEach((item, idx) => {
      const li = document.createElement('li');
      li.textContent = item;
      li.dataset.index = idx;
      li.style.cursor = 'pointer';
      li.style.padding = '4px 0';
      if (typeof onClick === 'function') li.addEventListener('click', () => onClick(idx));
      container.appendChild(li);
    });
  }

  const updateQueueList = () => {
    storageGet({ queuedMessages: [] }, (data) => {
      renderList(els.queueList, data.queuedMessages, (idx) => {
        showLoading();
        const msgs = data.queuedMessages;
        msgs.splice(idx, 1);
        storageSet({ queuedMessages: msgs }, () => {
          sendToActiveTab({ action: 'setQueue', queue: msgs });
          updateQueueList();
          hideLoading();
        });
      });
    });
  };

  const updateClickList = () => {
    storageGet({ customClicks: [] }, (data) => {
      renderList(els.clickList, data.customClicks);
    });
  };

  // --- Initialization ---------------------------------------------------------
  showLoading();
  sendToActiveTab({ action: 'getConversationKey' }, (resp) => {
    conversationKey = resp?.key || '';
    storageGet({ automationResults: {} }, (res) => {
      const result = res.automationResults[conversationKey] || '';
      els.lastResponse.value = result;
      if (result) {
        els.status.textContent = 'Resultado da automação salvo localmente.';
        setTimeout(() => (els.status.textContent = ''), 2000);
      }
      updateQueueList();
      updateClickList();
      hideLoading();
    });
  });

  // Load shortcuts
  storageGet({ shortcuts: defaultShortcuts }, (data) => {
    shortcuts = { ...defaultShortcuts, ...(data.shortcuts || {}) };
    els.scQueue.value = shortcuts.queue;
    els.scClearQueue.value = shortcuts.clearQueue;
    els.scCopyPrompt.value = shortcuts.copyPrompt;
    els.scApplyTool.value = shortcuts.applyTool;
    els.scSaveNote.value = shortcuts.saveNote;
    els.scLoadNote.value = shortcuts.loadNote;
    els.scExportJson.value = shortcuts.exportJson;
    els.scExportLogs.value = shortcuts.exportLogs;
    els.scResetChat.value = shortcuts.resetChat;
    els.scSelect.value = shortcuts.select;
    els.scRun.value = shortcuts.run;
    els.scClearClicks.value = shortcuts.clearClicks;
    els.scPasteStart.value = shortcuts.pasteStart;
    els.scStartAutomation.value = shortcuts.startAutomation;
    els.scCopyResult.value = shortcuts.copyResult;
    els.scDemoError.value = shortcuts.demoError;
  });
  // Load selection model
  storageGet({ selectionModel: 'keyboard' }, (data) => {
    els.selectionModel.value = data.selectionModel;
  });
  els.selectionModel.addEventListener('change', () => {
    storageSet({ selectionModel: els.selectionModel.value || 'keyboard' });
  });

  // Load operation mode
  storageGet({ operationMode: 'cli' }, (data) => {
    els.operationMode.value = data.operationMode;
  });
  els.operationMode.addEventListener('change', () => {
    storageSet({ operationMode: els.operationMode.value || 'cli' });
  });

  // Load typing mode
  storageGet({ typingMode: 'templateFast' }, (data) => {
    els.typingMode.value = data.typingMode;
  });
  els.typingMode.addEventListener('change', () => {
    storageSet({ typingMode: els.typingMode.value || 'templateFast' });
  });

  // Load AdsPower API base
  storageGet({ adsPowerApiBase: 'http://local.adspower.net:50325' }, (data) => {
    els.adsPowerApi.value = data.adsPowerApiBase;
  });
  els.adsPowerApi.addEventListener('change', () => {
    storageSet({ adsPowerApiBase: els.adsPowerApi.value || 'http://local.adspower.net:50325' });
  });

  // Load delays
  storageGet(['promptDelay', 'promptDelayMin', 'promptDelayMax'], (res) => {
    let { promptDelay, promptDelayMin, promptDelayMax } = res;
    if (promptDelay == null) promptDelay = 10000 + Math.random() * 20000;
    if (promptDelayMin == null || promptDelayMax == null) {
      promptDelayMin = 10000;
      promptDelayMax = 30000;
    }
    storageSet({ promptDelay, promptDelayMin, promptDelayMax });
    els.promptDelay.value = promptDelay / 1000;
    els.promptDelayMin.value = promptDelayMin / 1000;
    els.promptDelayMax.value = promptDelayMax / 1000;
  });

  // Load saved note
  storageGet(['savedNote'], (res) => {
    els.note.value = res.savedNote || '';
  });

  // Populate promptSelect
  prompts.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.title;
    els.promptSelect.appendChild(opt);
  });

  // --- Event Listeners --------------------------------------------------------
  // Collapsible sections are no longer toggled; all content is visible by default

  // Theme toggle
  const themeBtn = document.getElementById('toggleTheme');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const root = document.body;
      const isDark = root.getAttribute('data-theme') === 'dark';
      root.setAttribute('data-theme', isDark ? 'light' : 'dark');
      themeBtn.textContent = isDark ? '🌙' : '☀️';
    });
  }

  // Bulk queue input autoresize
  els.bulkInputField.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
  });

  // Queue prompts
  els.queueBtn.addEventListener('click', () => {
    showLoading();
    const messages = els.bulkInputField.value.split('~').map(m => m.trim()).filter(Boolean);
    if (!messages.length) return hideLoading();

    storageGet({ queuedMessages: [] }, (data) => {
      const updated = data.queuedMessages.concat(messages);
      storageSet({ queuedMessages: updated }, () => {
        sendToActiveTab({ action: 'addToQueue', messages });
        updateQueueList();
        sendToActiveTab({ action: 'setQueue', queue: updated });
        els.status.textContent = `${messages.length} prompts adicionados à fila`;
        setTimeout(() => (els.status.textContent = ''), 1000);
        hideLoading();
      });
    });
    els.bulkInputField.value = '';
    els.bulkInputField.style.height = '40px';
  });

  // Clear queue
  els.clearQueue.addEventListener('click', () => {
    showLoading();
    storageSet({ queuedMessages: [] }, () => {
      updateQueueList();
      sendToActiveTab({ action: 'setQueue', queue: [] });
      hideLoading();
    });
  });

  // Copy prompt
  els.copyPrompt.addEventListener('click', () => {
    showLoading();
    const idx = parseInt(els.promptSelect.value, 10);
    if (isNaN(idx) || !prompts[idx]) return hideLoading();
    navigator.clipboard.writeText(prompts[idx].text).then(() => {
      els.status.textContent = 'Prompt copiado';
      setTimeout(() => (els.status.textContent = ''), 1000);
      hideLoading();
    });
  });

  // Note actions
  els.saveNote.addEventListener('click', () => {
    showLoading();
    storageSet({ savedNote: els.note.value || '' }, () => {
      els.status.textContent = 'Salvo';
      setTimeout(() => (els.status.textContent = ''), 1000);
      hideLoading();
    });
  });
  els.loadNote.addEventListener('click', () => {
    showLoading();
    storageGet(['savedNote'], (res) => {
      els.note.value = res.savedNote || '';
      els.status.textContent = 'Carregado';
      setTimeout(() => (els.status.textContent = ''), 1000);
      hideLoading();
    });
  });

  // Export JSON
  els.exportJson.addEventListener('click', () => {
    showLoading();
    storageGet(['automationResults'], (res) => {
      const result = (res.automationResults || {})[conversationKey] || '';
      const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${(conversationKey||'responses').replace(/[^a-z0-9]/gi,'_').toLowerCase()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      els.lastResponse.value = result;
      hideLoading();
    });
  });

  // Export Logs
  els.exportLogs.addEventListener('click', () => {
    showLoading();
    chrome.runtime.sendMessage({ type: 'getLogs' }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('getLogs failed:', chrome.runtime.lastError.message);
        hideLoading();
        return;
      }
      const blob = new Blob([JSON.stringify(res.logs || [])], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `logs_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      hideLoading();
    });
  });

  // Reset Chat
  els.resetChat.addEventListener('click', () => {
    showLoading();
    sendToActiveTab({ action: 'resetConversation' }, () => {
      sendToActiveTab({ action: 'getConversationKey' }, (r) => {
        conversationKey = r?.key || '';
        els.lastResponse.value = '';
        els.status.textContent = 'Chat redefinido';
        setTimeout(() => (els.status.textContent = ''), 1000);
        hideLoading();
      });
    });
  });

  // Tool application with automatic selection based on clipboard
  function normalize(str) {
    return str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function levenshtein(a, b) {
    const m = [];
    for (let i = 0; i <= b.length; i++) {
      m[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      m[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          m[i][j] = m[i - 1][j - 1];
        } else {
          m[i][j] = Math.min(
            m[i - 1][j - 1] + 1,
            m[i][j - 1] + 1,
            m[i - 1][j] + 1
          );
        }
      }
    }
    return m[b.length][a.length];
  }

  function wordSim(a, b) {
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
  }

  function toolSim(snippetWords, toolWords) {
    let total = 0;
    toolWords.forEach((tw) => {
      let best = 0;
      snippetWords.forEach((sw) => {
        const s = wordSim(sw, tw);
        if (s > best) best = s;
      });
      total += best;
    });
    return total / toolWords.length;
  }

  function getFirstFiveWords(prompt) {
    return prompt
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join(' ');
  }

  const toolKeywords = {
    'Criar imagem': ['criar', 'imagem'],
    'Pensar por mais tempo': ['pensar', 'por', 'mais', 'tempo'],
    'Investigar': ['investigar'],
    'Busca na Web': ['busca', 'na', 'web'],
    'Lousa': ['lousa'],
  };

  function detectTool(prompt) {
    const firstFive = getFirstFiveWords(normalize(prompt));
    const words = firstFive
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/gi, ''));

    for (const [toolName, keywords] of Object.entries(toolKeywords)) {
      const matches = keywords.every((k) => words.includes(k));
      if (matches) return toolName;
    }
    return '';
  }

  function guessTool(text) {
    return detectTool(text);
  }

  // Apply selected tool automatically when changed
  els.toolSelect.addEventListener('change', () => {
    const tool = els.toolSelect.value;
    if (!tool) return;
    showLoading();
    els.status.innerHTML = '<span class="spinner"></span>Selecionando...';
    sendToActiveTab({ action: 'selectTool', tool }, (res) => {
      if (res?.success) {
        els.status.textContent = `Ferramenta ativa: ${res.active}`;
      } else {
        els.status.textContent = 'Falha ao aplicar ferramenta';
      }
      setTimeout(() => (els.status.textContent = ''), 2000);
      hideLoading();
    });
  });

  els.applyTool.addEventListener('click', async () => {
    showLoading();
    const clip = await safeReadClipboard();
    const text = (clip || '').trim();
      if (!text) {
        els.status.textContent = 'Área de transferência vazia';
        setTimeout(() => (els.status.textContent = ''), 2000);
        return hideLoading();
      }

      const tool = guessTool(text) || els.toolSelect.value;
      if (!tool) {
        els.status.textContent = 'Nenhuma ferramenta detectada';
        setTimeout(() => (els.status.textContent = ''), 2000);
        return hideLoading();
      }

      els.status.innerHTML = '<span class="spinner"></span>Selecionando...';
      sendToActiveTab({ action: 'selectTool', tool }, (res) => {
        const spinner = $id('popupSpinner');
        spinner && spinner.remove();
        if (res?.success) {
          els.status.textContent = `Ferramenta ativa: ${res.active}`;
          sendToActiveTab({ action: 'pasteStart' }, hideLoading);
        } else {
          els.status.textContent = 'Falha ao aplicar ferramenta';
          hideLoading();
        }
        console.log('Ferramenta escolhida:', tool);
        setTimeout(() => (els.status.textContent = ''), 2000);
      });
    });

  async function runAutomationShortcut() {
    showLoading();
    const clip = await safeReadClipboard();
    const text = (clip || '').trim();
    if (!text) {
      els.status.textContent = 'Área de transferência vazia';
      setTimeout(() => (els.status.textContent = ''), 2000);
      return hideLoading();
    }
    sendToActiveTab({ action: 'applyToolClipboardAutomation' }, (res) => {
      if (!res?.success) {
        els.status.textContent = 'Falha ao iniciar automação';
        setTimeout(() => (els.status.textContent = ''), 2000);
      }
      hideLoading();
    });
  }
  
  // Selection & Clicks
  els.startSelect.addEventListener('click', () => {
    showLoading();
    sendToActiveTab({ action: 'startSelection' }, () => {
      els.status.textContent = 'Modo de seleção ativado';
      setTimeout(() => (els.status.textContent = ''), 1000);
      hideLoading();
    });
  });
  els.runClicks.addEventListener('click', () => {
    showLoading();
    sendToActiveTab({ action: 'runClicks' }, () => {
      els.status.textContent = 'Executando cliques';
      setTimeout(() => (els.status.textContent = ''), 1000);
      hideLoading();
    });
  });
  els.clearClicks.addEventListener('click', () => {
    showLoading();
    storageSet({ customClicks: [] }, () => {
      updateClickList();
      hideLoading();
    });
  });

  // Automation actions
  els.pasteStart.addEventListener('click', () => {
    showLoading();
    sendToActiveTab({ action: 'pasteStart' }, hideLoading);
  });

  els.copyResult.addEventListener('click', () => {
    showLoading();
    storageGet(['automationResults'], (res) => {
      const result = (res.automationResults || {})[conversationKey] || '';
      navigator.clipboard.writeText(JSON.stringify(result)).then(() => {
        els.status.textContent = 'Resultado copiado';
        setTimeout(() => (els.status.textContent = ''), 1000);
        hideLoading();
      });
    });
  });

  els.startAutomation.addEventListener('click', () => {
    showLoading();
    sendToActiveTab({ action: 'startAutomation' }, hideLoading);
  });

  els.demoError.addEventListener('click', () => {
    showLoading();
    sendToActiveTab({ action: 'demoError' }, hideLoading);
  });

  els.openTestPage.addEventListener('click', () => {
    const url = chrome.runtime.getURL('simulation/teste-simulacao.html');
    chrome.tabs.create({ url });
  });

  els.openChatGPT.addEventListener('click', () => {
    const url = chrome.runtime.getURL('redirect.html');
    chrome.tabs.create({ url });
  });

  els.openShortcuts.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // Save Shortcuts
  els.saveShortcuts.addEventListener('click', () => {
    showLoading();
    shortcuts = {
      queue: els.scQueue.value || defaultShortcuts.queue,
      clearQueue: els.scClearQueue.value || defaultShortcuts.clearQueue,
      copyPrompt: els.scCopyPrompt.value || defaultShortcuts.copyPrompt,
      applyTool: els.scApplyTool.value || defaultShortcuts.applyTool,
      saveNote: els.scSaveNote.value || defaultShortcuts.saveNote,
      loadNote: els.scLoadNote.value || defaultShortcuts.loadNote,
      exportJson: els.scExportJson.value || defaultShortcuts.exportJson,
      exportLogs: els.scExportLogs.value || defaultShortcuts.exportLogs,
      resetChat: els.scResetChat.value || defaultShortcuts.resetChat,
      select: els.scSelect.value || defaultShortcuts.select,
      run: els.scRun.value || defaultShortcuts.run,
      clearClicks: els.scClearClicks.value || defaultShortcuts.clearClicks,
      pasteStart: els.scPasteStart.value || defaultShortcuts.pasteStart,
      startAutomation: els.scStartAutomation.value || defaultShortcuts.startAutomation,
      copyResult: els.scCopyResult.value || defaultShortcuts.copyResult,
      demoError: els.scDemoError.value || defaultShortcuts.demoError
    };
    storageSet({ shortcuts }, () => {
      els.status.textContent = 'Atalhos salvos';
      setTimeout(() => (els.status.textContent = ''), 1000);
      hideLoading();
    });
  });

  // Reset Shortcuts
  els.resetShortcuts.addEventListener('click', () => {
    showLoading();
    shortcuts = { ...defaultShortcuts };
    els.scQueue.value = shortcuts.queue;
    els.scClearQueue.value = shortcuts.clearQueue;
    els.scCopyPrompt.value = shortcuts.copyPrompt;
    els.scApplyTool.value = shortcuts.applyTool;
    els.scSaveNote.value = shortcuts.saveNote;
    els.scLoadNote.value = shortcuts.loadNote;
    els.scExportJson.value = shortcuts.exportJson;
    els.scExportLogs.value = shortcuts.exportLogs;
    els.scResetChat.value = shortcuts.resetChat;
    els.scSelect.value = shortcuts.select;
    els.scRun.value = shortcuts.run;
    els.scClearClicks.value = shortcuts.clearClicks;
    els.scPasteStart.value = shortcuts.pasteStart;
    els.scStartAutomation.value = shortcuts.startAutomation;
    els.scCopyResult.value = shortcuts.copyResult;
    els.scDemoError.value = shortcuts.demoError;
    storageSet({ shortcuts }, () => {
      els.status.textContent = 'Atalhos restaurados';
      setTimeout(() => (els.status.textContent = ''), 1000);
      hideLoading();
    });
  });

  // Message listener for selection updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'selectionAdded') updateClickList();
  });

  // Keyboard shortcuts
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
    if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      els.toolSelect.focus();
      return;
    }
    if (['INPUT','TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable) return;
    const combo = formatCombo(e);
    if (combo === shortcuts.queue)      { e.preventDefault(); els.queueBtn.click(); }
    if (combo === shortcuts.clearQueue) { e.preventDefault(); els.clearQueue.click(); }
    if (combo === shortcuts.copyPrompt) { e.preventDefault(); els.copyPrompt.click(); }
    if (combo === shortcuts.applyTool)  { e.preventDefault(); runAutomationShortcut(); }
    if (combo === shortcuts.saveNote)   { e.preventDefault(); els.saveNote.click(); }
    if (combo === shortcuts.loadNote)   { e.preventDefault(); els.loadNote.click(); }
    if (combo === shortcuts.exportJson) { e.preventDefault(); els.exportJson.click(); }
    if (combo === shortcuts.exportLogs) { e.preventDefault(); els.exportLogs.click(); }
    if (combo === shortcuts.resetChat)  { e.preventDefault(); els.resetChat.click(); }
    if (combo === shortcuts.select)     { e.preventDefault(); els.startSelect.click(); }
    if (combo === shortcuts.run)        { e.preventDefault(); els.runClicks.click(); }
    if (combo === shortcuts.clearClicks){ e.preventDefault(); els.clearClicks.click(); }
    if (combo === shortcuts.pasteStart){ e.preventDefault(); els.pasteStart.click(); }
    if (combo === shortcuts.startAutomation){ e.preventDefault(); els.startAutomation.click(); }
    if (combo === shortcuts.copyResult){ e.preventDefault(); els.copyResult.click(); }
    if (combo === shortcuts.demoError) { e.preventDefault(); els.demoError.click(); }
  });

  // Service status polling
  const updateServiceStatus = () => {
    chrome.runtime.sendMessage({ type: 'status' }, (bg) => {
      if (chrome.runtime.lastError) {
        console.warn('status check failed:', chrome.runtime.lastError.message);
        return;
      }
      const bgText = bg.status || 'serviço em segundo plano ocioso';
      sendToActiveTab({ action: 'status' }, (ct) => {
        const ctText = ct?.status ? `${ct.status} - queue: ${ct.queueLength}` : 'script de conteúdo ocioso';
        const toolText = ct?.active ? ` - tool: ${ct.active}` : '';
        els.serviceStatus.textContent = `${bgText} | ${ctText}${toolText}`;
      });
    });
  };
  updateServiceStatus();
  setInterval(updateServiceStatus, 3000);

  if (typeof logger !== 'undefined' && logger.wrapObject) {
    logger.wrapObject({
      renderList,
      normalize,
      levenshtein,
      wordSim,
      toolSim,
      getFirstFiveWords,
      detectTool,
      guessTool,
      formatCombo,
    }, 'popup.');
  }
});
