import Uberproto from 'uberproto';
import EventEmitter from 'component-emitter';
import errors from '@feathersjs/errors';
import { _, hooks } from '@feathersjs/commons';
import { sorter, select } from '@feathersjs/adapter-commons';
import { genUuid, to } from '@feathersjs-offline/common';
import ls from 'feathers-localstorage';
import MutateStore from './mutate-store';
import snapshot from '@feathersjs-offline/snapshot';

const debug = require('debug')('@feathersjs-offline:owndata:service-wrapper');

if (typeof localStorage === 'undefined' || localStorage === null) {
  debug('Simulating localStorage...');
  let LocalStorage = require('node-localstorage').LocalStorage;
  global.localStorage = new LocalStorage('./scratch');
}
else {
  debug('Utilizing built-in localStorage');
}

const Proto = Uberproto.extend({
  create: null
});

const defaultOptions = { // For this wrapper - we steal the other options from the service
  'store': {},
  'useUuid': true,
  'useShortUuid': true,
  'useUpdatedAt': true,
  'trackMutations': true,
  'publication': null,
  'subscriber': () => {},
  'adapterTest': false,
  'clearStorage': false
  };

const _internalAlwaysSelect = ['uuid', 'updatedAt', 'onServerAt'];
const _adapterTestStrip = ['uuid', 'updatedAt', 'onServerAt'];

let nameIx = 0;

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

/**
 * A OwndataWrapper is a CLIENT adapter wrapping for FeathersJS services extending them to
 * implement the offline own-data principle (**LINK-TO-DOC**).
 *
 * @example ```
 * import feathers from '(at)feathersjs/feathers';
 * import memory from 'feathers-memory';
 * import OwndataWrapper from '(at)feathersjs-offline/owndata';
 * const app = feathers();
 * app.configure(OwndataWrapper('/testpath', memory, {id: 'uuid', clearStorage: true}));
 * app.service('testpath').create({givenName: 'James', familyName: 'Bond'})
 * ...
 * ```
 *
 * It works in co-existence with it's SERVER counterpart, RealtimeServiceWrapper.
 *
 * @param {object} path The service path (as used in ```app.use(path, serviceAdapter)```)
 * @param {object} cls  The serviceAdapter class (e.g. ```import memory from 'feathers-memory';```)
 * @param {object} options The options for the serviceAdaptor AND the OwndataWrapper
 *
 */
function OwndataWrapper (path, cls, options = {}) {
  debug('OwndataWrapper called');

  if (!cls) {
    throw new Error(`Bad usage: class for service on path '${path} must be supplied to OwndataWrapper.`);
  }
  // TODO: figure a way to check that cls is in fact a prototype of AdapterService AND not OwndataWrapperClass
  // if (cls.Service) {
  //   if (!cls.Service.constructor.isPrototypeOf('AdapterService')) {
  //     throw new Error(`Bad service: Cannot wrap the service supplied for path '${path}'`);
  //   }
  // } else {
  //   if (cls.prototype && cls.prototype.isPrototypeOf('OwndataWrapperClass')) {
  //     throw new Error(`Bad service: Cannot wrap an already wrapped service (path '${path}')`);
  //   }
  // }

  return app => {
    if (app === null || !(app && app.version)) {
      throw new Error(`Bad usage: OwndataWrapper must be configured like: app.configure(OwndataWrapper('mypath', serviceclass, options));`);
    }

    class OwndataWrapperClass extends cls.Service {
      constructor (options = {}) {
        let opts = Object.assign({}, defaultOptions, options);
        debug('Constructor started');
        super(opts);
        let self = this;
        this.thisName = 'owndata_offline_' + nameIx++;

        // This is necessary if we get updates to options (e.g. .options.multi = ['patch'])
        this.depends = {};

        // Get the service name and standard settings
        this.name = path;

        // Construct the two helper services
        this.localServiceName = this.thisName + '_local_' + this.name;
        this.localServiceQueue = this.thisName + '_queue_' + this.name;

        let localOptions = Object.assign({}, this.options, { name: this.localServiceName, storage: localStorage, store: this.options.store, paginate: null });
        let queueOptions = Object.assign({}, this.options, { name: this.localServiceQueue, storage: localStorage, paginate: null, multi: true });

        debug(`  Setting up services '${this.localServiceName}' and '${this.localServiceQueue}'...`)
        app
          .use(this.localServiceName, ls(localOptions))
          .use(this.localServiceQueue, ls(queueOptions));

        this.localService = app.service(this.localServiceName);
        this.localQueue = app.service(this.localServiceQueue);

        if (this.options.clearStorage) {
          debug('  Clearing storage...');
          // We are running adapterTests, so make sure we are not carrying any old bagage along
          this.clearService(this.localService, this.localServiceName);
          this.clearService(this.localQueue, this.localServiceQueue);
          localStorage.clear();
        }

        if (this.options.adapterTest) {
          debug('  Setting up for adapter tests...');
          // Make sure the '_adapterTestStrip' attributes are stripped from results
          this._strip = attrStrip(..._adapterTestStrip);
        }
        else {
          this._strip = v => { return v };
        }

        this._select = (params, ...others) => (res) => { return select(params, ...others, self.id)(res) }

        // Let's prepare the pub/sub system
        this._eventEmitter = new EventEmitter();

        this._listener = eventName => remoteRecord => this._mutateStore.mutate(
          eventName, remoteRecord, 0
        );

        this._eventListeners = {
          created: this._listener('created'),
          updated: this._listener('updated'),
          patched: this._listener('patched'),
          removed: this._listener('removed')
        };

        this.emit = this._eventEmitter.emit;
        this.on = this._eventEmitter.on;

        this._publication = this.options.publication;
        this._subscriber = this.options.subscriber;

        // Do we care about tracking the mutations in the old-fashioned way? (Let's us use the many test cases already in place)
        if (this.options.trackMutations) {
          this._mutateStore = new MutateStore({ publication: this._publication, subscriber: this._subscriber, emitter: this });
        }
        else {
          this._mutateStore = { mutate: (event, data, params) => { return data }, publication: null, subscriber: () => { } };
        }

        // Initialize the service wrapper
        this.listening = false;
        this.processingQueued = false;
        this.syncedAt = -1;

        this.watcher(() => { // Update all changes to 'this.options' in both localService and remoteService
          self.localService.options = self.options;
          debug(`SETTING localService.options = ${JSON.stringify(self.localService.options)}`);
        });

        debug('  Done.');
        return this;
      }

      /**
       * Make an observer proxy for a given object
       * @param {object} data
       */
      observe (data) {
        let self = this;
        return new Proxy(data, {
          get (obj, key) {
            if (self.watchingFn) {
              if (!self.depends[key])  self.depends[key] = [];
              self.depends[key].push(self.watchingFn);
            }
            return obj[key];
          },
          set (obj, key, val) {
            obj[key] = val;
            if (self.depends[key])
              self.depends[key].forEach(cb => cb());
          }
        })
      }

      /**
       * Register a handler for the observer proxy
       * @param {function} target The handler function
       */
      watcher (target) {
        this.watchingFn = target;
        target();
        this.watchingFn = null;
      }

      clearService (service, name) {
        // feathers-localstorage cannot fulfil .getEntries() before a standard operation has been performed
        service.find()
          .then(el => {
            service.getEntries()
              .then(elements => {
                if (elements.length) {
                  let multi = service.options.multi;
                  service.options.multi = true;
                  service.remove();
                  service.options.multi = multi;
                }
              })
              .catch(err => {
                throw new errors.BadRequest(`UPS owndata.clearService (${name}): err.name=${err.name}, err.message=${err.message}`);
              });
          });
      }

      async getEntries (params) {
        let res = [];
        to(this.localService.getEntries(params))
          .then(([err, entries]) => {
            if (!err) {
              res = entries
            }
          })
          .catch(([err, res]) => { throw err })
        return Promise.resolve(res)
          .then(this._strip)
          .then(select(res, ..._internalAlwaysSelect));
      }

      async get (id, params) {
        return this.localService.get(id, params)
          .then(this._strip)
          .then(this._select())
          .catch(err => { throw err });
      }

      async find (query, ...args) {
        return this.localService.find(query, ...args)
          .then(this._strip)
          .then(this._select(query));
      };

      async create (data, params, ts = 0) {
        debug(`Calling create(${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
        let self = this;
        if (Array.isArray(data)) {
          const multi = this.allowsMulti('create');
          if (!multi) {
            throw new errors.MethodNotAllowed('Creating multiple without option \'multi\' set');
          }

          ts = new Date();
          return Promise.all(data.map(current => self.create(current, params, ts)));
        }
        else if (ts === 0) {
          ts = new Date();
        }

        let newData = shallowClone(data);

        // As we do not know if the server is connected we have to make sure the important
        // values are set with reasonable values
        if (!('uuid' in newData)) {
          newData.uuid = genUuid(this.options.useShortUuid);
        }

        if (!('updatedAt' in newData)) {
          newData.updatedAt = ts;
        }

        // We do not allow the client to set the onServerAt attribute to other than default '0'
        newData.onServerAt = 0;

        // Now we'r ready to create

        // Is uuid unique?
        let [err, res] = await to(this.localService.find({ query: { 'uuid': newData.uuid } }));
        if (res && res.length) {
          throw new errors.BadRequest(`Optimistic create requires unique uuid. (own-data) res=${JSON.stringify(res)}`);
        }

        // We apply optimistic mutation
        newData = this._mutateStore.mutate('created', newData, 1);
        const tmp = select(params, ..._internalAlwaysSelect)(newData);
        let queueId = await this._addQueuedEvent('create', newData, shallowClone(newData), params);

        // Start actual mutation on remote service
        [err, res] = await to(this.localService.create(newData, params));
        if (!err) {
          this.remoteService.create(res, params)
            .then(async rres => {
              await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
              await self.localService.update(rres[self.id], rres);

              // Ok, we have connection - empty queue if we have any items queued
              self._processQueuedEvents();
            })
            .catch(rerr => {
              if (rerr.name === 'Timeout' && rerr.type === 'FeathersError') {
                // Let's silently ignore missing connection to server
                // We'll catch-up next time we get a connection
              }
              else {
                self._mutateStore.mutate('removed', newData, 2);
                throw rerr;
              }
            });
        }
        else {
          await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
          throw err;
        }

        return Promise.resolve(res)
          .then(this._strip)
          .then(select(params));
      }

      async update (id, data, params = {}) {
        let self = this;
        let [err, res] = await to(this.localService.get(id));
        if (!(res && res !== {})) {
          throw new errors.NotFound(`Trying to update non-existing ${this.id}=${id}. (own-data) err=${JSON.stringify(err)}`);
        }

        // We do not allow the client to update the onServerAt attribute
        if (res.onServerAt)
          delete res.onServerAt;

        // We don't want our uuid to change type if it can be coerced
        const beforeRecord = shallowClone(res);
        const beforeUuid = beforeRecord.uuid;
        let newData = shallowClone(data);
        newData.uuid = beforeUuid; // eslint-disable-line
        newData.updatedAt = new Date();

        // Optimistic mutation
        newData = this._mutateStore.mutate('updated', newData, 1);
        let queueId = await this._addQueuedEvent('update', newData, id, shallowClone(newData), params);

        // Start actual mutation on remote service
        [err, res] = await to(this.localService.update(id, newData, params));
        if (!err) {
          to(this.remoteService.update(id, res, params))
            .then(async ([err, res]) => {
              if (err) {
                if (err.className === 'timeout' && err.name === 'Timeout') {
                  debug(`_update TIMEOUT: ${JSON.stringify(err)}`);
                } else {
                  debug(`_update ERROR: ${JSON.stringify(err)}`);
                  self._mutateStore.mutate('updated', data, 2);
                }
              }
              if (res) {
                await self._removeQueuedEvent('update', queueId, newData, res.updatedAt);
                await self.localService.update(res[self.id], res);
                self._processQueuedEvents();
              }
            });
        }
        else {
          await self._removeQueuedEvent('update', queueId, newData, newData.updatedAt);
          throw err;
        }

        return Promise.resolve(newData)
          .then(this._strip)
          .then(select(params));
      }

      async patch (id, data, params = {}) {
        let self = this;
        if (id === null) {
          const multi = this.allowsMulti('patch');
          if (!multi) {
            throw new errors.MethodNotAllowed('Patching multiple without option \'multi\' set');
          }

          return this.find(params).then(page => {
            const res = page.data ? page.data : page;
            if (!Array.isArray(res)) {
              res = [ res ];
            }

            return Promise.all(res.map(
              current => self.patch(current[this.id], data, params))
            );
          });
        }

        let [err, res] = await to(this.localService.get(id));
        if (!(res && res !== {})) {
          throw err;
        }

        // We do not allow the client to patch the onServerAt attribute
        if (res.onServerAt)
          delete res.onServerAt;

        // Optimistic mutation
        const beforeRecord = shallowClone(res);
        const afterRecord = Object.assign({}, beforeRecord, data);
        const newData = this._mutateStore.mutate('patched', afterRecord, 1);
        const queueId = await this._addQueuedEvent('patch', newData, id, shallowClone(newData), params);

        // Start actual mutation on remote service
        [err, res] = await to(this.localService.patch(id, newData, params));
        if (!err) {
          to(this.remoteService.patch(id, res, params))
            .then(async ([err, res]) => {
              if (err) {
                if (err.className === 'timeout' && err.name === 'Timeout') {
                  debug(`_patch TIMEOUT: ${JSON.stringify(err)}`);
                } else {
                  debug(`_patch ERROR: ${JSON.stringify(err)}`);
                  self._mutateStore.mutate('updated', afterRecord, 2);
                }
              }
              if (res) {
                await self._removeQueuedEvent('patch', queueId, newData, res.updatedAt);
                await self.localService.update(res[self.id], res);
                self._processQueuedEvents();
              }
            });
        }
        else {
          await self._removeQueuedEvent('patch', queueId, newData, newData.updatedAt);
          throw err;
        }

        return Promise.resolve(newData)
          .then(this._strip)
          .then(select(params));
      }

      async remove (id, params = {}) {
        let self = this;
        debug(`<<<<<<<<<<< Remove id=${id}.`);

        if (id === null) {
          const multi = this.allowsMulti('remove');
          if (!multi) {
            debug(`<<<<<<<<<<< THROW error.MethodNotAllowed >>>>>>>>>>>>>>>`);
            throw new errors.MethodNotAllowed('Removing multiple without option \'multi\' set');
          }
          return this.find(params).then(page => {
            const res = page.data ? page.data : page;
            if (!Array.isArray(res)) {
              res = [res];
            }
            debug(`>>>>>>>>>>>>>> Remove id=null affects ${res.length} items (multi = ${multi}).`);

            return Promise.all(res.map(
              current => self.remove(current[this.id], params))
            );
          });
        }

        let [err, res] = await to(this.localService.get(id));
        if (!(res && res !== {})) {
          throw new errors.BadRequest(`Trying to remove non-existing ${this.id}=${id}. (own-data) err=${JSON.stringify(err)}, res=${JSON.stringify(res)}`);
        }

        // Optimistic mutation
        const beforeRecord = shallowClone(res);
        const oldData = this._mutateStore.mutate('removed', beforeRecord, 1);
        const queueId = await this._addQueuedEvent('remove', beforeRecord, id, params);

        // Start actual mutation on remote service
        [err, res] = await to(this.localService.remove(id, params));
        if (!err) {
          to(this.remoteService.remove(id, params))
            .then(async ([err, res]) => {
              if (err) {
                if (err.className === 'timeout' && err.name === 'Timeout') {
                  debug(`_remove TIMEOUT: ${JSON.stringify(err)}`);
                } else {
                  debug(`_remove ERROR: ${JSON.stringify(err)}`);
                  self._mutateStore.mutate('created', beforeRecord, 2);
                }
              }
              if (res) {
                await self._removeQueuedEvent('remove', queueId, beforeRecord, null);
                self._processQueuedEvents();
              }
            });
        }
        else {
          await self._removeQueuedEvent('remove', queueId, beforeRecord, null);
          throw err;
        }

        return Promise.resolve(oldData)
          .then(this._strip)
          .then(select(params));
      }

      // async hooks (...args) {
      //   return super.hooks(...args);
      // }


      async _addQueuedEvent (eventName, localRecord, arg1, arg2, arg3) {
        debug('addQueuedEvent entered');
        if (this.processingQueued) {
          debug('addQueuedEvent ignored - processingQueued');
          return;
        }

        let [err, res] = await to(this.localQueue.create({ eventName, record: localRecord, arg1, arg2, arg3 }));
        return res[this.id];
      }

      async _removeQueuedEvent (eventName, id, localRecord, updatedAt) {
        debug('removeQueuedEvent entered');

        let err;
        let res;
        try {
          [err, res] = await to(this.localQueue.remove(id));
        } catch (err) {
          console.log(`*** ERROR: _removedQueuedEvent: id=${id} eventName='${eventName}', localRecord=${JSON.stringify(localRecord)}`);
        }

        if (!err && updatedAt) this.syncedAt = updatedAt;
      }

      async _processQueuedEvents () {
        debug('processQueuedEvents entered');
        this.processingQueued = true;

        let [err, store] = await to(this.localQueue.getEntries());
        // console.error(`ProcessingQueue: store.length=${store.length}\n${JSON.stringify(store, null, 2)} err=${JSON.stringify(err)}`);
        if (!(store && store !== {})) {
          this.processingQueued = false;
          return;
        }

        this.removeListeners();

        let stop = false;
        while (store.length && !stop) {
          const el = store.shift();
          const event = el.eventName;

          try {
            // remove _fail and _timeout properties from query (as a courtesy of testing)
            // for (const i in el.args) {
            //   let arg = el.args[i];
            //   if (arg && arg['query']) {
            //     delete arg.query._fail;
            //     delete arg.query._timeout;
            //   }
            // }
            // console.error(`ProcessingQueue: event=${event}(${JSON.stringify(el.args[0], null, 2)}, ${JSON.stringify(el.args[1], null, 2)}, ${JSON.stringify(el.args[2], null, 2)})\npath=${this.name} (${this.localServiceQueue})`);
            let args = el.args;
            let arg1 = el.arg1 || null;
            let arg2 = el.arg2 || null;
            let arg3 = el.arg3 || null;
            // this.remoteService[event](...args)
            this.remoteService[event](arg1, arg2, arg3)
              .then((res) => {
                to(this.localQueue.remove(res[this.id]));
              })
              .catch((err) => {
                if (el.record.onServerAt === 0  &&  event === 'remove') {
                  // This record has probably never been on server (=remoteService), so we silently ignore the error
                  to(this.localQueue.remove(el[this.id]));
                }
                else {
                  // The connection to the server has probably been cut - let's continue at another time
                  stop = true;
                }
              });
          } catch (error) {
            console.error(`Got ERROR ${JSON.stringify(error.name, null, 2)}, ${JSON.stringify(error.message, null, 2)}`);
          }
        }
        this.processingQueued = false;
        this.addListeners();
        return true;
      }

      addListeners () {
        debug('addListeners entered');
        if (this.listening) return;

        const service = this.remoteService;
        const eventListeners = this._eventListeners;

        service.on('created', eventListeners.created);
        service.on('updated', eventListeners.updated);
        service.on('patched', eventListeners.patched);
        service.on('removed', eventListeners.removed);

        this.listening = true;

        let self = this;
        this.localService.getEntries()
          .then(store => {
            self.emit('events', store.data, { action: 'add-listeners' });
            self._subscriber(store.data, { action: 'add-listeners' });
          })
          .catch(err => {
            throw new Error(`Bad result reading local service '${self.localServiceName}', err = ${err}`);
          })
      };

      removeListeners () {
        debug('removeListeners entered');
        if (this.listening) {
          const service = this.remoteService;
          const eventListeners = this._eventListeners;

          service.removeListener('created', eventListeners.created);
          service.removeListener('updated', eventListeners.updated);
          service.removeListener('patched', eventListeners.patched);
          service.removeListener('removed', eventListeners.removed);

          this.listening = false;
          this.localService.getEntries()
            .then((store) => {
              this.emit('events', store.data, { action: 'remove-listeners' });
              this._subscriber(store.data, { action: 'remove-listeners' });
            });
        }
      }

      /**
       * Synchronise the relevant documents/items from the remote db with the local db.
       * @returns (boolean) True if the process was completed, false otherwise.
       */
      async sync () {
        const syncOptions = await this._getSyncOptions();
        debug(`owndata.sync(${JSON.stringify(syncOptions)}) started...`);
        let self = this;
        let result = true;

        let [err, snap] = await to( snapshot(this.remoteService, syncOptions) )
//        let [err, snap] = await to( this.remoteService.sync(syncOptions) )
        debug(`  err = ${err?err.name:''}, snap = ${JSON.stringify(snap)}`);
        if (err) { // we silently ignore any errors
          if (err.className === 'timeout' && err.name === 'Timeout') {
            debug(`  TIMEOUT: ${JSON.stringify(err)}`);
          } else {
            debug(`  ERROR: ${JSON.stringify(err)}`);
          }
          return false;
        }

        /*
         * For each row returned by snapshot we perform the following:
         *  - if it already exists locally
         *    - if it is marked as deleted
         *      - remove the row
         *    - otherwise
         *      - update the row
         *  - otherwise
         *    - if it is not marked as deleted
         *      - create the row
         */
        debug(`  Applying received snapshot data... (${snap.length} items)`);
        let mypatch = super.patch;
        snap.forEach(async (v) => {
          let [err, res] = await to( self.get(v[self.id]) );
          if (res) {
            if (v.softDelete) {
              [err, res] = await to( super._remove(v[self.id]));
            }
            else {
              [err, res] = await to( super._patch(v[self.id], v));
            }
            if (err) { result = false; }
          }
          else {
            if (!v.softDelete) {
              [err, res] = await to( super._create(v));
              if (err) { result = false; }
            }
          }
        });

        return result;
      }

      /**
       * Determine the relevant options necessary for synchronizing this service.
       * @returns (object) The relevant options.
       */
      async _getSyncOptions () {
        let sQuery = this.query ? (this.query.query || {}) : {};
        let query = Object.assign({}, sQuery, /*{$or: [{onServerAt: {$lt: 0}}, {onServerAt: {$gt: 0}}]},*/ {$sort: {onServerAt: 1}});
        let [err, res] = await to( this.getEntries({query: {onServerAt: {$ne: 0}, $sort: {onServerAt: 1}}}) );
        if (res && res.length) {
          let syncMin = new Date(res[0].onServerAt).getTime();
          let syncMax = new Date(res[res.length-1].onServerAt).getTime();
          query = Object.assign({}, query, /*{$or: [{onServerAt: {$lt: syncMin}}, {onServerAt: {$gt: syncMax}}]},*/ {$sort: {onServerAt: 1}});
          delete query.softDelete;
        }

        return query;
      }

    };

    // Now we are ready to define the path with its underlying service (the remoteService)
    app.use(path, cls(options));

    // Let's find the proper path this service was created on
    let remoteService = app.service(path);
    for(let i in app.services) {
      if (app.services[i] === remoteService) {
        path = i;
        break;
      }
    };

    // First we will make this wrapped service a proper FeathersJS service
    const serviceObject = hooks.enableHooks(new OwndataWrapperClass(options), ['all'], ['before','after','error']);
    const Service = Proto.isPrototypeOf(serviceObject) ? serviceObject : Proto.extend(serviceObject);

    // Now we patch the service class to the wrapped one
    app.services[path] = Service;
    app.services[path].remoteService = remoteService;

    return Service;
  }

}

module.exports = OwndataWrapper;

// --- Helper functions

/**
 * Make a shallow clone of any given object
 * @param {object} obj
 * @returns {object} The copy object
 */
function shallowClone (obj) {
  return Object.assign({}, obj);
}

