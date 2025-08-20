const assert = require('assert');
const { JSDOM } = require('jsdom');
const { simulateKey } = require('../simulation/base');

const dom = new JSDOM('<div></div>');
global.window = dom.window;
global.document = dom.window.document;
global.KeyboardEvent = dom.window.KeyboardEvent;
const el = document.querySelector('div');

let received;
el.addEventListener('keydown', (e) => {
  received = e;
});

simulateKey(el, '/');

assert(received);
assert.strictEqual(received.key, '/');
assert.strictEqual(received.code, 'Slash');
assert.strictEqual(received.keyCode, 191);
assert.strictEqual(received.charCode, '/'.charCodeAt(0));

console.log('simulateKey slash test passed');
