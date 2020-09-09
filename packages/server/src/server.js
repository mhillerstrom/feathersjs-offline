const debug = require('debug')('@feathersjs-offline:server:index');

/**
 * A RealtimeServiceWrapper is a SERVER adapter wrapping a standard service class to ensure all records/documents
 * contains 'onServerAt' and to provide a getSyncInfo() function to support proper sync'ing of clients.
 */
module.exports = function RealtimeServiceWrapper (cls) {
  return class extends cls {
    constructor (Service, options = {}, app) {
      debug('RealtimeService constructor started');
      this.parentName = cls.constructor.name;
      this.thisName = 'offline_' + cls.constructor.name;
      super(Service, options);
      console.error(`RealtimeService: constructed '${this.thisName}' from '${this.parentName}}`);

      debug('RealtimeServer constructor ended');
    }

    async _get (id, params) {
      return super._get(id, params);
    }

    async _find (query, params) {
      return super._find(query, params);
    }

    async _create (data, params = {}, ts = 0) {
      debug(`Calling _create(${JSON.stringify(data)}, ${JSON.stringify(params)})`);
      if (Array.isArray(data)) {
        const ts = new Date();
        return Promise.all(data.map(current => this._create(current, params, ts)));
      }

      data.onServerAt = (ts === 0) ? new Date() : ts;

      return super._create(data, params);
    }

    async _update (id, data, params = {}) {
      data.onServerAt = new Date();
      return super._update(id, data, params);
    }

    async _patch (id, data, params = {}) {
      data.onServerAt = new Date();
      return super._patch(id, data, params);
    }

    async _remove (id, data, params = {}) {
      return super._patch(id, data, params);
    }

    //
    // And now the Wrapper specific methods
    //
    async getSyncInfo (query = {}) {
      // ...all the sync stuff - first and last onServerAt for the collection given by query
      let first = new Date(); // To be determined
      let last = new Date(); // To be determined
      let total = 0;
      let skip = 0;
      let limit = 20;
      let syncEnabled = true;
      let data = [];
      return {result: { data, syncEnabled, limit, total, skip, first, last }};
    }

    async isOfflineOwndataEnabled () {
      let total = 0;
      let skip = 0;
      let limit = 20;
      let syncEnabled = true;
      let data = [];
      let cls = this.parentName;
      return {result: { data, syncEnabled, limit, total, skip, cls }};
    }
  };
}
