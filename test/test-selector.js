const assert = require('assert');
const { JSDOM } = require('jsdom');

const CSS = {
  escape(str) {
    return str.replace(/[\s!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&');
  },
};

function getUniqueSelector(el) {
  const path = [];
  while (el && el.nodeType === 1) {
    let sel = el.tagName.toLowerCase();
    if (el.id) {
      sel += `#${CSS.escape(el.id)}`;
    }
    if (el.classList.length) {
      sel += '.' + Array.from(el.classList).map((c) => CSS.escape(c)).join('.');
    }
    const sib = Array.from(el.parentNode.children).indexOf(el) + 1;
    sel += `:nth-child(${sib})`;
    path.unshift(sel);
    el = el.parentElement;
  }
  return path.join(' > ');
}

const html = `<html><body><div id="root"><div class="wrapper"><div class="a"><span class="b">text</span></div></div></div></body></html>`;
const { document } = new JSDOM(html).window;
const el = document.querySelector('span');
const selector = getUniqueSelector(el);

assert.strictEqual(
  selector,
  'html:nth-child(1) > body:nth-child(2) > div#root:nth-child(1) > div.wrapper:nth-child(1) > div.a:nth-child(1) > span.b:nth-child(1)'
);

console.log('test-selector passed');
