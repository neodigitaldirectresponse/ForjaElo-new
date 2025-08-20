// Forward console logs to the background script for persistent storage
(function () {
  const origLog = console.log;
  const origError = console.error;
  function relay(level, args) {
    try {
      const msg = Array.from(args)
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      chrome.runtime.sendMessage({ type: 'log', message: msg, level });
    } catch (e) {}
  }
  console.log = (...args) => {
    relay('info', args);
    origLog.apply(console, args);
  };
  console.error = (...args) => {
    relay('error', args);
    origError.apply(console, args);
  };
})();

// Define a queue to store messages
let messageQueue = [];
let sendingInProgress = false;
let userInput = "";
let isPro = true; // offline version grants full features
let currentURL = window.location.href;
const listenerMap = new WeakMap();
let userTyping = false;
let currentTypedMessage = "";
let lastMessageTime = 0;
let countdownInterval = null;
let queueProcessingInterval = null;
let pageCheckInterval = null;
let continueWatcher = null;
let finalizeTimeout = null;
let automationFinished = false;
let autoCopyAfterAutomation = false;
let selectedTool = null; // currently applied tool name
let selectionModel = 'keyboard';
let operationMode = 'cli';
let typingMode = 'templateFast';
let shortcuts = {
  queue: 'Ctrl+Enter',
  select: 'Ctrl+Shift+S',
  run: 'Ctrl+Shift+R',
  toolImage: 'Ctrl+Shift+1',
  toolInvestigate: 'Ctrl+Shift+3',
  toolSearch: 'Ctrl+Shift+4',
  toolWhiteboard: 'Ctrl+Shift+5',
  pasteStart: 'Ctrl+Shift+V',
  pasteStartAutomation: 'Ctrl+Shift+H',
  startAutomation: 'Ctrl+Shift+G',
  copyResult: 'Ctrl+Shift+B',
  demoError: 'Ctrl+Shift+M',
};
// Random delay range for selecting tools
const TOOL_DELAY_MIN = 5000; // 5 seconds
const TOOL_DELAY_MAX = 10000; // 10 seconds

function randomDelay(min, max) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function adsPowerRequest(action, payload = {}) {
  chrome.runtime.sendMessage({
    type: 'adsPowerRequest',
    action,
    payload,
  });
}

async function safeReadClipboard() {
  if (!navigator.clipboard) {
    console.error('Clipboard API não disponível');
    return '';
  }
  if (!document.hasFocus()) {
    console.warn('Documento sem foco ao tentar ler a área de transferência');
  }
  try {
    return await navigator.clipboard.readText();
  } catch (e) {
    console.error('Erro ao ler a área de transferência', e);
    chrome.runtime.sendMessage({
      type: 'notify',
      message: 'Falha ao ler a área de transferência. Clique na página e tente novamente.',
    });
    return '';
  }
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

function splitMessages(text) {
  return text
    .split('~')
    .map((m) => m.trim())
    .filter(Boolean);
}

function queuePromptsFromResponse(text) {
  const match = text.match(/<\{\+([^]+?)\+\}>/);
  if (!match) return false;
  const messages = splitMessages(match[1]);
  if (messages.length === 0) return false;
  messageQueue.push(...messages);
  chrome.storage.local.set({ queuedMessages: messageQueue });
  updateQueueIndicator();
  updateMessageList();
  return true;
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

async function applyToolFromClipboard() {
  try {
    const text = (await safeReadClipboard())?.trim();
    if (!text) {
      chrome.runtime.sendMessage({ type: 'notify', message: 'Área de transferência vazia' });
      return { success: false };
    }
    const messages = splitMessages(text);
    messageQueue.push(...messages);
    updateQueueIndicator();
    updateMessageList();
    processMessageQueue();
    return { success: true };
  } catch (e) {
    console.error('applyToolFromClipboard', e);
    return { success: false };
  }
}
async function pressEnterThenTab(target) {
  simulateKey(target, 'Enter');
  await sleep(200);
  simulateKey(document.activeElement || document.body, 'Tab');
  await sleep(50);
}
async function manualToolSelection() {
  const previous = getActiveToolName();
  let toolsButton = getToolsButton();
  if (!toolsButton) {
    for (let i = 0; i < 50; i++) {
      simulateKey(document.activeElement || document.body, 'Tab');
      await sleep(50);
      const el = document.activeElement;
      if (!el) continue;
      const text =
        (el.innerText || el.textContent || el.getAttribute('aria-label') || '').trim();
      if (text.includes('/')) {
        toolsButton = el;
        break;
      }
    }
  }
  if (!toolsButton) return null;
  toolsButton.focus();
  await pressEnterThenTab(toolsButton);
  return new Promise((resolve) => {
    const handler = (e) => {
      if (e.key === 'Enter') {
        setTimeout(() => {
          const tool = getActiveToolName();
          if (tool && tool !== previous) {
            document.removeEventListener('keydown', handler, true);
            resolve(tool);
          }
        }, 200);
      }
    };
    document.addEventListener('keydown', handler, true);
    setTimeout(() => {
      document.removeEventListener('keydown', handler, true);
      resolve(null);
    }, 15000);
  });
}

async function applyToolClipboardAutomation() {
  autoCopyAfterAutomation = true;
  try {
    const text = (await safeReadClipboard())?.trim();
    if (!text) {
      autoCopyAfterAutomation = false;
      chrome.runtime.sendMessage({ type: 'notify', message: 'Área de transferência vazia' });
      return { success: false };
    }
    const messages = splitMessages(text);
    messageQueue.push(...messages);
    updateQueueIndicator();
    updateMessageList();
    startAutomationAction();
    return { success: true };
  } catch (e) {
    autoCopyAfterAutomation = false;
    console.error('applyToolClipboardAutomation', e);
    return { success: false };
  }
}
// Store the most recent assistant response
let lastResponse = "";
// Unique key to identify the current chat session
let conversationKey = sessionStorage.getItem('awConversationKey');
if (!conversationKey) {
  conversationKey = Date.now().toString();
  sessionStorage.setItem('awConversationKey', conversationKey);
}

let customClicks = [];
let selectionMode = false;
let highlightBox = null;
let humanSamples = [];
let lastKeyTimestamp = null;
chrome.storage.local.get({ customClicks: [] }, (data) => {
  customClicks = data.customClicks || [];
});
chrome.storage.local.get({ shortcuts: shortcuts }, (data) => {
  shortcuts = { ...shortcuts, ...(data.shortcuts || {}) };
});
chrome.storage.local.get({ selectionModel: 'keyboard' }, (data) => {
  selectionModel = data.selectionModel;
});
chrome.storage.local.get({ operationMode: 'cli' }, (data) => {
  operationMode = data.operationMode;
});
chrome.storage.local.get({ typingMode: 'templateFast' }, (data) => {
  typingMode = data.typingMode;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.shortcuts) {
    shortcuts = { ...shortcuts, ...(changes.shortcuts.newValue || {}) };
  }
  if (area === 'local' && changes.selectionModel) {
    selectionModel = changes.selectionModel.newValue;
  }
  if (area === 'local' && changes.operationMode) {
    operationMode = changes.operationMode.newValue;
  }
  if (area === 'local' && changes.typingMode) {
    typingMode = changes.typingMode.newValue;
  }
});

function captureExistingAssistantMessages() {
  const assistants = document.querySelectorAll(
    "[data-message-author-role='assistant']"
  );
  if (assistants.length > 0) {
    const text = assistants[assistants.length - 1].innerText.trim();
    if (text) {
      lastResponse = text;
      storeLastResponse();
    }
  }
}

function setupResponseObserver() {
  const container = document.querySelector("main") || document.body;
  const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    mutations.forEach((mutation) => {
      if (mutation.type === "characterData") {
        if (mutation.target.parentElement?.closest("[data-message-author-role='assistant']")) {
          shouldUpdate = true;
        }
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          const assistant = node.closest("[data-message-author-role='assistant']") || node.querySelector("[data-message-author-role='assistant']");
          if (assistant) {
            shouldUpdate = true;
          }
        }
      });
    });
    if (shouldUpdate) {
      const assistants = document.querySelectorAll("[data-message-author-role='assistant']");
      if (assistants.length > 0) {
        const text = assistants[assistants.length - 1].innerText.trim();
        if (text) {
          lastResponse = text;
          storeLastResponse();
        }
      }
    }
  });
  observer.observe(container, { childList: true, subtree: true, characterData: true });
}

function storeLastResponse(callback) {
  chrome.storage.local.get({ automationResults: {} }, (data) => {
    const key = conversationKey;
    data.automationResults[key] = lastResponse;
    chrome.storage.local.set({ automationResults: data.automationResults }, () => {
      if (typeof callback === 'function') callback();
    });
  });
}

// Add this utility function near the top of the file
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Initialize pro status from storage
// Offline mode: always operate with pro features enabled
function checkQueueLimit() {
  return true;
}

// Stub for pro status check in offline build
function requestProStatus() {
  isPro = true;
}

function setUniqueEventListener(element, eventType, listener, options) {
  if (!listenerMap.has(element)) {
    listenerMap.set(element, new Map());
  }

  const elementListeners = listenerMap.get(element);

  if (!elementListeners.has(eventType)) {
    element.addEventListener(eventType, listener, options);
    elementListeners.set(eventType, listener);
  }
}

async function attemptToSendMessage(message) {
  const inputDiv = getPromptInput();

  console.log("Attempting to send message:", message);

  if (!inputDiv) {
    console.log("Prompt input element not found – aborting send");
    return false;
  }

  if (sendingInProgress) {
    console.log("Sending already in progress, aborting");
    return false;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));

  const continueButton = Array.from(
    document.querySelectorAll("button.btn")
  ).find((btn) => btn.textContent.includes("Continue generating"));

  if (continueButton) {
    continueButton.click();
      console.log("Botão Continuar encontrado, clicando");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    sendingInProgress = false;
    return;
  }

  if (getPromptText(inputDiv).length && messageQueue.length > 0) {
    console.log("User is still typing, aborting");
    userTyping = true;
    updateMessageList(); // Update to show "waiting for user" message
    return false;
  }

  userTyping = false;
  sendingInProgress = true;

  try {
    const loading =
      document.querySelector('button[data-testid="stop-button"]') ||
      document.querySelector('button[aria-label="Stop generating"]') ||
      document.querySelector('button[data-testid="fruitjuice-stop-button"]') ||
      document.querySelector('button[aria-label="Stop streaming"]');

    console.log("Loading state:", loading ? "active" : "inactive");

    if (!loading && inputDiv) {
      console.log("Setting message in input div");
      const hiddenTA = getHiddenTextarea();
      console.log("[QUEUE DEBUG] Hidden textarea present:", !!hiddenTA);
      console.log("[QUEUE DEBUG] Original message length:", message.length);

      if (typingMode === 'simulate') {
        await typeTextSlowly(inputDiv, message);
      } else if (typingMode === 'hybrid') {
        await typeTextHybrid(inputDiv, message);
      } else if (typingMode === 'robust') {
        await typeTextRobust(inputDiv, message);
      } else if (typingMode === 'imitador') {
        await typeTextImitador(inputDiv, message, humanSamples);
      } else if (typingMode === 'rewrite') {
        await typeTextRewrite(inputDiv, message);
      } else if (typingMode === 'rewriteRandom') {
        await typeTextRewriteRandom(inputDiv, message);
      } else if (typingMode === 'templateFast') {
        await typeTextTemplate(inputDiv, message, {
          delay: 50,
          errorRate: 0.02,
          pause: 500,
          jitter: 60,
          mistakes: 1,
          rewrites: 0,
          rewriteEnd: 0,
          rewriteRand: 5,
        });
      } else if (typingMode === 'templateSlow') {
        await typeTextTemplate(inputDiv, message, {
          delay: 150,
          errorRate: 0.05,
          pause: 1500,
          jitter: 120,
          mistakes: 3,
          rewrites: 0,
          rewriteEnd: 2,
          rewriteRand: 15,
        });
      } else {
        if (hiddenTA) {
          console.log("[QUEUE DEBUG] hiddenTA value BEFORE:", JSON.stringify(hiddenTA.value));
          hiddenTA.value = message;
          console.log("[QUEUE DEBUG] hiddenTA value AFTER:", JSON.stringify(hiddenTA.value));
          hiddenTA.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true }));
          setProseMirrorContent(inputDiv, message);
          console.log("[QUEUE DEBUG] Visible div after setProseMirrorContent – innerText:", JSON.stringify(inputDiv.innerText));
          console.log("[QUEUE DEBUG] Visible div after setProseMirrorContent – innerHTML:", inputDiv.innerHTML);
        } else {
          setProseMirrorContent(inputDiv, message);
          console.log("[QUEUE DEBUG] Fallback div update – innerText:", JSON.stringify(inputDiv.innerText));
        }
      }
      
      // add 100ms delay
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Ensure React updates its internal state in the div version as well
      console.log("[QUEUE DEBUG] Dispatching synthetic input event on visible div");
      inputDiv.dispatchEvent(
        new InputEvent("input", { bubbles: true, cancelable: true })
      );
      
      // Optional blur so the send button becomes enabled in some UI versions
      inputDiv.blur();
      
      console.log("Looking for send button");
      const button =
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[aria-label="Send message"]') ||
        document.querySelector(
          'button[data-testid="fruitjuice-send-button"]'
        ) ||
        document.querySelector('button[aria-label="Send prompt"]');

      if (button) {
        button.disabled = false;
        button.dispatchEvent(
          new Event("click", {
            bubbles: true,
            cancelable: true,
          })
        );

          console.log("Botão Enviar encontrado, clicando", button);

        // Clear editor content so the queue can proceed to next item
        if (hiddenTA) {
          hiddenTA.value = "";
        }
        // Replace visible content with an empty paragraph so ProseMirror is truly empty
        setProseMirrorContent(inputDiv, "");

        return true;
      } else {
          console.log("Botão Enviar não encontrado");
        return false;
      }
    } else {
        console.log("Área de entrada ou carregamento não encontrada");
      return false;
    }
  } catch (error) {
    console.error("Erro durante envio da mensagem:", error);
    return false;
  } finally {
    sendingInProgress = false;
    console.log("Processo de envio concluído");
  }
}

function updateQueueIndicator() {
  let queueIndicator = document.querySelector("#queue-indicator");
  const inputDiv = getPromptInput();
  if (!queueIndicator) {
    queueIndicator = document.createElement("span");
    queueIndicator.id = "queue-indicator";
    queueIndicator.style.cssText =
      "position: fixed; z-index: 999; bottom: 80px; right: 30px; background-color: red; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px;";
    inputDiv.parentNode.insertBefore(queueIndicator, inputDiv.nextSibling);
  }
  queueIndicator.textContent = messageQueue.length.toString();
  queueIndicator.style.display = messageQueue.length > 0 ? "flex" : "none";
}

function updateMessageList(remainingDelay = 0) {
  let messageList = document.querySelector("#message-list");

  // If there are no messages and no delay, clear any existing countdown
  if (messageQueue.length === 0 && remainingDelay === 0) {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    if (messageList) {
      messageList.style.display = "none";
    }
    return;
  }

  if (!messageList) {
    messageList = document.createElement("div");
    messageList.id = "message-list";
    messageList.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 200px;
      max-height: 300px;
      background-color: white;
      border: 1px solid #ccc;
      border-radius: 8px;
      color: black;
      padding: 10px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    `;
    document.body.appendChild(messageList);

    const style = document.createElement("style");
    style.textContent = `
      @media (prefers-color-scheme: dark) {
        #message-list {
          background-color: rgba(0, 0, 0, 0.9);
          color: #fff;
          border-color: #666;
        }
        #message-list li {
          border-bottom-color: #555;
        }
      }
      #message-list li:hover {
        text-decoration: underline;
        text-decoration-color: red;
      }
    `;
    document.head.appendChild(style);
  }

  messageList.style.display = "block";
  let content = '<ul style="list-style: none; padding: 0; margin: 0;">';

  // Use escapeHtml when displaying messages in the queue
  content += messageQueue
    .map(
      (msg, index) =>
        `<li style="margin-bottom: 8px; padding: 5px; border-bottom: 1px solid #eee; cursor: pointer;" data-index="${index}">${escapeHtml(msg)}</li>`
    )
    .join("");

  if (userTyping) {
    content += `<li style="font-size: 12px; margin-top: 8px; padding: 5px; font-style: italic; color: #888;">Aguardando o usuário terminar de digitar...</li>`;
  }

  if (remainingDelay > 0) {
    const secondsRemaining = Math.ceil(remainingDelay / 1000);
    content += `<li style="font-size: 12px; margin-top: 8px; padding: 5px; font-style: italic; color: #888;">Aguardando ${secondsRemaining}s antes da próxima mensagem...</li>`;
  }

  content += "</ul>";
  messageList.innerHTML = content;

  // Reattach click handlers
  messageList.querySelectorAll("li[data-index]").forEach((item) => {
    item.addEventListener("click", (event) => {
      const index = parseInt(event.target.getAttribute("data-index"));
      deleteQueueItem(index);
    });
  });
}

function deleteQueueItem(index) {
  chrome.runtime.sendMessage({ type: "deleteQueueItem", index }, () => {
    messageQueue.splice(index, 1);
    updateQueueIndicator();
    updateMessageList();
  });
}

function handleKeyDown(event) {
  const sendButton =
    document.querySelector('button[data-testid="send-button"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[data-testid="fruitjuice-send-button"]') ||
    document.querySelector('button[aria-label="Send prompt"]');

  const loading =
    document.querySelector('button[data-testid="stop-button"]') ||
    document.querySelector('button[aria-label="Stop generating"]') ||
    document.querySelector('button[data-testid="fruitjuice-stop-button"]') ||
    document.querySelector('button[aria-label="Stop streaming"]');

  const inputDiv = getPromptInput();
  const currentInputValue = inputDiv ? getPromptText(inputDiv) : "";

  if (event.key.length === 1 || event.key === "Backspace" || event.key === " ") {
    const now = performance.now();
    if (lastKeyTimestamp !== null) {
      humanSamples.push(now - lastKeyTimestamp);
      if (humanSamples.length > 50) humanSamples.shift();
    }
    lastKeyTimestamp = now;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    lastKeyTimestamp = null;
    event.preventDefault();
    event.stopPropagation();

    // Store the raw message without any escaping
    if (currentInputValue !== currentTypedMessage) {
      currentTypedMessage = currentInputValue;
    }

    if (currentTypedMessage) {
      const messages = splitMessages(currentTypedMessage);
      messageQueue.push(...messages);
      const clearEl = getPromptInput();
      if (clearEl) {
        if (clearEl.tagName.toLowerCase() === "textarea") {
          clearEl.value = "";
        } else {
          clearEl.textContent = "";
        }
        clearEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
      currentTypedMessage = "";
        console.log("Mensagem adicionada à fila:", messages);
      processMessageQueue();
    } else {
        console.log(
          "Mensagem não enfileirada:",
        currentTypedMessage,
          "Tamanho da fila:",
        messageQueue.length,
        "Send button:",
        sendButton,
        "Loading:",
        loading
      );
    }
  }
}

function reinjectUIComponents() {
  const inputDiv = getPromptInput();

  if (inputDiv) {
    inputDiv.removeEventListener("keydown", handleKeyDown);
    inputDiv.removeEventListener("input", handleInput);
    inputDiv.hasListener = false;
    addEventListeners();
  }
}

function addEventListeners() {
  const inputDiv = getPromptInput();

  if (inputDiv) {
    if (!inputDiv.hasListener) {
      inputDiv.addEventListener("keydown", handleKeyDown, {
        capture: true,
        passive: false,
      });
      inputDiv.addEventListener("input", handleInput);
      inputDiv.hasListener = true;
    }
  }
}

function handleInput(event) {
  currentTypedMessage = getPromptText(event.target);
}

function scheduleQueueProcessing() {
  if (queueProcessingInterval) return;
  queueProcessingInterval = setInterval(async () => {
    if (!sendingInProgress && messageQueue.length > 0) {
      await processMessageQueue();
    }
  }, 1000);
}

function scheduleFinalizeAutomation() {
  if (finalizeTimeout || automationFinished) return;
  if (queueProcessingInterval) {
    clearInterval(queueProcessingInterval);
    queueProcessingInterval = null;
  }
  finalizeTimeout = setTimeout(() => {
    finalizeTimeout = null;
    if (messageQueue.length === 0 && !sendingInProgress) {
      waitForFinalResponseAndFinish();
    }
  }, 2000);
}

function waitForFinalResponseAndFinish() {
  if (automationFinished) return;
  showToolSpinner('Carregando resposta...');
  const checker = setInterval(() => {
    const loading =
      document.querySelector('button[data-testid="stop-button"]') ||
      document.querySelector('button[aria-label="Stop generating"]') ||
      document.querySelector('button[data-testid="fruitjuice-stop-button"]') ||
      document.querySelector('button[aria-label="Stop streaming"]');
    if (!loading) {
      clearInterval(checker);
      hideToolSpinner();
      if (queuePromptsFromResponse(lastResponse)) {
        scheduleQueueProcessing();
        processMessageQueue();
      } else {
        finalizeAutomation();
      }
    }
  }, 1000);
}

function finalizeAutomation() {
  if (automationFinished) return;
  automationFinished = true;
  showToast('Automação concluída!');
  const resultToSave = lastResponse;
  storeLastResponse(() => {
    if (autoCopyAfterAutomation) {
      copyResultAction();
      autoCopyAfterAutomation = false;
    }
    if (operationMode === 'cli') {
      adsPowerRequest('saveResult', { key: conversationKey, result: resultToSave });
      adsPowerRequest('finishAutomation');
    }
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  });
  if (queueProcessingInterval) {
    console.warn(
      'Aviso: processamento da fila ainda ativo após a automação. Limpando intervalo.'
    );
    clearInterval(queueProcessingInterval);
    queueProcessingInterval = null;
  }
  if (countdownInterval) {
    console.warn(
      'Aviso: contagem regressiva ainda ativa após a automação. Limpando intervalo.'
    );
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  if (pageCheckInterval) {
    console.warn(
      'Aviso: verificação de página ainda ativa após a automação. Limpando intervalo.'
    );
    clearInterval(pageCheckInterval);
    pageCheckInterval = null;
  }
  if (continueWatcher) {
    continueWatcher.disconnect();
    continueWatcher = null;
  }
}
pageCheckInterval = setInterval(() => {
  if (window.location.href !== currentURL) {
    currentURL = window.location.href;
    reinjectUIComponents();
  }

  const inputDiv = getPromptInput();
  if (inputDiv) {
    const currentValue = getPromptText(inputDiv);
    if (currentValue !== userInput) {
      userInput = currentValue;
      reinjectUIComponents();
    }
  }
}, 2000);

(function injectUI(retryCount = 0) {
  function handleInjection(inputDiv) {
    inputDiv.addEventListener("keydown", handleKeyDown, {
      capture: true,
      passive: false,
    });
    inputDiv.addEventListener("input", handleInput);
    inputDiv.hasListener = true;
    scheduleQueueProcessing();
    requestProStatus();
    continueWatcher = setupContinueButtonWatcher();
  }

  let inputDiv = getPromptInput();
  if (inputDiv) {
    handleInjection(inputDiv);
  } else {
    const observer = new MutationObserver((mutations, obs) => {
      inputDiv = getPromptInput();
      if (inputDiv) {
        handleInjection(inputDiv);
        obs.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    if (retryCount < 50) {
      setTimeout(() => injectUI(retryCount + 1), 500);
    }
  }
})();


captureExistingAssistantMessages();
setupResponseObserver();

function getActiveToolName() {
  const selectors = [
    "[data-testid='active-system-hint-pill'] [data-label]",
    "[data-testid='active-system-hint-pill']",
    "[data-selected='true'][data-pill] span[data-label]",
    "[aria-selected='true'][role='menuitemradio'] span",
    "[aria-checked='true'][role='menuitemradio']",
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent) return el.textContent.trim();
  }
  return null;
}

function getToolsButton() {
  return (
    document.getElementById('system-hint-button') ||
    document.querySelector("[data-testid='system-hint-button']") ||
    document.querySelector("button[aria-haspopup='menu'][id*='hint']")
  );
}

function normalizeToolName(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Dispara eventos de teclado padronizados, lidando corretamente com letras
// maiúsculas, números e caracteres especiais. O parâmetro `key` recebe o valor
// exato da tecla (por exemplo, "A" ou "1"). O `code` e o `keyCode` são
// definidos automaticamente para evitar inconsistências em alguns sites.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.shortcut) {
    showShortcutInfo(`Atalho ${request.shortcut}`);
  }
  if (request.action === "addToQueue") {
    messageQueue.push(...request.messages);
    updateQueueIndicator();
    updateMessageList();
    processMessageQueue();
    sendResponse({ success: true });
  } else if (request.action === "getLastResponse") {
    sendResponse({ response: lastResponse, title: document.title });
  } else if (request.action === "getConversationKey") {
    sendResponse({ key: conversationKey });
  } else if (request.action === "resetConversation") {
    chrome.storage.local.get({ automationResults: {} }, (data) => {
      if (data.automationResults[conversationKey]) {
        delete data.automationResults[conversationKey];
        chrome.storage.local.set({ automationResults: data.automationResults });
      }
    });
    conversationKey = Date.now().toString();
    sessionStorage.setItem('awConversationKey', conversationKey);
    lastResponse = "";
    selectedTool = null;
    sendResponse({ success: true });
  } else if (request.action === "setQueue") {
    messageQueue = Array.isArray(request.queue) ? request.queue.slice() : [];
    chrome.storage.local.set({ queuedMessages: messageQueue });
    updateQueueIndicator();
    updateMessageList();
    processMessageQueue();
    sendResponse({ success: true });
  } else if (request.action === "startSelection") {
    startSelection();
    sendResponse({ success: true });
  } else if (request.action === "runClicks") {
    runCustomClicks().then(() => sendResponse({ success: true }));
    return true;
  } else if (request.action === "selectTool") {
    selectTool(request.tool).then((ok) =>
      sendResponse({ success: ok, active: selectedTool })
    );
    return true;
  } else if (request.action === "pasteStart") {
    pasteStartAction();
    sendResponse({ success: true });
  } else if (request.action === "pasteStartAutomation") {
    pasteStartAutomationAction();
    sendResponse({ success: true });
  } else if (request.action === "startAutomation") {
    startAutomationAction();
    sendResponse({ success: true });
  } else if (request.action === "demoError") {
    demoErrorAction();
    sendResponse({ success: true });
  } else if (request.action === "copyResult") {
    copyResultAction();
    sendResponse({ success: true });
  } else if (request.action === "applyToolFromClipboard") {
    applyToolFromClipboard().then((res) => sendResponse(res));
    return true;
  } else if (request.action === "applyToolClipboardAutomation") {
    applyToolClipboardAutomation().then((res) => sendResponse(res));
    return true;
  } else if (request.action === "status") {
    sendResponse({
      status: "content script running",
      queueLength: messageQueue.length,
      active: getActiveToolName(),
    });
  }
  return true;
});

async function pasteStartAction() {
  const text = await safeReadClipboard();
  if (text) {
    const messages = splitMessages(text.trim());
    messageQueue.push(...messages);
    updateQueueIndicator();
    updateMessageList();
    processMessageQueue();
  }
}

async function pasteStartAutomationAction() {
  const text = await safeReadClipboard();
  if (text) {
    const messages = splitMessages(text.trim());
    messageQueue.push(...messages);
    updateQueueIndicator();
    updateMessageList();
    startAutomationAction();
  }
}

function startAutomationAction() {
  if (operationMode === 'cli') {
    adsPowerRequest('startAutomation', { queueLength: messageQueue.length });
  }
  processMessageQueue();
}

function copyResultAction() {
  chrome.storage.local.get({ automationResults: {} }, (data) => {
    const result = data.automationResults[conversationKey] || '';
    navigator.clipboard
      .writeText(JSON.stringify(result))
      .then(() => {
        showToast('Resultado copiado');
        if (data.automationResults[conversationKey]) {
          delete data.automationResults[conversationKey];
          chrome.storage.local.set({ automationResults: data.automationResults });
        }
      })
      .catch((e) => {
        console.error('clipboard write failed', e);
      });
  });
}

function demoErrorAction() {
  const inputDiv = getPromptInput();
  if (inputDiv) {
    demoBigMistake(inputDiv);
  }
}

async function processMessageQueue() {
  if (sendingInProgress || messageQueue.length === 0) return;

  console.log('Iniciando automacao');


  const inputDiv = getPromptInput();
  if (inputDiv && getPromptText(inputDiv).length > 0) {
    userTyping = true;
    updateMessageList();
    return;
  }

  // Check if we need to wait due to delay
  const now = Date.now();
  const result = await chrome.storage.local.get(["promptDelay"]);
  const promptDelay = result.promptDelay || 0;
  const timeToWait = Math.max(0, lastMessageTime + promptDelay - now);

  if (timeToWait > 0) {
    // Clear any existing countdown
    if (countdownInterval) {
      clearInterval(countdownInterval);
    }

    // Start a new countdown
    let remainingTime = timeToWait;
    updateMessageList(remainingTime);

    countdownInterval = setInterval(() => {
      remainingTime = Math.max(0, remainingTime - 1000);
      updateMessageList(remainingTime);

      if (remainingTime <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);

    await new Promise((resolve) => setTimeout(resolve, timeToWait));
  }

  userTyping = false;
  const message = messageQueue[0];
  const success = await attemptToSendMessage(message);

  if (success) {
    lastMessageTime = Date.now();
    if (operationMode === 'cli') {
      adsPowerRequest('messageSent', { message });
    }
    messageQueue.shift();
    chrome.storage.local.set({ queuedMessages: messageQueue });
    const settings = await chrome.storage.local.get([
      'promptDelayMin',
      'promptDelayMax',
    ]);
    const min = settings.promptDelayMin;
    const max = settings.promptDelayMax;
    if (typeof min === 'number' && typeof max === 'number' && max >= min) {
      const nextDelay = Math.floor(Math.random() * (max - min + 1)) + min;
      chrome.storage.local.set({ promptDelay: nextDelay });
    }
  }

  updateQueueIndicator();
  updateMessageList();

  if (messageQueue.length === 0 && !sendingInProgress) {
    scheduleFinalizeAutomation();
  }
}

function setupContinueButtonWatcher() {
  let lastClickTime = 0;
  const CLICK_COOLDOWN = 2000; // 2 seconds cooldown between clicks

  const observer = new MutationObserver((mutations) => {
    const now = Date.now();
    if (now - lastClickTime < CLICK_COOLDOWN) {
      return; // Skip if we're still in cooldown
    }

    const continueButton = Array.from(
      document.querySelectorAll("button.btn")
    ).find((btn) => btn.textContent.includes("Continue generating"));

    if (continueButton) {
      console.log("Botão Continuar encontrado, clicando automaticamente");
      continueButton.click();
      lastClickTime = now;
    }
  });

  // Reduce the scope of what we're observing and optimize the configuration
  const chatArea = document.querySelector("main") || document.body;
  observer.observe(chatArea, {
    childList: true,
    subtree: true,
    attributes: false, // We don't need attribute changes
    characterData: false, // We don't need text changes
  });

  return observer;
}

// Utility: returns the current prompt input element (textarea or contentEditable div)
function getPromptInput() {
  return (
    document.querySelector("div#prompt-textarea[contenteditable='true']") ||
    document.querySelector("div#prompt-textarea") ||
    document.querySelector("textarea#prompt-textarea")
  );
}

// Utility: returns the text currently inside the prompt element regardless of type
function getPromptText(el) {
  if (el && el.innerText) {
    return el.innerText;
  }
  const ta = getHiddenTextarea();
  if (ta) {
    return ta.value;
  }
  return "";
}

// Utility: returns the hidden textarea used by ProseMirror (if any)
function getHiddenTextarea() {
  // Most recent ChatGPT markup: <textarea ... style="display:none"></textarea> <script></script> <div id="prompt-textarea" contenteditable>
  // Grab textarea that is a sibling of, or lives inside the same wrapper as, the prompt div.
  const promptDiv = document.getElementById("prompt-textarea");
  if (promptDiv && promptDiv.previousElementSibling && promptDiv.previousElementSibling.tagName === "TEXTAREA") {
    return promptDiv.previousElementSibling;
  }

  // Fallback: any textarea that is visually hidden but inside ProseMirror wrapper
  const candidate = document.querySelector("textarea[style*='display: none']");
  if (candidate) return candidate;

  // Ultimate fallback: first textarea on the page (least preferred)
  return document.querySelector("textarea");
}

// For ProseMirror contentEditable div: insert text preserving newlines

function showToast(msg, color = '#28a745') {
  const toast = document.createElement('div');
  toast.textContent = msg;
  toast.style.position = 'fixed';
  toast.style.bottom = '40px';
  toast.style.right = '10px';
  toast.style.zIndex = '2147483647';
  toast.style.backgroundColor = color;
  toast.style.color = '#fff';
  toast.style.padding = '4px 8px';
  toast.style.borderRadius = '4px';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1500);
}

function showShortcutInfo(msg) {
  let box = document.getElementById('shortcut-info-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'shortcut-info-box';
    box.style.position = 'fixed';
    box.style.bottom = '10px';
    box.style.right = '10px';
    box.style.zIndex = '2147483647';
    box.style.background = '#444';
    box.style.color = '#fff';
    box.style.padding = '6px 10px';
    box.style.borderRadius = '4px';
    box.style.fontSize = '12px';
    document.body.appendChild(box);
  }
  const item = document.createElement('div');
  item.textContent = msg;
  box.appendChild(item);
  setTimeout(() => {
    item.remove();
    if (!box.childElementCount) box.remove();
  }, 3000);
}

function showToolSpinner(message = 'Selecionando...') {
  let overlay = document.getElementById('tool-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'tool-loading-overlay';
    overlay.style.position = 'fixed';
    overlay.style.bottom = '10px';
    overlay.style.right = '10px';
    overlay.style.zIndex = '2147483647';
    overlay.style.background = '#333';
    overlay.style.color = '#fff';
    overlay.style.padding = '6px 10px';
    overlay.style.borderRadius = '4px';
    overlay.innerHTML =
      '<span class="spinner" style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation: spin 1s linear infinite;margin-right:4px;vertical-align:middle;"></span>' +
      `<span>${message}</span>`;
    const style = document.createElement('style');
    style.id = 'tool-loading-style';
    style.textContent = '@keyframes spin {to {transform: rotate(360deg);}}';
    overlay.appendChild(style);
    document.body.appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
    overlay.querySelector('span:last-child').textContent = message;
  }
}

function hideToolSpinner() {
  const overlay = document.getElementById('tool-loading-overlay');
  if (overlay) overlay.remove();
  const style = document.getElementById('tool-loading-style');
  if (style) style.remove();
}

function getUniqueSelector(el) {
  const path = [];
  while (el && el.nodeType === 1) {
    let sel = el.tagName.toLowerCase();
    if (el.id) {
      sel += `#${CSS.escape(el.id)}`;
    }
    if (el.classList.length) {
      sel += '.' + Array.from(el.classList).map((c) => CSS.escape(c)).join('.');
    }
    const sib = Array.from(el.parentNode.children).indexOf(el) + 1;
    sel += `:nth-child(${sib})`;
    path.unshift(sel);
    el = el.parentElement;
  }
  return path.join(' > ');
}

function startSelection() {
  if (selectionMode) return;
  selectionMode = true;
  highlightBox = document.createElement('div');
  highlightBox.style.position = 'fixed';
  highlightBox.style.zIndex = '2147483647';
  highlightBox.style.pointerEvents = 'none';
  highlightBox.style.backgroundColor = 'rgba(0,123,255,0.3)';
  highlightBox.style.border = '2px solid #007bff';
  document.body.appendChild(highlightBox);

  const hint = document.createElement('div');
  hint.id = 'selection-hint';
  hint.textContent = 'Clique para escolher elementos. Pressione ESC para sair';
  hint.style.position = 'fixed';
  hint.style.bottom = '10px';
  hint.style.right = '10px';
  hint.style.zIndex = '2147483647';
  hint.style.backgroundColor = '#007bff';
  hint.style.color = '#fff';
  hint.style.padding = '6px 10px';
  hint.style.borderRadius = '4px';
  document.body.appendChild(hint);

  function move(e) {
    const t = e.target;
    const r = t.getBoundingClientRect();
    highlightBox.style.top = r.top + 'px';
    highlightBox.style.left = r.left + 'px';
    highlightBox.style.width = r.width + 'px';
    highlightBox.style.height = r.height + 'px';
  }

  function click(e) {
    e.preventDefault();
    e.stopPropagation();
    const selector = getUniqueSelector(e.target);
    if (selector && !customClicks.includes(selector)) {
      customClicks.push(selector);
      chrome.storage.local.set({ customClicks });
      chrome.runtime.sendMessage({ type: 'selectionAdded', selector });
      showToast('Selecionado');
    }
  }

  function keydown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  function cleanup() {
    selectionMode = false;
    highlightBox.remove();
    const hintEl = document.getElementById('selection-hint');
    if (hintEl) hintEl.remove();
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', keydown, true);
  }

  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', keydown, true);
}

async function runCustomClicks() {
  for (const sel of customClicks) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        el.click();
        await new Promise((r) => setTimeout(r, 500));
      } else {
        console.error('Elemento nao encontrado para seletor:', sel);
        chrome.runtime.sendMessage({
          type: 'notify',
          message: `Elemento não encontrado: ${sel}`,
        });
      }
    } catch (e) {
      console.error('Erro ao clicar no seletor', sel, e);
      chrome.runtime.sendMessage({
        type: 'notify',
        message: `Erro ao clicar no seletor: ${sel}`,
      });
    }
  }
  showToast('Cliques executados');
}

function formatCombo(e) {
  const parts = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  parts.push(key);
  return parts.join('+');
}

function handleShortcut(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  const combo = formatCombo(e);
  if (combo === shortcuts.select) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    startSelection();
  } else if (combo === shortcuts.run) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    runCustomClicks();
  } else if (combo === shortcuts.toolImage) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    selectTool('Criar imagem');
  } else if (combo === shortcuts.toolInvestigate) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    selectTool('Investigar');
  } else if (combo === shortcuts.toolSearch) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    selectTool('Busca na Web');
  } else if (combo === shortcuts.toolWhiteboard) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    selectTool('Lousa');
  } else if (combo === shortcuts.pasteStart) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    pasteStartAction();
  } else if (combo === shortcuts.pasteStartAutomation) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    pasteStartAutomationAction();
  } else if (combo === shortcuts.startAutomation) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    startAutomationAction();
  } else if (combo === shortcuts.copyResult) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    copyResultAction();
  } else if (combo === shortcuts.demoError) {
    e.preventDefault();
    showShortcutInfo(`Atalho ${combo}`);
    demoErrorAction();
  }
}

document.addEventListener('keydown', handleShortcut, true);

if (typeof logger !== 'undefined' && logger.wrapObject) {
  logger.wrapObject({
    randomDelay,
    adsPowerRequest,
    normalize,
    getFirstFiveWords,
    splitMessages,
    detectTool,
    captureExistingAssistantMessages,
    setupResponseObserver,
    storeLastResponse,
    escapeHtml,
    checkQueueLimit,
    requestProStatus,
    setUniqueEventListener,
    updateQueueIndicator,
    updateMessageList,
    deleteQueueItem,
    handleKeyDown,
    reinjectUIComponents,
    addEventListeners,
    handleInput,
    scheduleQueueProcessing,
    scheduleFinalizeAutomation,
    waitForFinalResponseAndFinish,
    finalizeAutomation,
    getActiveToolName,
    getToolsButton,
    normalizeToolName,
    startAutomationAction,
    copyResultAction,
    demoErrorAction,
    setupContinueButtonWatcher,
    getPromptInput,
    getPromptText,
    getHiddenTextarea,
    showToast,
    showShortcutInfo,
    showToolSpinner,
    hideToolSpinner,
    getUniqueSelector,
    startSelection,
    formatCombo,
    handleShortcut,
  }, 'content.');
}
