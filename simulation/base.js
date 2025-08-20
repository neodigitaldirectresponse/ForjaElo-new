/**
 * keyboardUtils.js
 * Módulo de utilitários para simulação de teclado e navegação DOM.
 * Compatível com AMD, CommonJS e inclusion via <script> no navegador.
 */
(function (global, factory) {
  if (typeof define === 'function' && define.amd) {
    define(factory);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.keyboardUtils = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /**
   * Simula evento(s) de teclado: keydown, keypress e keyup.
   * @param {Element|Document} target - Elemento a receber o evento
   * @param {string} key - Caractere ou nome da tecla (e.g. 'A', 'Enter')
   * @param {Object} [opts] - Opções adicionais (bubbles, cancelable, composed)
   */
  function simulateKey(target, key, opts = {}) {
    const baseCodes = {
      Backspace: 8, Tab: 9, Enter: 13, Escape: 27,
      ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Delete: 46,
      '/': 191
    };
    let code = key;
    let keyCode = baseCodes[key] || 0;
    let charCode = key.length === 1 ? key.charCodeAt(0) : 0;

    if (!keyCode && key.length === 1) {
      const upper = key.toUpperCase();
      if (/^[A-Z]$/.test(upper)) {
        code = `Key${upper}`;
        keyCode = upper.charCodeAt(0);
      } else if (/^\d$/.test(key)) {
        code = `Digit${key}`;
        keyCode = key.charCodeAt(0);
      } else {
        keyCode = key.charCodeAt(0);
      }
    }

    if (key === '/') {
      code = 'Slash';
    }

    const eventOptions = Object.assign({
      key,
      code,
      keyCode,
      charCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true
    }, opts);

    ['keydown', 'keypress', 'keyup'].forEach(type => {
      const ev = new KeyboardEvent(type, eventOptions);
      target.dispatchEvent(ev);
    });
  }

  /**
   * Simula digitação de texto, caractere a caractere, com atraso.
   * @param {Element|Document} target
   * @param {string} text
   * @param {number} [delay=100] - Tempo médio entre caracteres (ms)
   * @returns {Promise<void>}
   */
  async function simulateText(target, text, delay = 100) {
    for (const ch of text) {
      if (ch === '\n') {
        simulateKey(target, 'Enter', { shiftKey: true });
      } else {
        simulateKey(target, ch);
      }
      await sleep(delay + (Math.random() - 0.5) * (delay * 0.3));
    }
  }

  /**
   * Pausa a execução por um intervalo de tempo.
   * @param {number} ms - Milissegundos
   * @returns {Promise<void>}
   */
  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  /**
   * Embaralha um array (Fisher–Yates).
   * @template T
   * @param {T[]} array
   * @returns {T[]}
   */
  function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Executa comandos de edição: insertText, delete, selectAll.
   * Compatível com document.execCommand e fallback manual.
   * @param {'insertText'|'delete'|'selectAll'} cmd
   * @param {string} [arg]
   */
  function execCmd(cmd, arg) {
    if (typeof document.execCommand === 'function') {
      document.execCommand(cmd, false, arg);
      return;
    }
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    switch (cmd) {
      case 'insertText':
        range.deleteContents();
        range.insertNode(document.createTextNode(arg));
        range.collapse(false);
        break;
      case 'delete':
        if (!sel.isCollapsed) {
          range.deleteContents();
        } else {
          range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
          range.deleteContents();
        }
        break;
      case 'selectAll':
        const root = document.activeElement || document.body;
        const all = document.createRange();
        all.selectNodeContents(root);
        sel.removeAllRanges();
        sel.addRange(all);
        break;
    }
  }

  /**
   * Verifica se um token é uma seta (→, ←, ↑, ↓).
   * @param {string} token
   * @returns {boolean}
   */
  function isArrowToken(token) {
    return /^[\u2190-\u21FF\u2B05-\u2B07]$/.test(token);
  }

  /**
   * Retorna elementos focáveis visíveis e habilitados.
   * @returns {HTMLElement[]}
   */
  function getFocusableElements() {
    return Array.from(document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
  }

  /**
   * Foca elemento utilizando Tab até atingi-lo ou timeout.
   * @param {HTMLElement} target
   * @param {number} [timeout=2000] - Tempo máximo (ms)
   * @returns {Promise<boolean>}
   */
  async function focusElementViaTab(target, timeout = 2000) {
    const start = Date.now();
    const list = getFocusableElements();
    for (const el of list) {
      el.focus();
      await sleep(50);
      if (document.activeElement === target) return true;
      if (Date.now() - start > timeout) break;
    }
    target.focus();
    return document.activeElement === target;
  }

  // Exportação de funções
  return {
    simulateKey,
    simulateText,
    sleep,
    shuffle,
    execCmd,
    isArrowToken,
    getFocusableElements,
    focusElementViaTab
  };
}));

// Compatibilidade: expor funcoes individualmente no escopo global
(function(g){
  const utils = g.keyboardUtils;
  if(!utils) return;
  Object.keys(utils).forEach(k => {
    if (typeof g[k] === 'undefined') {
      g[k] = utils[k];
    }
  });
})(typeof window !== 'undefined' ? window : this);
