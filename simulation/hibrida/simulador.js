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
    const prefixLen = Number(opts.prefixLen) || 10;
    if(!element || typeof element.focus !== 'function'){
      throw new Error('Elemento invalido para simulacao');
    }
    if(typeof text !== 'string'){ text = String(text ?? ''); }
    const typeHybrid = requireFn('typeTextHybrid');
    try{
      await typeHybrid(element, text, prefixLen, delay);
    }catch(err){
      console.error('Falha na simulacao hibrida:', err);
    }
  }

  global.simulacoes = global.simulacoes || {};
  global.simulacoes.hibrida = { run };
})(typeof window !== 'undefined' ? window : this);
