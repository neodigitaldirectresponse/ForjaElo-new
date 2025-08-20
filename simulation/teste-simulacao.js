(() => {
  'use strict';

  /**
   * Tipos de texto predefinidos para simulação
   */
  const predefinedTexts = {
    tech:    'A curva de resposta em frequência indica que a atenuação do sinal ocorre acima de 10kHz.',
    chat:    'E aí, tudo bem? Vamos marcar aquele café qualquer dia desses! :)',
    code:    'for (let i = 0; i < 3; i++) {\n  console.log(i);\n}',
    poem:    'No meio do caminho havia uma pedra, havia uma pedra no meio do caminho.',
    lorem:   'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod.'
  };

  /**
   * Configurações para cada modo de digitação
   */
  const modeConfigs = {
    padrao:           { delay: 120, errorRate: 0.03, pause: 0, jitter: 40, mistakes: 2, rewrites: 0, rewriteEnd: 0, rewriteRand: 0, prefixLen: 10 },
    instantaneo:      { delay: 0,   errorRate: 0,    pause: 0, jitter: 0,  mistakes: 0, rewrites: 0, rewriteEnd: 0, rewriteRand: 0, prefixLen: 0  },
    comum:            { delay: 120, errorRate: 0,    pause: 0, jitter: 40, mistakes: 0, rewrites: 0, rewriteEnd: 0, rewriteRand: 0, prefixLen: 0  },
    hibrida:          { delay: 120, errorRate: 0,    pause: 0, jitter: 40, mistakes: 0, rewrites: 0, rewriteEnd: 0, rewriteRand: 0, prefixLen: 10 },
    robusta:          { delay: 120, errorRate: 0,    pause: 0, jitter: 40, mistakes: 0, rewrites: 0, rewriteEnd: 0, rewriteRand: 0, prefixLen: 0  },
    imitador:         { /* depende de amostra */ },
    apagarReescrever: { delay: 120, errorRate: 0,    pause: 0, jitter: 40, mistakes: 0, rewrites: 0, rewriteEnd: 0, rewriteRand: 0, prefixLen: 0 },
    rewriteRandom:    { delay: 120, errorRate: 0,    pause: 0, jitter: 40, mistakes: 0, rewrites: 0, rewriteEnd: 0, rewriteRand: 3, prefixLen: 0 },
    template:        { delay: 70,  errorRate: 0.03, pause: 1000, jitter: 100, mistakes: 2, rewrites: 0, rewriteEnd: 1, rewriteRand: 10, prefixLen: 0 },
    templateFast:    { delay: 50,  errorRate: 0.02, pause: 500,  jitter: 60,  mistakes: 1, rewrites: 0, rewriteEnd: 0, rewriteRand: 5,  prefixLen: 0 },
    templateSlow:    { delay: 150, errorRate: 0.05, pause: 1500, jitter: 120, mistakes: 3, rewrites: 0, rewriteEnd: 2, rewriteRand: 15, prefixLen: 0 }
  };

  /**
   * Descrições amigáveis para cada modo
   */
  const modeDescriptions = {
    padrao:           'Digitação humanizada com erros eventuais.',
    instantaneo:      'Insere todo o texto de uma vez, sem animação.',
    comum:            'Digita de forma constante conforme velocidade.',
    hibrida:          'Digita prefixo e cola o restante.',
    robusta:          'Garante correção após digitação.',
    imitador:         'Reproduz ritmo a partir de amostra gravada.',
    apagarReescrever: 'Apaga e reescreve o texto final.',
    rewriteRandom:    'Reescreve um trecho aleatório após digitar.',
    template:         'Template personalizado de simulação.',
    templateFast:     'Template rápido com 50 ms de atraso.',
    templateSlow:     'Template lento com 150 ms de atraso.'
  };

  /**
   * Elementos da interface
   */
  const D = {
    output:        document.getElementById('output'),
    logArea:       document.getElementById('log'),
    isoLogArea:    document.getElementById('isoLog'),
    scenario:      document.getElementById('scenario'),
    customText:    document.getElementById('customText'),
    modeSelect:    document.getElementById('mode'),
    speed:         document.getElementById('speed'),
    error:         document.getElementById('error'),
    pause:         document.getElementById('pause'),
    jitter:        document.getElementById('jitter'),
    mistakes:      document.getElementById('mistakes'),
    rewrites:      document.getElementById('rewrites'),
    rewriteEnd:    document.getElementById('rewriteEnd'),
    rewriteRand:   document.getElementById('rewriteRand'),
    prefixLen:     document.getElementById('prefixLen'),
    repeatInput:   document.getElementById('repeat'),
    delSpeed:      document.getElementById('delSpeed'),
    recordBtn:     document.getElementById('record'),
    sampleInfo:    document.getElementById('sampleInfo'),
    runBtn:        document.getElementById('run'),
    deleteBtn:     document.getElementById('deleteBtn'),
    isoForm:       document.getElementById('isoRewriteForm'),
    isoText:       document.getElementById('isoText'),
    isoSpeed:      document.getElementById('isoSpeed'),
    clearBtn:      document.getElementById('clear'),
    saveLogBtn:    document.getElementById('saveLog'),
    saveModeBtn:   document.getElementById('saveMode'),
    modeDesc:      document.getElementById('modeDesc'),
    metrics: {
      speedVal:    document.getElementById('speedVal'),
      errorVal:    document.getElementById('errorVal'),
      pauseVal:    document.getElementById('pauseVal'),
      jitterVal:   document.getElementById('jitterVal'),
      mistakeVal:  document.getElementById('mistakeVal'),
      rewriteVal:  document.getElementById('rewriteVal'),
      rewriteEndVal: document.getElementById('rewriteEndVal'),
      rewriteRandVal: document.getElementById('rewriteRandVal'),
      prefixVal:   document.getElementById('prefixVal'),
      delSpeedVal: document.getElementById('delSpeedVal'),
      isoSpeedVal: document.getElementById('isoSpeedVal')
    }
  };

  // Estado para modo imitador
  let isRecording = false;
  let lastTimestamp = null;
  const samples = [];

  /**
   * Utilitário para pausar execução
   */
  const sleep = ms => new Promise(res => setTimeout(res, ms));

  /**
   * Embaralha um array (Fisher-Yates)
   */
  function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Atualiza valores exibidos ao usuário
   */
  function updateMetrics() {
    Object.entries(D.metrics).forEach(([key, el]) => {
      const src = key.replace('Val', '');
      if (D[src] && el) el.textContent = D[src].value;
    });
  }

  /**
   * Aplica configurações do modo selecionado
   */
  function applyModeConfig(mode) {
    const cfg = modeConfigs[mode];
    if (!cfg) return;
    Object.keys(cfg).forEach(prop => {
      if (D[prop]) D[prop].value = cfg[prop];
    });
    D.modeDesc.textContent = modeDescriptions[mode] || '';
    updateMetrics();
  }

  /**
   * Registra logs personalizados
   */
  function log(message, base = Date.now(), area = D.logArea) {
    if (!area) return;
    const elapsed = Date.now() - base;
    area.value += `[+${elapsed}ms] ${message}\n`;
    area.scrollTop = area.scrollHeight;
  }

  /**
   * Gera personagem e simula a digitação de um texto
   */
  async function simulateTyping(text, {
    delay = 120, errorRate = 0, pause = 0,
    jitter = 0, mistakes = 0, rewrites = 0,
    rewriteEnd = 0, rewriteRand = 0, prefixLen = 0
  } = {}) {
    D.output.focus();
    const start = Date.now();
    const charDelay = () => Math.max(20, delay + (Math.random() - 0.5) * jitter);
    const tokens = text.match(/\S+|\s+/g) || [text];
    const wrongIdx   = shuffle(tokens.map((_,i) => i)).slice(0, mistakes).sort((a,b)=>a-b);
    const rewriteIdx = shuffle(tokens.map((_,i) => i)).slice(0, rewrites).sort((a,b)=>a-b);
    let wi = 0, ri = 0;

    // Função para digitar caracteres com possíveis erros e pausas
    const typeChars = async chars => {
      for (const ch of chars) {
        document.execCommand('insertText', false, ch);
        log(`typed '${ch}'`, start);
        await sleep(charDelay());
        if (errorRate > 0 && Math.random() < errorRate && /[a-z]/i.test(ch)) {
          const wrong = String.fromCharCode(97 + Math.floor(Math.random()*26));
          document.execCommand('insertText', false, wrong);
          log(`error '${wrong}'`, start);
          await sleep(charDelay());
          document.execCommand('delete');
        }
        if (pause > 0 && Math.random() < 0.05) {
          log('pause', start);
          await sleep(pause);
        }
      }
    };

    for (let i = 0; i < tokens.length; i++) {
      if (wi < wrongIdx.length && wrongIdx[wi] === i && tokens[i].trim()) {
        const invalid = '_____';
        await typeChars(invalid);
        for (let j = 0; j < invalid.length; j++) {
          document.execCommand('delete');
          await sleep(charDelay()/2);
        }
        wi++;
      }
      await typeChars(tokens[i]);
      if (ri < rewriteIdx.length && rewriteIdx[ri] === i && tokens[i].trim()) {
        for (let j = 0; j < tokens[i].length; j++) {
          document.execCommand('delete');
          await sleep(charDelay()/2);
        }
        await typeChars(tokens[i]);
        ri++;
      }
    }

    // Reescrever final se necessário
    if (rewriteEnd > 0) {
      const words = text.trim().split(/\s+/);
      const segment = words.slice(-rewriteEnd).join(' ');
      for (let i = 0; i < segment.length; i++) {
        document.execCommand('delete');
        await sleep(charDelay()/2);
      }
      await typeChars(segment);
    }

    // Reescrever parte aleatória se configurado
    if (rewriteRand > 0) {
      const words = text.trim().split(/\s+/);
      const count = Math.min(rewriteRand, words.length);
      const startIdx = Math.floor(Math.random() * (words.length - count + 1));
      const wordTokens = tokens.reduce((arr, t, i) => { if (/\S/.test(t)) arr.push(i); return arr; }, []);
      const startToken = wordTokens[startIdx];
      const toDelete = tokens.slice(startToken).join('');
      for (let i = 0; i < toDelete.length; i++) {
        document.execCommand('delete');
        await sleep(charDelay()/2);
      }
      const segment = words.slice(startIdx, startIdx + count).join(' ');
      const after = words.slice(startIdx + count).join(' ');
      await typeChars(segment + (after ? ' ' + after : ''));
    }
  }

  /**
   * Função principal para executar simulação conforme modo
   */
  async function runOnce() {
    D.logArea.value = '';
    const base   = (D.customText.value || predefinedTexts[D.scenario.value] || '').trim();
    const opts   = {
      delay:     +D.speed.value,
      errorRate: +D.error.value / 100,
      pause:     +D.pause.value,
      jitter:    +D.jitter.value,
      mistakes:  +D.mistakes.value,
      rewrites:  +D.rewrites.value,
      rewriteEnd:+D.rewriteEnd.value,
      rewriteRand:+D.rewriteRand.value,
      prefixLen: +D.prefixLen.value
    };
    const mode = D.modeSelect.value;

    switch (mode) {
      case 'instantaneo':
        document.execCommand('insertText', false, base);
        break;
      case 'imitador':
        if (samples.length < 5) {
          alert('Grave uma amostra antes de usar o modo Imitador.');
          return;
        }
        // Aqui você chamaria função personalizada para imitador
        break;
      default:
        await simulateTyping(base, opts);
    }
  }

  /**
   * Vincula eventos aos controles da UI
   */
  function bindEvents() {
    // Atualização de labels
    [D.speed, D.error, D.pause, D.jitter, D.mistakes, D.rewrites, D.rewriteEnd, D.rewriteRand, D.prefixLen, D.delSpeed, D.isoSpeed]
      .filter(Boolean)
      .forEach(el => el.addEventListener('input', updateMetrics));

    // Modo
    D.modeSelect.addEventListener('change', () => applyModeConfig(D.modeSelect.value));
    D.saveModeBtn?.addEventListener('click', () => {
      const m = D.modeSelect.value;
      modeConfigs[m] = { ...modeConfigs[m], delay:+D.speed.value, errorRate:+D.error.value/100,
        pause:+D.pause.value, jitter:+D.jitter.value, mistakes:+D.mistakes.value,
        rewrites:+D.rewrites.value, rewriteEnd:+D.rewriteEnd.value, prefixLen:+D.prefixLen.value };
      applyModeConfig(m);
    });

    // Simulação
    D.runBtn.addEventListener('click', async () => {
      const times = Math.min(Math.max(+D.repeatInput.value || 1, 1), 100);
      for (let i = 0; i < times; i++) await runOnce();
    });

    // Gravação de amostra (imitador)
    D.recordBtn.addEventListener('click', () => {
      isRecording = !isRecording;
      if (isRecording) {
        samples.length = 0; lastTimestamp = performance.now();
        D.recordBtn.textContent = 'Parar'; D.sampleInfo.textContent = 'Gravando...';
      } else {
        D.recordBtn.textContent = 'Gravar';
        D.sampleInfo.textContent = `Amostra: ${samples.length} intervalos`;
      }
    });
    D.output.addEventListener('keydown', e => {
      if (!isRecording) return;
      const now = performance.now();
      samples.push(now - lastTimestamp);
      lastTimestamp = now;
      D.sampleInfo.textContent = `Amostra: ${samples.length} intervalos`;
    });

    // Limpeza e download de log
    D.clearBtn?.addEventListener('click', () => { D.output.textContent = ''; D.logArea.value = ''; });
    D.saveLogBtn?.addEventListener('click', () => {
      const blob = new Blob([D.logArea.value], { type: 'text/plain' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a'); a.href = url; a.download = 'simulacao-log.txt'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Inicialização ao carregar o DOM
  document.addEventListener('DOMContentLoaded', () => {
    updateMetrics();
    applyModeConfig(D.modeSelect.value);
    bindEvents();
  });
})();
