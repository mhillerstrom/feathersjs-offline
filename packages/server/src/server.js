import { genUuid } from '@feathersjs-offline/common';
const debug = require('debug')('@feathersjs-offline:server:index');

const defOptions = {
  useShortUuid: true,
  adapterTest: false
}

/**
 * A RealtimeServiceWrapper is a SERVER adapter wrapping a standard service class to ensure all records/documents
 * contains 'onServerAt' and to provide a getSyncInfo() function to support proper sync'ing of clients.
 */
module.exports = function RealtimeServiceWrapper (cls) {
  if (!cls) {
    throw new Error(`Bad usage: class for service on path '${path} must be supplied to RealtimeServiceWrapper.`);
  }
  if (cls && cls.Service && cls.Service.prototype.isPrototypeOf('AdapterService')) {
    throw new Error(`Bad service: Cannot wrap the service supplied for path '${path}`);
  }
  return class extends cls.Service {
    constructor (options = {}, app) {
      let opts = Object.assign({}, defOptions, options);
      debug(`RealtimeService constructor started, options=${JSON.stringify(opts)}`);
      super(opts);

      if (this.options.adapterTest) {
        debug('  Setting up for adapter tests...');
        // Make sure the '_adapterTestStrip' attributes are stripped from results
        this._strip = attrStrip(..._adapterTestStrip);
      }
      else {
        this._strip = v => { return v };
      }

      debug('RealtimeServer constructor ended');
    }

    async _get (id, params) {
      return super._get(id, params)
        .then(this._strip);
    }

    async _find (query, params) {
      return super._find(query, params)
        .then(this._strip);

    }

    async _create (data, params = {}, ts = 0) {
      debug(`Calling _create(${JSON.stringify(data)}, ${JSON.stringify(params)})`);
      if (Array.isArray(data)) {
        const ts = new Date();
        return Promise.all(data.map(current => this._create(current, params, ts)));
      }

      ts = (ts === 0) ? new Date() : ts;

      let newData = shallowClone(data);

      // We require a 'uuid' attribute along with 'updatedAt' and 'onServerAt'
      if (!('uuid' in newData)) {
        newData.uuid = genUuid(this.options.useShortUuid);
      }

      if (!('updatedAt' in newData)) {
        newData.updatedAt = ts;
      }

      newData.onServerAt = ts;

      return super._create(newData, params)
        .then(this._strip);
    }

    async _update (id, data, params = {}) {
      debug(`Calling _update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)})`);
      let newData = shallowClone(data);
      newData.onServerAt = new Date();
      return super._update(id, newData, params)
      .then(this._strip);

    }

    async _patch (id, data, params = {}) {
      debug(`Calling _patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)})`);
      let newData = shallowClone(data);
      newData.onServerAt = new Date();
      return super._patch(id, newData, params)
        .then(this._strip);

    }

    async _remove (id, params = {}) {
      debug(`Calling _remove(${id}, ${JSON.stringify(params)})`);
      return super._remove(id, params)
        .then(this._strip);

    }

    //
    // And now the Wrapper specific methods
    //

    /**
     * Sync will ensure that all missing documents/rows on client will be sent to client.
     * The client, in turn, will send all queued updates to the server
     * @param {object} options
     */
    async sync (options = {query: {}}) {
      let min = options.query.syncMin || 0;
      let max = options.query.syncMax || 0;
      delete options.query.syncMin;
      delete options.query.syncMax;

      let query = { $or: [ {onServerAt: {$lt: new Date(min).getTime()}}, {onServerAt: {$gt: new Date(max).getTime()}}]};
      query = Object.assign({}, options.query, query);

      return this.find({ query });
    }
  };
}

// --- Helper functions

/**
 * Make a shallow clone of any given object
 * @param {object} obj
 * @returns {object} The copy object
 */
function shallowClone (obj) {
  return Object.assign({}, obj);
}



const _internalAlwaysSelect = ['uuid', 'updatedAt', 'onServerAt'];
const _adapterTestStrip = ['uuid', 'updatedAt', 'onServerAt'];

const attrStrip = (...attr) => {
  return (res) => {
    let result;
    if (Array.isArray(res)) {
      result = [];
      res.map((v, i, arr) => {
        let obj = shallowClone(arr[i]);
        attr.forEach(a => delete obj[a]);
        result.push(obj);
      })
    }
    else {
      result = shallowClone(res);
      attr.forEach(a => delete result[a]);
    }
    return result;
  }
}

