(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    global.logger = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function wrapObject(obj, prefix = '') {
    if (!obj) return obj;
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (typeof val === 'function') {
        obj[key] = function (...args) {
          try {
            console.debug(`[LOG] ${prefix}${key}`, ...args);
          } catch (e) {}
          return val.apply(this, args);
        };
      }
    });
    return obj;
  }

  return { wrapObject };
}));
