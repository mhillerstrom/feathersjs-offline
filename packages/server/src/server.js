import { genUuid } from '@feathersjs-offline/common';
import errors from '@feathersjs/errors';
const debug = require('debug')('@feathersjs-offline:server:index');

const defOptions = {
  useShortUuid: true,
  adapterTest: false
};

/**
 * A RealtimeServiceWrapper is a SERVER adapter wrapping a standard AdapterService to ensure all records/documents
 * contains 'onServerAt' and to provide a getSyncInfo() function to support proper sync'ing of clients.
 */
function RealtimeServiceWrapper (cls = null) {
  if (!cls) {
    throw new errors.Unavailable(`Bad usage: AdapterService must be supplied to RealtimeServiceWrapper.`);
  }
  // if (cls && cls.Service && !cls.Service.prototype.isPrototypeOf('AdapterService')) {
  //   throw new Error(`Bad service: Cannot wrap the service supplied for path '${path}`);
  // }
  class Service extends cls.Service {
    constructor (options = {}, app) {
      let opts = Object.assign({}, defOptions, options);
      debug(`RealtimeService constructor started, options=${JSON.stringify(opts)}`);
      super(opts, app);

    // Are we running adapterTests?
    if (this.options.adapterTest) {
      debug('  Setting up for adapter tests...');
      // Make sure the '_adapterTestStrip' attributes are stripped from results
      // However, we need to allow for having uuid as key
      let stripValues = Object.assign([], _adapterTestStrip);
      let idIx = stripValues.findIndex(v => {return v===this.id});
      if (idIx > -1)  stripValues.splice(idIx, 1);
      debug(`  stripValues: ${JSON.stringify(stripValues)}`);
      this._strip = attrStrip(...stripValues);
    }
      else {
        this._strip = v => { return v };
      }

      debug('RealtimeServer constructor ended');
    }

    async _setup (app, path) {
      debug(`_setup('${path}') started`);
      if (!this._setup) { // Assure we only run setup once
        return;
      }
      if (typeof super._setup === 'function')
        super._setUp(app, path);

      this._setup = true;
    }

    async _get (id, params) {
      debug(`Calling _get(${id}, ${JSON.stringify(params)})`);
      return super._get(id, params)
        .then(this._strip);
    }

    async get (id, params) {
      const { newParams, offline} = fixParams(params);
      debug(`Calling get(${id}, ${JSON.stringify(newParams)})`);
      return this._get(id, newParams)
    }

    async _find (params) {
      debug(`Calling _find(${JSON.stringify(params)})`);
      return super._find(params)
       .then(this._strip);
    }

    async find (params) {
      const { newParams, offline} = fixParams(params);
      debug(`Calling find(${JSON.stringify(newParams)})`);
      return this._find(newParams)
    }

    async _create (data, params = {}, ts = null) {
      const { newParams, offline} = fixParams(params);
      debug(`Calling _create(${JSON.stringify(data)}, ${JSON.stringify(newParams)})`);
      if (Array.isArray(data)) {
        const ts = new Date();
        return Promise.all(data.map(current => this._create(current, newParams, ts)));
      }

      ts = ts || new Date();

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
      let active = await this._get(id, params);
      if (active.onServerAt > newData.updatedAt) { // Newest on server always win
        return Promise.resolve(active)
          .then(this._strip);
      } else {
        newData.onServerAt = new Date();
        return super._update(id, newData, params)
          .then(this._strip);
      }
    }

    async update (id, data, params = {}) {
      const { newParams, offline} = fixParams(params);
      debug(`Calling update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(newParams)})`);
      return this._update(id, data, newParams);
    }

    async _patch (id, data, params = {}, ts = null) {
      debug(`Calling _patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)})`);
      if (id === null) {
        const multi = this.allowsMulti('patch');
        if (!multi) {
          throw new errors.MethodNotAllowed('Patching multiple without option \'multi\' set');
        }
        const ts = new Date();
        return this._find(params).then(page => {
          const res = page.data ? page.data : page;
          if (!Array.isArray(res)) {
            res = [res];
          }

          const self = this;
          return Promise.all(res.map(
            current => self._patch(current[this.id], data, params, ts))
          );
        });
      }

      let newData = shallowClone(data);
      let active = await this._get(id, params);
      if (active.onServerAt > newData.updatedAt) {
        return Promise.resolve(active)
          .then(this._strip);
      } else {
         newData.onServerAt = ts || new Date();
        return super._patch(id, newData, params)
          .then(this._strip);
      }
    }

    async patch (id, data, params = {}, ts = null) {
      const { newParams, offline} = fixParams(params);
      debug(`Calling patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(newParams)})`);
      if (id === null) {
        const multi = this.allowsMulti('patch');
        if (!multi) {
          throw new errors.MethodNotAllowed('Patching multiple without option \'multi\' set');
        }
        const ts = new Date();
        return this._find(params).then(page => {
          const res = page.data ? page.data : page;
          if (!Array.isArray(res)) {
            res = [res];
          }

          const self = this;
          return Promise.all(res.map(
            current => this._patch(current[this.id], data, newParams, ts))
          );
        });
      }

      ts = ts || new Date();

      return this._patch(id, data, newParams, ts)
    }

    async _remove (id, params = {}, ts = null) {
      const { newParams, offline} = fixParams(params);
      debug(`Calling _remove(${id}, ${JSON.stringify(newParams)})`);
      if (id === null) {
        const multi = this.allowsMulti('remove');
        if (!multi) {
          throw new errors.MethodNotAllowed('Removing multiple without option \'multi\' set');
        }
        const ts = new Date();
        return this._find(params).then(page => {
          const res = page.data ? page.data : page;
          if (!Array.isArray(res)) {
            res = [res];
          }

          const self = this;
          return Promise.all(res.map(
            current => self._remove(current[this.id], params, ts))
          );
        });
      }

      ts = ts || new Date();

      if (offline && '_force' in offline) {
        return super._remove(id, newParams)
          .then(this._strip)
          .catch(err => {throw err});
      } else {
        return super._patch(id, {deletedAt: ts}, newParams)
        .then(res => {
          return res;
        })
        .then(this._strip)
        .catch(err => {throw err});
      }
    }
  };

  let init = (options, app) => {
    return new Service(options, app);
  }
  init.Service = Service;

  return init;
}

module.exports = RealtimeServiceWrapper;

// --- Helper functions

/**
 * Make a shallow clone of any given object
 * @param {object} obj
 * @returns {object} The copy object
 */
function shallowClone (obj) {
  return Object.assign({}, obj);
};

const _internalAlwaysSelect = ['uuid', 'updatedAt', 'onServerAt'];
const _adapterTestStrip = ['uuid', 'updatedAt', 'onServerAt', 'deletedAt'];

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
};

const fixParams = function (params) {
  if (!params)
    return {newParams: {query:{}}, offline: {}};

  let {...other, paginate, query = {}} = params;
  let { offline } = query;
  let newParams = {};

  if (offline) {
    delete query.offline;

    if ('_forceAll' in offline && offline._forceAll) {
      delete query.deletedAt
      if ('onServerAt' in offline) {
        if (typeof offline.onServerAt === 'string')
          query.onServerAt = {$gte: new Date(offline.onServerAt)};
        else
          query.onServerAt = {$gte: offline.onServerAt};
      }
    }
    else {
      query.deletedAt = null;
    }
  }
  else {
    if (query && query != {}) {
        query = Object.assign(query, {'deletedAt': null});
    } else {
      query = {'deletedAt': null};
    }
}

  newParams.query = query;
  if (paginate!=undefined) newParams.paginate = paginate;

  return { newParams, offline: (offline != undefined ? offline : {})};
}
