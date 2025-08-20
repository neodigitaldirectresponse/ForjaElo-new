(function(global){
  'use strict';

  function requireFn(name){
    const fn = global[name];
    if(typeof fn !== 'function'){
      throw new Error(`Funcao ${name} nao encontrada`);
    }
    return fn;
  }

  async function run(element, text, opts = {}) {
    const delay = Number(opts.delay) || 120;
    const withError = !!opts.error;
    const logDeleted = !!opts.logDeleted;
    const withTyping = !!opts.typeStart;
    const partialWords = Number(opts.partialWords) || 0;

    if (!element || typeof element.focus !== 'function') {
      throw new Error('Elemento invalido para simulacao');
    }
    if (typeof text !== 'string') text = String(text ?? '');

    const deleteHumanized = requireFn('deleteTextHumanized');
    const deleteLastWords = requireFn('deleteLastWordsHumanized');
    const typeSlowly = requireFn('typeTextSlowly');
    const setContent = requireFn('setProseMirrorContent');

    const wrongWords = ['erado', 'wrnog', 'lrorem', 'tesste', 'opps'];
    let startText = text;
    if (withError) {
      const parts = text.trim().split(/\s+/);
      if (parts.length) {
        const idx = Math.floor(parts.length / 2);
        parts[idx] = wrongWords[Math.floor(Math.random() * wrongWords.length)];
        startText = parts.join(' ');
      }
    }

    const deleted = startText.trim().split(/\s+/);
    if (withTyping) {
      await typeSlowly(element, startText, delay);
    } else {
      setContent(element, startText);
    }

    try {
      if (partialWords > 0) {
        await deleteLastWords(element, partialWords, delay);
        const finalWords = text.trim().split(/\s+/);
        const toType = finalWords.slice(-partialWords).join(' ');
        await typeSlowly(element, toType, delay);
      } else {
        await deleteHumanized(element, startText, delay);
        if (logDeleted && deleted.length) {
          console.log('Palavras apagadas:', deleted.join(', '));
        }
        await typeSlowly(element, text, delay);
      }
    } catch (err) {
      console.error('Falha na simulacao apagar-reescrever:', err);
    }
  }

  global.simulacoes = global.simulacoes || {};
  global.simulacoes.apagarReescrever = { run };
})(typeof window !== 'undefined' ? window : this);
