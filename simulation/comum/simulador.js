(function(global){
  'use strict';

  function requireFn(name){
    const fn = global[name];
    if(typeof fn !== 'function'){
      throw new Error(`Funcao ${name} nao encontrada`);
    }
    return fn;
  }

  async function run(element, text, opts={}){
    const delay = Number(opts.delay) || 120;
    if(!element || typeof element.focus !== 'function'){
      throw new Error('Elemento invalido para simulacao');
    }
    if(typeof text !== 'string'){ text = String(text ?? ''); }
    const typeSlowly = requireFn('typeTextSlowly');
    try{
      await typeSlowly(element, text, delay);
    }catch(err){
      console.error('Falha na simulacao comum:', err);
    }
  }

  global.simulacoes = global.simulacoes || {};
  global.simulacoes.comum = { run };
})(typeof window !== 'undefined' ? window : this);
