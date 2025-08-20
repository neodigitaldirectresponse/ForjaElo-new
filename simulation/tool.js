(function(global){
  'use strict';

  // Procura o botão de ferramentas navegando com Tab até encontrar texto com "/".
  async function findToolsButtonByTab(maxCycles = 50) {
    for (let i = 0; i < maxCycles; i++) {
      simulateKey(document.activeElement || document.body, 'Tab');
      await sleep(50);
      const el = document.activeElement;
      if (!el) continue;
      const text =
        (el.innerText || el.textContent || el.getAttribute('aria-label') || '')
          .trim();
      if (text.includes('/')) {
        return el;
      }
    }
    return null;
  }

  async function pressEnterThenTab(target) {
    simulateKey(target, 'Enter');
    await sleep(200);
    simulateKey(document.activeElement || document.body, 'Tab');
    await sleep(50);
  }

  // Seleciona uma ferramenta pelo teclado a partir do botão de ferramentas.
  async function selectToolKeyboard(name) {
    let toolsButton = getToolsButton();
    if (!toolsButton) {
      toolsButton = await findToolsButtonByTab();
    }
    if (!toolsButton) return false;

    toolsButton.focus();
    await pressEnterThenTab(toolsButton);

    const desired = normalizeToolName(name);
    const items = Array.from(
      document.querySelectorAll("[role='menuitemradio'], [role='menuitemcheckbox'], [data-label]")
    );

    let steps = items.length;
    while (steps-- > 0) {
      const current = document.activeElement;
      if (!current) break;
      const text =
        current.dataset.label || current.getAttribute('aria-label') || current.textContent || '';
      if (normalizeToolName(text).includes(desired)) {
        simulateKey(current, 'Enter');
        await sleep(200);
        selectedTool = getActiveToolName();
        return true;
      }
      simulateKey(current, 'ArrowDown');
      await sleep(50);
    }

    return false;
  }

  // Seleciona uma ferramenta clicando no menu de ferramentas.
  async function selectToolClick(name) {
    let toolsButton = getToolsButton();
    if (!toolsButton) {
      toolsButton = await findToolsButtonByTab();
    }
    if (!toolsButton) return false;

    toolsButton.click();
    const desired = normalizeToolName(name);

    return new Promise(resolve => {
      let attempts = 0;
      const interval = setInterval(() => {
        const items = Array.from(
          document.querySelectorAll("[role='menuitemradio'], [role='menuitemcheckbox'], [data-label]")
        );
        const target = items.find(el =>
          normalizeToolName(el.dataset.label || el.getAttribute('aria-label') || el.textContent || '').includes(desired)
        );

        if (target) {
          target.click();
          setTimeout(() => {
            if (normalizeToolName(getActiveToolName()).includes(desired)) {
              selectedTool = getActiveToolName();
              clearInterval(interval);
              resolve(true);
            } else if (++attempts > 20) {
              clearInterval(interval);
              resolve(false);
            }
          }, 200);
        } else if (++attempts > 20) {
          clearInterval(interval);
          resolve(false);
        } else if (attempts % 5 === 0) {
          toolsButton.click();
        }
      }, 200);
    });
  }

  // Tenta selecionar uma ferramenta, alternando entre clique e teclado.
  async function selectTool(name) {
    showToolSpinner();
    for (let attempt = 0; attempt < 3; attempt++) {
      await randomDelay(TOOL_DELAY_MIN, TOOL_DELAY_MAX);
      const ok =
        selectionModel === 'click'
          ? await selectToolClick(name)
          : await selectToolKeyboard(name);
      if (ok) {
        hideToolSpinner();
        showToast(`Ferramenta selecionada: ${selectedTool}`);
        return true;
      }
      await sleep(1000);
    }
    hideToolSpinner();
    showToast(`Falha ao selecionar: ${name}`, '#dc3545');
    return false;
  }

  global.selectToolKeyboard = selectToolKeyboard;
  global.selectToolClick = selectToolClick;
  global.selectTool = selectTool;
})(typeof window !== 'undefined' ? window : this);
