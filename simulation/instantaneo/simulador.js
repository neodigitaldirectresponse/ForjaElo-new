(function(global){
  'use strict';

  function requireFn(name){
    const fn = global[name];
    if(typeof fn !== 'function'){
      throw new Error(`Funcao ${name} nao encontrada`);
    }
    return fn;
  }

  async function run(element, text){
    if(!element || typeof element.focus !== 'function'){
      throw new Error('Elemento invalido para simulacao');
    }
    if(typeof text !== 'string'){ text = String(text ?? ''); }
    const setContent = requireFn('setProseMirrorContent');
    try{
      setContent(element, text);
      const hiddenTA = typeof getHiddenTextarea === 'function' && getHiddenTextarea();
      if(hiddenTA){
        hiddenTA.value = text;
        hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
    }catch(err){
      console.error('Falha na simulacao instantanea:', err);
    }
  }

  global.simulacoes = global.simulacoes || {};
  global.simulacoes.instantaneo = { run };
})(typeof window !== 'undefined' ? window : this);
