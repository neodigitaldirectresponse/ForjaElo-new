const assert = require('assert');
const utils = require('../utils');

(async () => {
  // normalize
  assert.strictEqual(utils.normalize('ÁÉÍÕÇ'), 'aeioc');

  // getFirstFiveWords
  assert.strictEqual(utils.getFirstFiveWords('uma duas tres quatro cinco seis'), 'uma duas tres quatro cinco');

  // splitMessages
  assert.deepStrictEqual(utils.splitMessages('a ~ b ~~ c '), ['a', 'b', 'c']);

  // detectTool
  assert.strictEqual(utils.detectTool('Criar imagem para teste'), 'Criar imagem');
  assert.strictEqual(utils.detectTool('Investigar   situação'), 'Investigar');
  assert.strictEqual(utils.detectTool('texto sem ferramenta'), '');

  // randomDelay
  const start = Date.now();
  await utils.randomDelay(10, 20);
  const delta = Date.now() - start;
  assert(delta >= 10 && delta <= 25);

  console.log('utils tests passed');
})();
