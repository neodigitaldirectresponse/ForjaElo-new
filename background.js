// Minimal offline service worker for ChatGPT Queue
// Manages the local message queue and communicates with the content script.

// Initialize default prompt delay on first install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(
    ['promptDelay', 'promptDelayMin', 'promptDelayMax', 'operationMode', 'typingMode'],
    (data) => {
      let { promptDelayMin: min, promptDelayMax: max, promptDelay } = data;
      if (min === undefined || max === undefined) {
        min = 10000;
        max = 30000;
        chrome.storage.local.set({ promptDelayMin: min, promptDelayMax: max });
      }
      if (promptDelay === undefined) {
        const randomDelay = Math.floor(Math.random() * (max - min + 1)) + min;
        chrome.storage.local.set({ promptDelay: randomDelay });
      }
      if (!data.operationMode) {
        chrome.storage.local.set({ operationMode: 'cli' });
      }
      if (!data.typingMode) {
        chrome.storage.local.set({ typingMode: 'templateFast' });
      }
    }
  );

  // Open ChatGPT automatically on first installation
  const redirectUrl = chrome.runtime.getURL('redirect.html');
  chrome.tabs.create({ url: redirectUrl });
});

let adsPowerApiBase = 'http://local.adspower.net:50325';
chrome.storage.local.get({ adsPowerApiBase }, (data) => {
  adsPowerApiBase = data.adsPowerApiBase;
  addLog(`AdsPower API base set to ${adsPowerApiBase}`);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.adsPowerApiBase) {
    adsPowerApiBase = changes.adsPowerApiBase.newValue;
    addLog(`AdsPower API base changed to ${adsPowerApiBase}`);
  }
});

// Store log entries safely
function addLog(entry, level = 'info') {
  chrome.storage.local.get({ logs: [] }, (data) => {
    const logs = data.logs;
    logs.push({ time: new Date().toISOString(), level, entry });
    if (logs.length > 1000) logs.shift();
    chrome.storage.local.set({ logs });
  });
}

// Show a user notification when important issues occur
function notify(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon-128.png',
    title: 'Agente Autônomo',
    message,
  });
}

// Notify all tabs that queue data has changed
function notifyQueueUpdated() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, { type: "queueUpdated" });
    }
  });
}

// Remove an item from the stored queue
function deleteQueueItem(index) {
  chrome.storage.local.get("queuedMessages", (data) => {
    const queue = data.queuedMessages || [];
    if (index >= 0 && index < queue.length) {
      queue.splice(index, 1);
      chrome.storage.local.set({ queuedMessages: queue }, notifyQueueUpdated);
    }
  });
}

// Send request to AdsPower with detailed logging
function sendAdsPowerRequest(action, payload = {}) {
  const url = `${adsPowerApiBase}/automation/${action}`;
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
  const logPrefix = `[AdsPower ${action}]`;
  console.log(logPrefix, 'Sending to', url, payload);
  addLog(`${logPrefix} Sending to ${url} with payload ${JSON.stringify(payload)}`, 'info');
  if (!navigator.onLine) {
    const offlineMsg = 'Navegador offline. Não foi possível contatar AdsPower.';
    console.error(logPrefix, offlineMsg);
    addLog(`${logPrefix} ${offlineMsg}`, 'error');
    notify(`AdsPower API error: ${offlineMsg}`);
    return;
  }
  fetch(url, options)
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(logPrefix, 'HTTP', res.status, text);
        addLog(`${logPrefix} HTTP ${res.status} ${text}`, 'error');
      } else {
        addLog(`${logPrefix} Success ${res.status}`);
      }
    })
    .catch((err) => {
      console.error(logPrefix, err);
      const errMsg = err && err.message ? err.message : String(err);
      addLog(`${logPrefix} Error ${errMsg}`, 'error');
      notify(`AdsPower API error: ${errMsg}. Verifique se o endereço ${adsPowerApiBase} está acessível.`);
    });
}

function normalize(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getFirstFiveWords(prompt) {
  return prompt.trim().split(/\s+/).slice(0, 5).join(' ');
}

const toolKeywords = {
  'Criar imagem': ['criar', 'imagem'],
  'Pensar por mais tempo': ['pensar', 'por', 'mais', 'tempo'],
  'Investigar': ['investigar'],
  'Busca na Web': ['busca', 'na', 'web'],
  'Lousa': ['lousa']
};

function detectTool(prompt) {
  const firstFive = getFirstFiveWords(normalize(prompt));
  const words = firstFive.split(/\s+/).map((w) => w.replace(/[^a-z0-9]/gi, ''));
  for (const [toolName, keywords] of Object.entries(toolKeywords)) {
    const matches = keywords.every((k) => words.includes(k));
    if (matches) return toolName;
  }
  return '';
}

// Listen for messages from the popup or content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "deleteQueueItem") {
    deleteQueueItem(request.index);
  } else if (request.action === "openPopup") {
    chrome.action.openPopup();
  } else if (request.type === "log") {
    addLog(request.message, request.level || 'info');
  } else if (request.type === "getLogs") {
    chrome.storage.local.get({ logs: [] }, (data) => {
      sendResponse({ logs: data.logs });
    });
    return true;
  } else if (request.type === "status") {
    sendResponse({ status: "serviço em segundo plano em execução" });
  } else if (request.type === "notify") {
    notify(request.message || 'Notificação');
  } else if (request.type === 'adsPowerRequest') {
    sendAdsPowerRequest(request.action, request.payload);
  }
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-chatgpt') {
    const url = chrome.runtime.getURL('redirect.html');
    chrome.tabs.create({ url });
  } else if (command === 'apply-tool') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'applyToolClipboardAutomation', shortcut: 'Ctrl+Shift+2' });
      }
    });
  } else if (command === 'paste-automation') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'pasteStartAutomation', shortcut: 'Ctrl+Shift+3' });
      }
    });
  } else if (command === 'copy-json-result') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'copyResult', shortcut: 'Ctrl+Shift+4' });
      }
    });
  }
});

if (typeof logger !== 'undefined' && logger.wrapObject) {
  logger.wrapObject({
    addLog,
    notify,
    notifyQueueUpdated,
    deleteQueueItem,
    sendAdsPowerRequest,
    normalize,
    getFirstFiveWords,
    detectTool,
  }, 'background.');
}
