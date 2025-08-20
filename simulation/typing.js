(function(global){
  'use strict';

  if (typeof global.getHiddenTextarea !== 'function') {
    global.getHiddenTextarea = function() {
      return (
        document.querySelector("textarea[style*='display:none']") ||
        document.querySelector('textarea')
      );
    };
  }

  if (typeof global.getPromptText !== 'function') {
    global.getPromptText = function(el) {
      if (el && typeof el.innerText === 'string') return el.innerText;
      const ta =
        typeof global.getHiddenTextarea === 'function' && global.getHiddenTextarea();
      return ta ? ta.value : '';
    };
  }

  // Insere texto em um elemento ProseMirror, preservando quebras de linha.
  function setProseMirrorContent(divEl, text) {
    divEl.focus();
    execCmd('selectAll');
    execCmd('delete');

    const lines = text.split(/\n/);
    lines.forEach((line, idx) => {
      if (idx > 0) {
        simulateKey(divEl, 'Enter', { shiftKey: true });
      }
      if (line) {
        execCmd('insertText', line);
      }
    });
  }

  // Digitação lenta, simulando erros de digitação e correções de forma mais
  // natural. Pequenas pausas adicionais são inseridas depois de pontuação ou
  // aleatoriamente entre letras para humanizar a experiência.
  async function typeTextSlowly(divEl, text, delay = 120) {
    const hiddenTA = getHiddenTextarea();
    divEl.focus();
    execCmd('selectAll');
    execCmd('delete');
    if (hiddenTA) {
      hiddenTA.value = '';
      hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    }

    const letters = 'abcdefghijklmnopqrstuvwxyz';
    delay = Math.max(40, delay + Math.floor((Math.random() - 0.5) * 40));

    function extraPause(ch) {
      if (/[.!?]/.test(ch)) return Math.random() * 600 + 200;
      if (ch === ' ') return Math.random() < 0.1 ? Math.random() * 200 + 100 : 0;
      return 0;
    }

    async function typeChars(chars, record = true) {
      for (const ch of chars) {
        let ms = delay + (/[.,!?;]/.test(ch) ? Math.floor(Math.random() * 250) : 0);

        if (record && /[a-z]/.test(ch)) {
          const r = Math.random();
          if (r < 0.08) {
            const wrong = letters[Math.floor(Math.random() * letters.length)];
            execCmd('insertText', wrong);
            await sleep(ms);
            execCmd('delete');
            await sleep(ms / 2);
          } else if (r < 0.1) {
            execCmd('insertText', ch);
            await sleep(ms / 2);
          }
        }

        if (ch === '\n') {
          simulateKey(divEl, 'Enter', { shiftKey: true });
        } else {
          execCmd('insertText', ch);
        }
        if (hiddenTA) {
          hiddenTA.value += ch;
          hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
        }
        await sleep(ms);
        const pause = extraPause(ch);
        if (pause) await sleep(pause);
      }
    }

    async function insertWrongWord(word) {
      await typeChars(word, false);
      await sleep(Math.random() * 200 + 50);
      for (let i = 0; i < word.length; i++) {
        simulateKey(divEl, 'ArrowLeft', { shiftKey: true });
        await sleep(delay / 2);
      }
      execCmd('delete');
      if (hiddenTA) {
        hiddenTA.value = hiddenTA.value.slice(0, -word.length);
        hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
      await sleep(delay / 2);
    }

    const tokens = text.match(/\S+|\s+/g) || [text];
    const points = shuffle([...Array(tokens.length + 1).keys()])
      .slice(0, Math.min(tokens.length + 1, 3))
      .sort((a, b) => a - b);
    let next = 0;
    const wrongWords = ['erado', 'wrnog', 'lrorem', 'tesste', 'opps'];

    for (let i = 0; i < tokens.length; i++) {
      if (next < points.length && points[next] === i && !isArrowToken(tokens[i])) {
        await insertWrongWord(wrongWords[Math.floor(Math.random() * wrongWords.length)]);
        next++;
      }
      await typeChars(tokens[i]);
    }

    if (next < points.length && points[next] === tokens.length) {
      await insertWrongWord(wrongWords[Math.floor(Math.random() * wrongWords.length)]);
    }
  }

  // Híbrido: digita parte lentamente e cola o restante de uma vez.
  async function typeTextHybrid(divEl, text, prefixLen = 10, delay = 120) {
    await typeTextSlowly(divEl, text.slice(0, prefixLen), delay);
    setProseMirrorContent(divEl, text);
  }

  // Robusta: digita lentamente e garante que o texto final esteja correto.
  async function typeTextRobust(divEl, text, delay = 120) {
    await typeTextSlowly(divEl, text, delay);
    const typed = getPromptText(divEl).trim();
    if (typed !== text.trim()) {
      setProseMirrorContent(divEl, text);
      const hiddenTA = getHiddenTextarea();
      if (hiddenTA) {
        hiddenTA.value = text;
        hiddenTA.dispatchEvent(
          new InputEvent('input', { bubbles: true, cancelable: true })
        );
      }
    }
  }

  // Demonstra um grande erro de digitação para fins de depuração.
  async function demoBigMistake(divEl) {
    const hiddenTA = getHiddenTextarea();
    divEl.focus();
    const rand = n =>
      Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

    const part1 = rand(20);
    await typeChars(part1);
    await sleep(200);

    for (let i = 0; i < 10; i++) {
      simulateKey(divEl, 'ArrowLeft', { shiftKey: true });
      await sleep(40);
    }
    execCmd('delete');
    await sleep(200);

    const part2 = rand(12);
    await typeChars(part2);
    await sleep(200);

    execCmd('selectAll');
    execCmd('delete');
  }

  global.setProseMirrorContent = setProseMirrorContent;
  global.typeTextSlowly = typeTextSlowly;
  global.typeTextHybrid = typeTextHybrid;
  global.typeTextRobust = typeTextRobust;
  global.demoBigMistake = demoBigMistake;
  global.typeTextRewrite = typeTextRewrite;
  global.typeTextRewriteRandom = typeTextRewriteRandom;

  async function typeTextTemplate(divEl, text, opts = {}) {
    let {
      delay = 120,
      errorRate = 0,
      pause = 0,
      jitter = 0,
      mistakes = 0,
      rewrites = 0,
      rewriteEnd = 0,
      rewriteRand = 0,
    } = opts;

    divEl.focus();
    execCmd('selectAll');
    execCmd('delete');

    const hiddenTA =
      typeof getHiddenTextarea === 'function' && getHiddenTextarea();
    if (hiddenTA) {
      hiddenTA.value = '';
      hiddenTA.dispatchEvent(
        new InputEvent('input', { bubbles: true, cancelable: true })
      );
    }

    const charDelay = () => Math.max(20, delay + (Math.random() - 0.5) * jitter);
    const tokens = text.match(/\S+|\s+/g) || [text];
    const wrongIdx = shuffle(tokens.map((_, i) => i))
      .slice(0, mistakes)
      .sort((a, b) => a - b);
    const rewriteIdx = shuffle(tokens.map((_, i) => i))
      .slice(0, rewrites)
      .sort((a, b) => a - b);
    let wi = 0,
      ri = 0;

    const typeChars = async (chars) => {
      for (const ch of chars) {
        if (ch === '\n') {
          simulateKey(divEl, 'Enter', { shiftKey: true });
        } else {
          execCmd('insertText', ch);
        }
        if (hiddenTA) {
          hiddenTA.value += ch;
          hiddenTA.dispatchEvent(
            new InputEvent('input', { bubbles: true, cancelable: true })
          );
        }
        await sleep(charDelay());
        if (errorRate > 0 && Math.random() < errorRate && /[a-z]/i.test(ch)) {
          const wrong = String.fromCharCode(97 + Math.floor(Math.random() * 26));
          execCmd('insertText', wrong);
          if (hiddenTA) {
            hiddenTA.value += wrong;
            hiddenTA.dispatchEvent(
              new InputEvent('input', { bubbles: true, cancelable: true })
            );
          }
          await sleep(charDelay());
          execCmd('delete');
          if (hiddenTA) {
            hiddenTA.value = hiddenTA.value.slice(0, -1);
            hiddenTA.dispatchEvent(
              new InputEvent('input', { bubbles: true, cancelable: true })
            );
          }
        }
        if (pause > 0 && Math.random() < 0.05) {
          await sleep(pause);
        }
      }
    };

    for (let i = 0; i < tokens.length; i++) {
      if (wi < wrongIdx.length && wrongIdx[wi] === i && tokens[i].trim()) {
        const invalid = '_____';
        await typeChars(invalid);
        for (let j = 0; j < invalid.length; j++) {
          execCmd('delete');
          if (hiddenTA) {
            hiddenTA.value = hiddenTA.value.slice(0, -1);
            hiddenTA.dispatchEvent(
              new InputEvent('input', { bubbles: true, cancelable: true })
            );
          }
          await sleep(charDelay() / 2);
        }
        wi++;
      }
      await typeChars(tokens[i]);
      if (ri < rewriteIdx.length && rewriteIdx[ri] === i && tokens[i].trim()) {
        for (let j = 0; j < tokens[i].length; j++) {
          execCmd('delete');
          if (hiddenTA) {
            hiddenTA.value = hiddenTA.value.slice(0, -1);
            hiddenTA.dispatchEvent(
              new InputEvent('input', { bubbles: true, cancelable: true })
            );
          }
          await sleep(charDelay() / 2);
        }
        await typeChars(tokens[i]);
        ri++;
      }
    }

    if (rewriteEnd > 0) {
      const words = text.trim().split(/\s+/);
      const segment = words.slice(-rewriteEnd).join(' ');
      for (let i = 0; i < segment.length; i++) {
        execCmd('delete');
        if (hiddenTA) {
          hiddenTA.value = hiddenTA.value.slice(0, -1);
          hiddenTA.dispatchEvent(
            new InputEvent('input', { bubbles: true, cancelable: true })
          );
        }
        await sleep(charDelay() / 2);
      }
      await typeChars(segment);
    }

    if (rewriteRand > 0) {
      const words = text.trim().split(/\s+/);
      const count = Math.min(rewriteRand, words.length);
      const startIdx = Math.floor(Math.random() * (words.length - count + 1));
      const wordTokens = tokens.reduce((arr, t, idx) => {
        if (/\S/.test(t)) arr.push(idx);
        return arr;
      }, []);
      const startToken = wordTokens[startIdx];
      const toDelete = tokens.slice(startToken).join('');
      for (let i = 0; i < toDelete.length; i++) {
        execCmd('delete');
        if (hiddenTA) {
          hiddenTA.value = hiddenTA.value.slice(0, -1);
          hiddenTA.dispatchEvent(
            new InputEvent('input', { bubbles: true, cancelable: true })
          );
        }
        await sleep(charDelay() / 2);
      }
      const segment = words.slice(startIdx, startIdx + count).join(' ');
      const after = words.slice(startIdx + count).join(' ');
      await typeChars(segment + (after ? ' ' + after : ''));
    }
  }
  global.typeTextTemplate = typeTextTemplate;

  async function typeTextRewrite(divEl, text, maxWords = 10, delay = 120) {
    await typeTextSlowly(divEl, text, delay);
    await deleteLastWordsHumanized(divEl, maxWords, delay);
    const words = text.trim().split(/\s+/);
    const count = Math.min(maxWords, words.length);
    if (count === 0) return;
    const toRewrite = words.slice(-count).join(' ');
    await typeTextSlowly(divEl, toRewrite, delay);
  }

  async function typeTextRewriteRandom(divEl, text, maxWords = 10, delay = 120) {
    const words = text.trim().split(/\s+/);
    const count = Math.min(maxWords, words.length);
    if (count === 0) {
      await typeTextSlowly(divEl, text, delay);
      return;
    }

    const start = Math.floor(Math.random() * (words.length - count + 1));
    const before = words.slice(0, start).join(' ');
    const segment = words.slice(start, start + count).join(' ');
    const after = words.slice(start + count).join(' ');

    // Primeira versão com erros na região selecionada
    const scramble = ch =>
      /[a-zA-Z]/.test(ch) ? String.fromCharCode(97 + Math.floor(Math.random() * 26)) : ch;
    const wrongSegment = segment.replace(/[a-zA-Z]/g, scramble);
    const firstDraft = [before, wrongSegment, after].filter(Boolean).join(' ');
    await typeTextSlowly(divEl, firstDraft, delay);

    // Apagar a região incorreta
    await deleteLastWordsHumanized(divEl, words.length - start, delay);

    // Reescrever corretamente
    const finalText = [segment, after].filter(Boolean).join(' ');
    await typeTextSlowly(divEl, finalText, delay);
  }

  const LAYOUTS = {
    QWERTY: {
      q: [0, 0], w: [0, 1], e: [0, 2], r: [0, 3], t: [0, 4],
      y: [0, 5], u: [0, 6], i: [0, 7], o: [0, 8], p: [0, 9],
      a: [1, 0], s: [1, 1], d: [1, 2], f: [1, 3], g: [1, 4],
      h: [1, 5], j: [1, 6], k: [1, 7], l: [1, 8],
      z: [2, 0], x: [2, 1], c: [2, 2], v: [2, 3], b: [2, 4],
      n: [2, 5], m: [2, 6]
    }
  };

  const PROFILES = {
    beginner: { wpm: 40, sd: 10, errorRate: 0.03, jitter: 20 },
    advanced: { wpm: 65, sd: 8, errorRate: 0.01, jitter: 10 },
    distracted: { wpm: 45, sd: 15, errorRate: 0.05, jitter: 25 }
  };

  function sampleNormal(mean, sd) {
    const u = Math.random() || 1e-6;
    const v = Math.random() || 1e-6;
    return (
      mean +
      sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    );
  }

  function keyDistance(prev, ch, layout) {
    const map = LAYOUTS[layout] || LAYOUTS.QWERTY;
    const p1 = map[String(prev).toLowerCase()];
    const p2 = map[String(ch).toLowerCase()];
    if (!p1 || !p2) return 1;
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return Math.sqrt(dx * dx + dy * dy) || 0.1;
  }

  function baseCharDelay(profile) {
    const wpm = Math.max(10, sampleNormal(profile.wpm, profile.sd));
    const charsPerMs = (wpm * 5) / 60000;
    return 1 / charsPerMs;
  }

  async function typeTextRealistic(divEl, text, opts = {}) {
    const profile = { ...(PROFILES[opts.profile] || PROFILES.beginner) };
    const layout = opts.layout || 'QWERTY';
    divEl.focus();
    execCmd('selectAll');
    execCmd('delete');
    const hiddenTA = getHiddenTextarea();
    if (hiddenTA) {
      hiddenTA.value = '';
      hiddenTA.dispatchEvent(
        new InputEvent('input', { bubbles: true, cancelable: true })
      );
    }

    let prev = '';
    let wordCount = 0;
    let nextBurst = 5 + Math.floor(Math.random() * 4);

    const firstDelay = 200 + Math.random() * 300;
    await sleep(firstDelay);

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      let delay = baseCharDelay(profile);
      delay += keyDistance(prev, ch, layout) * 10;

      if (ch === ' ') {
        delay += 100 + Math.random() * 100;
        wordCount++;
      }

      if (/[A-Z]/.test(ch) || /[^\w\s]/.test(ch)) {
        delay += 50 + Math.random() * 50;
      }

      if (/[.!?]/.test(ch)) {
        delay += 300 + Math.random() * 400;
      }

      delay += (Math.random() * 2 - 1) * profile.jitter;
      delay = Math.max(20, delay);

      if (wordCount >= nextBurst) {
        await sleep(200 + Math.random() * 300);
        nextBurst += 5 + Math.floor(Math.random() * 4);
      }

      if (Math.random() < 0.02 && (ch === ' ' || /[.!?]/.test(ch))) {
        await sleep(500 + Math.random() * 1500);
      }

      if (Math.random() < profile.errorRate && /[a-z]/i.test(ch)) {
        const letters = 'abcdefghijklmnopqrstuvwxyz';
        let wrong = letters[Math.floor(Math.random() * letters.length)];
        while (wrong === ch.toLowerCase()) {
          wrong = letters[Math.floor(Math.random() * letters.length)];
        }
        execCmd('insertText', wrong);
        if (hiddenTA) {
          hiddenTA.value += wrong;
          hiddenTA.dispatchEvent(
            new InputEvent('input', { bubbles: true, cancelable: true })
          );
        }
        await sleep(delay);

        const lookahead = Math.random() < 0.5 && i + 1 < text.length ? 1 : 0;
        for (let j = 0; j < lookahead; j++) {
          const nextCh = text[i + j + 1];
            execCmd('insertText', nextCh);
          if (hiddenTA) {
            hiddenTA.value += nextCh;
            hiddenTA.dispatchEvent(
              new InputEvent('input', { bubbles: true, cancelable: true })
            );
          }
          await sleep(delay);
        }

        for (let j = 0; j < lookahead + 1; j++) {
          simulateKey(divEl, 'Backspace');
          if (hiddenTA) {
            hiddenTA.value = hiddenTA.value.slice(0, -1);
            hiddenTA.dispatchEvent(
              new InputEvent('input', { bubbles: true, cancelable: true })
            );
          }
          await sleep(delay / 2);
        }

        execCmd('insertText', ch);
        if (hiddenTA) {
          hiddenTA.value += ch;
          hiddenTA.dispatchEvent(
            new InputEvent('input', { bubbles: true, cancelable: true })
          );
        }
        await sleep(delay);

        for (let j = 0; j < lookahead; j++) {
          const nextCh = text[i + j + 1];
          execCmd('insertText', nextCh);
          if (hiddenTA) {
            hiddenTA.value += nextCh;
            hiddenTA.dispatchEvent(
              new InputEvent('input', { bubbles: true, cancelable: true })
            );
          }
          await sleep(delay);
        }

        i += lookahead;
        prev = lookahead ? text[i] : ch;
        await sleep(delay);
        continue;
      }

      if (ch === '\n') {
        simulateKey(divEl, 'Enter', { shiftKey: true });
      } else {
        execCmd('insertText', ch);
      }
      if (hiddenTA) {
        hiddenTA.value += ch;
        hiddenTA.dispatchEvent(
          new InputEvent('input', { bubbles: true, cancelable: true })
        );
      }

      prev = ch;
      await sleep(delay);
    }
  }

  global.typeTextRealistic = typeTextRealistic;

  function learnTypingPattern(intervals = []) {
    if (!intervals.length) return null;
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const sd =
      Math.sqrt(
        intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
          intervals.length
      ) || 1;
    return { mean, sd };
  }

  async function typeTextImitador(divEl, text, sample = [], opts = {}) {
    const pattern = learnTypingPattern(sample) || { mean: 120, sd: 30 };
    let mean = pattern.mean;
    let sd = pattern.sd;

    const stats = { n: 0, mean: 0, m2: 0 };
    function updateStats(x) {
      stats.n++;
      const delta = x - stats.mean;
      stats.mean += delta / stats.n;
      stats.m2 += delta * (x - stats.mean);
    }

    function sdNow() {
      return stats.n > 1 ? Math.sqrt(stats.m2 / (stats.n - 1)) : 0;
    }

    function adjustIfNeeded() {
      if (stats.n < 10) return;
      if (Math.abs(stats.mean - mean) > mean * 0.3) {
        mean = mean * 0.8 + stats.mean * 0.2;
      }
      const currentSd = sdNow();
      if (Math.abs(currentSd - sd) > sd * 0.5) {
        sd = sd * 0.8 + currentSd * 0.2;
      }
      stats.n = 0;
      stats.mean = 0;
      stats.m2 = 0;
    }

    divEl.focus();
    execCmd('selectAll');
    execCmd('delete');
    const hiddenTA = getHiddenTextarea();
    if (hiddenTA) {
      hiddenTA.value = '';
      hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    }

    for (const ch of text) {
      let delay = Math.max(20, sampleNormal(mean, sd));
      if (/[.!?]/.test(ch)) delay += 200;
      if (ch === ' ') delay += 50;
      if (ch === '\n') {
        simulateKey(divEl, 'Enter', { shiftKey: true });
      } else {
        execCmd('insertText', ch);
      }
      if (hiddenTA) {
        hiddenTA.value += ch;
        hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
      await sleep(delay);
      updateStats(delay);
      adjustIfNeeded();
    }
  }

  // Apaga um texto caractere a caractere de forma humanizada
  async function deleteTextHumanized(divEl, text, delay = 120) {
    if (typeof text !== 'string') text = String(text ?? '');
    setProseMirrorContent(divEl, text);
    const hiddenTA = typeof getHiddenTextarea === 'function' && getHiddenTextarea();
    if (hiddenTA) {
      hiddenTA.value = text;
      hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    }
    const chars = text.split('');
    for (let i = chars.length - 1; i >= 0; i--) {
      const ch = chars[i];
      simulateKey(divEl, 'Backspace');
      if (hiddenTA) {
        hiddenTA.value = hiddenTA.value.slice(0, -1);
        hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
      let ms = Math.max(20, delay + Math.floor((Math.random() - 0.5) * 40));
      if (/[.!?]/.test(ch)) ms += 200;
      if (ch === ' ') ms += 50;
      await sleep(ms);
    }
  }

  // Remove as últimas `numWords` palavras do elemento de forma humanizada
  async function deleteLastWordsHumanized(divEl, numWords, delay = 120) {
    if (!numWords) return;
    const current = getPromptText(divEl);
    const words = current.trim().split(/\s+/);
    const count = Math.min(numWords, words.length);
    if (count === 0) return;
    let fragment = words.slice(-count).join(' ');
    if (words.length > count) {
      fragment = ' ' + fragment;
    }
    const hiddenTA = typeof getHiddenTextarea === 'function' && getHiddenTextarea();
    for (let i = fragment.length - 1; i >= 0; i--) {
      const ch = fragment[i];
      simulateKey(divEl, 'Backspace');
      if (hiddenTA) {
        hiddenTA.value = hiddenTA.value.slice(0, -1);
        hiddenTA.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      }
      let ms = Math.max(20, delay + Math.floor((Math.random() - 0.5) * 40));
      if (/[.!?]/.test(ch)) ms += 200;
      if (ch === ' ') ms += 50;
      await sleep(ms);
    }
  }

  global.typeTextImitador = typeTextImitador;
  global.deleteTextHumanized = deleteTextHumanized;
  global.deleteLastWordsHumanized = deleteLastWordsHumanized;
  global.learnTypingPattern = learnTypingPattern;
})(typeof window !== 'undefined' ? window : this);
