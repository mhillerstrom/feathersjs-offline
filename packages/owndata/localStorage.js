const debug = require('debug')('@feathersjs-offline:owndata:localStorage');

/**
 * This is a minimal mock localStorage implementation only for test validation
 * in NodeJS/Mocha/FeathersJS
 */
if (typeof window === 'undefined' && typeof localStorage === 'undefined') {
  const storage = {};

  class LocalStorage {
    constructor () {
      debug('constructor called...');
    }

    getItem (key) {
      let val = storage[key]|| null;
      debug(`getItem('${key}') = ${JSON.stringify(val, null, 2)}`);
      return val;
    }

    setItem (key, value) {
      debug(`setItem('${key}', '${JSON.stringify(value)}')`);
      return storage[key] = value;
    }

    removeItem (key) {
      debug(`removeItem('${key}')`);
      storage.key = undefined;
    }

    toString () {
      return storage;
    }
  }

  global.localStorage = new LocalStorage();
}

export default localStorage;
