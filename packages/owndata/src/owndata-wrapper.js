// import Uberproto from 'uberproto';
import EventEmitter from 'component-emitter';
import errors from '@feathersjs/errors';
import { _, hooks, stripSlashes } from '@feathersjs/commons';
import { sorter, select, AdapterService } from '@feathersjs/adapter-commons';
import { genUuid, to } from '@feathersjs-offline/common';
import sift from 'sift';
import ls from 'feathers-localstorage';
import MutateStore from './mutate-store';
import snapshot from '@feathersjs-offline/snapshot';

const debug = require('debug')('@feathersjs-offline:owndata:service-wrapper');

if (typeof localStorage === 'undefined' || localStorage === null) {
  debug('Simulating localStorage...');
  let LocalStorage = require('node-localstorage').LocalStorage;
  global.localStorage = new LocalStorage('./.scratch');
}
else {
  debug('Utilizing built-in localStorage');
}

const defaultOptions = {
  'id': 'id',
  'store': {},
  'useUuid': true,
  'useShortUuid': true,
  'useUpdatedAt': true,
  'trackMutations': true,
  'publication': null,
  'subscriber': () => {},
  'adapterTest': false,
  'clearStorage': false,
  'multi': false,
  'paginate': false,
  'matcher': sift,
  sorter
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

class OwndataClass extends AdapterService {
  constructor (options = {}) {
    let opts = Object.assign({}, defaultOptions, options);
    debug(`Constructor started, opts = ${JSON.stringify(opts)}`);
    super(opts);
    debug(`Constructor ended, options = ${JSON.stringify(this.options)}`);

    this.type = 'owndata';

    debug('  Done.');
    return this;
  }

  _setup (app, path) {
    debug(`SetUp('${path}') started`);
    let self = this;
    this.thisName = `${this.type}_offline_${nameIx++}_${path}`;

    // Now we are ready to define the path with its underlying service (the remoteService)
    let old = app.services[path];
    this.remoteService = old || app.service(path); // We want to get the default service (redirects to server or local service)
    app.services[path] = self;  // Install this service instance

    // Get the service name and standard settings
    this.name = path;

    // Construct the two helper services
    this.localServiceName = this.thisName + '_local';
    this.localServiceQueue = this.thisName + '_queue';

    this.localSpecOptions = { name: this.localServiceName, storage: localStorage, store: this.options.store };
    let localOptions = Object.assign({}, this.options, this.localSpecOptions);
    let queueOptions = { id: 'id', name: this.localServiceQueue, storage: localStorage, paginate: null, multi: true };

    debug(`  Setting up services '${this.localServiceName}' and '${this.localServiceQueue}'...`);
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
    this.aPQ = 0; // Our semaphore for processing queued events
    this.syncedAt = -1;

    // This is necessary if we get updates to options (e.g. .options.multi = ['patch'])
    if (!(this.remoteService instanceof AdapterService)) {
      this._listenOptions();
    }
    // this.depends = [];
    // this.watchingFn = null;

    // this.options = /*this.*/observe(Object.assign(
    //   {},
    //   this.remoteService.options ? this.remoteService.options : {},
    //   self.options
    // ));
    // /*this.*/watcher(() => {
    //   // Update all changes to 'this.options' in both localService and remoteService
    //   self.remoteService.options = Object.assign({}, self.remoteService.options, self.options);
    //   self.localService.options = Object.assign({}, self.options, localSpecOptions);
    //   console.log(`SETTING remote/localService.options = ${JSON.stringify(self.options)}`);
    //   debug(`SETTING remote/localService.options = ${JSON.stringify(self.options)}`);
    //   debug(`        depends: ${JSON.stringify(/*self.*/depends, null, 2)}`);
    // });
    // debug(`depends: ${JSON.stringify(/*this.*/depends, null, 2)}`);

    debug('  Done.');
  }

  _listenOptions () {
    // This is necessary if we get updates to options (e.g. .options.multi = ['patch'])
    // this.depends = [];
    // this.watchingFn = null;

    let self = this;

    this.options = /*this.*/observe(Object.assign(
      {},
      this.remoteService.options ? this.remoteService.options : {},
      self.options
    ));
    /*this.*/watcher(() => {
      // Update all changes to 'this.options' in both localService and remoteService
      self.remoteService.options = Object.assign({}, self.remoteService.options, self.options);
      self.localService.options = Object.assign({}, self.options, self.localSpecOptions);
      // debug(`SETTING remote/localService.options = ${JSON.stringify(self.options)}`);
      // debug(`        depends: ${JSON.stringify(/*self.*/depends, null, 2)}`);
    });

  }

  /**
   * Make an observer proxy for the object given
   * @param {object} data
   */
  // observe (data) {
  //   let self = this;
  //   let depends = self.depends;
  //   let watchingFn = self.watchingFn;
  //   return new Proxy(data, {
  //     get (obj, key) {
  //       if (self.watchingFn) {
  //         if (!self.depends[key])  self.depends[key] = [];
  //         self.depends[key].push(self.watchingFn);
  //       }
  //       return obj[key];
  //     },
  //     set (obj, key, val) {
  //       obj[key] = val;
  //       if (self.depends[key])
  //         self.depends[key].forEach(cb => cb());
  //       return true;
  //     }
  //   })
  // }

  /**
   * Register a handler for the observer proxy
   * @param {function} target The handler function
   */
  // watcher (target) {
  //   let self = this;
  //   self.watchingFn = target;
  //   target();
  //   self.watchingFn = null;
  // }

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
    debug(`Calling getEntries(${JSON.stringify(params)}})`);
    let res = [];
    await this.localService.getEntries(params)
      .then(entries => {
          res = entries
      })
      .catch(err => { throw err });

    return Promise.resolve(res)
      .then(this._strip)
      .then(select(res, ..._internalAlwaysSelect));
  }

  async get (id, params) {
    debug(`Calling get(${JSON.stringify(id)}, ${JSON.stringify(params)}})`);
    return await this.localService.get(id, params)
      .then(this._strip)
      .then(this._select())
      .catch(err => { throw err });
  }

  async find (params) {
    debug(`Calling find(${JSON.stringify(params)}})`);
    return this.localService.find(params)
      .then(this._strip)
      .then(this._select(params));
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

    // Is uuid unique?
    let [err, res] = await to(this.localService.find({ query: { 'uuid': newData.uuid } }));
    if (res && res.length) {
      throw new errors.BadRequest(`Optimistic create requires unique uuid. (own-data) res=${JSON.stringify(res)}`);
    }

    // We apply optimistic mutation
    newData = this._mutateStore.mutate('created', newData, 1);
    const tmp = select(params, ..._internalAlwaysSelect)(newData);
    let newParams = shallowClone(params);
    this.disallowProcessingQueue();
    let queueId = await this._addQueuedEvent('create', newData, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.create(newData, params));
    if (!err) {
      this.remoteService.create(res, params)
        .then(async rres => {
          await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
          await self.localService.patch(rres[self.id], rres);

          // Ok, we have connection - empty queue if we have any items queued
          this.allowProcessingQueue();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.name === 'Timeout' && rerr.type === 'FeathersError') {
            // Let's silently ignore missing connection to server
            // We'll catch-up next time we get a connection
          }
          else {
            self._mutateStore.mutate('removed', newData, 2);
            await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
            await self.localService.remove(res[self.id], params);
            throw rerr;
          }
          this.allowProcessingQueue();
        });
    }
    else {
      await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
      this.allowProcessingQueue();
      throw err;
    }

    return Promise.resolve(res)
      .then(this._strip)
      .then(select(params));
  }

  async update (id, data, params = {}) {
    debug(`Calling update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
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
    this.disallowProcessingQueue();
    let queueId = await this._addQueuedEvent('update', newData, id, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.update(id, newData, params));
    if (!err) {
      this.remoteService.update(id, res, params)
        .then(async rres => {
          await self._removeQueuedEvent('update', queueId, newData, res.updatedAt);
          await self.localService.update(res[self.id], res, params);
          this.allowProcessingQueue();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.className === 'timeout' && rerr.name === 'Timeout') {
            debug(`_update TIMEOUT: ${JSON.stringify(rerr)}`);
          } else {
            debug(`_update ERROR: ${JSON.stringify(rerr)}`);
            self._mutateStore.mutate('updated', data, 2);
            await self._removeQueuedEvent('update', queueId, newData, res.updatedAt);
            await self.localService.patch(id, beforeRecord);
          }
          this.allowProcessingQueue();
        });
    }
    else {
      await self._removeQueuedEvent('update', queueId, newData, newData.updatedAt);
      this.allowProcessingQueue();
      throw err;
    }

    return Promise.resolve(newData)
      .then(this._strip)
      .then(select(params));
  }

  async patch (id, data, params = {}) {
    debug(`Calling patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
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
    this.disallowProcessingQueue();
    const queueId = await this._addQueuedEvent('patch', newData, id, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.patch(id, newData, params));
    if (!err) {
      this.remoteService.patch(id, res, params)
        .then(async rres => {
          await self._removeQueuedEvent('patch', queueId, newData, res.updatedAt);
          await this.localService.patch(id, rres, params);
          this.allowProcessingQueue();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.className === 'timeout' && rerr.name === 'Timeout') {
            debug(`_patch TIMEOUT: ${JSON.stringify(rerr)}`);
          } else {
            debug(`_patch ERROR: ${JSON.stringify(rerr)}`);
            self._mutateStore.mutate('updated', afterRecord, 2);
            await self._removeQueuedEvent('patch', queueId, newData, res.updatedAt);
            await self.localService.patch(id, beforeRecord);
          }
          this.allowProcessingQueue();
        });
    }
    else {
      await self._removeQueuedEvent('patch', queueId, newData, newData.updatedAt);
      this.allowProcessingQueue();
      throw err;
    }

    return Promise.resolve(newData)
      .then(this._strip)
      .then(select(params));
  }

  async remove (id, params = {}) {
    debug(`Calling remove(${id}, ${JSON.stringify(params)}})`);
    let self = this;

    if (id === null) {
      const multi = this.allowsMulti('remove');
      if (!multi) {
        throw new errors.MethodNotAllowed('Removing multiple without option \'multi\' set');
      }
      return this.find(params).then(page => {
        const res = page.data ? page.data : page;
        if (!Array.isArray(res)) {
          res = [res];
        }

        return Promise.all(res.map(
          current => self.remove(current[this.id], params))
        );
      });
    }

    let [err, res] = await to(this.localService.get(id));
    if (!(res && res !== {})) {
      throw new errors.BadRequest(`Trying to remove non-existing ${this.id}=${id}. (${this.type}) err=${JSON.stringify(err)}, res=${JSON.stringify(res)}`);
    }

    // Optimistic mutation
    const beforeRecord = shallowClone(res);
    const oldData = this._mutateStore.mutate('removed', beforeRecord, 1);
    this.disallowProcessingQueue();
    const queueId = await this._addQueuedEvent('remove', beforeRecord, id, cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.remove(id, params));
    if (!err) {
      this.remoteService.remove(id, params)
        .then(async res => {
          await self._removeQueuedEvent('remove', queueId, beforeRecord, null);
          this.allowProcessingQueue();
          await self._processQueuedEvents();
        })
        .catch(async err => {
          if (err.className === 'timeout' && err.name === 'Timeout') {
            debug(`_remove TIMEOUT: ${JSON.stringify(err)}`);
          } else {
            debug(`_remove ERROR: ${JSON.stringify(err.name)}`);
            if (beforeRecord.onServerAt === 0) {
              // In all likelihood the document/item was never on the server
              // so we choose to silently ignore this situation
            } else {
              console.error(`_remove ERROR: name=${err.name}, message=${err.message}, ${JSON.stringify(err)}`);
              // We have to restore the record to  the local DB
              await self.localService.create(beforeRecord, null);
              self._mutateStore.mutate('created', beforeRecord, 2);
              await self._removeQueuedEvent('remove', queueId, beforeRecord, null);
            }
            this.allowProcessingQueue();
          }
        });
    }
    else {
      await self._removeQueuedEvent('remove', queueId, beforeRecord, null);
      this.allowProcessingQueue();
      throw err;
    }

    return Promise.resolve(oldData)
      .then(this._strip)
      .then(select(params));
  }

  // Necessary for adapterTests vvv
  async _get (id) {
    return super._get(id)
  }

  async _find (params) {
    return super._find(params)
  }

  async _create (data, params) {
    return super._create(data, params)
  }

  async _create (data, params) {
    return super._create(data, params)
  }

  async _update (id, data, params) {
    return super._update(id, data, params)
  }

  async _patch (id, data, params) {
    return super._patch(id, data, params)
  }

  async _remove (id, params) {
    return super._remove(id, params)
  }
  // Necessary for adapterTests ^^^

  /* Queue handling */

  /**
   * Allow queue processing (allowed when semaphore this.aPQ === 0)
   */
  allowProcessingQueue () {
    this.aPQ--;
  }
  /**
   * Disallow queue processing (when semaphore this.aPQ !== 0)
   */
  disallowProcessingQueue () {
    this.aPQ++;
  }
  /**
   * Is queue processing allowed?
   */
  processingQueueAllowed () {
    return this.aPQ === 0;
  }

  async _addQueuedEvent (eventName, localRecord, arg1, arg2, arg3) {
    debug('addQueuedEvent entered');
    let [err, res] = await to(this.localQueue.create({ eventName, record: localRecord, arg1, arg2, arg3 }));
    debug(`addQueuedEvent added: ${JSON.stringify(res)}`);
    return res.id;
  }

  async _removeQueuedEvent (eventName, id, localRecord, updatedAt) {
    debug('removeQueuedEvent entered');

    let [err, res] = await to(this.localQueue.remove(id));
    if (!err) {
      debug(`removeQueuedEvent removed: ${JSON.stringify(res)}`);
    } else {
      console.log(`*** ERROR: _removedQueuedEvent: id=${id} eventName='${eventName}', localRecord=${JSON.stringify(localRecord)}`);
    }
  }

  async _processQueuedEvents () {
    debug(`processQueuedEvents (${this.type}) entered`);
    if(!this.processingQueueAllowed()) {
      return
    }

    let [err, store] = await to(this.localQueue.getEntries({query:{$sort: {[this.id]: 1}}}));
    if (!(store && store !== {})) {
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
          .then(async res => {
            await to(this.localQueue.remove(el.id));
            if (event !== 'remove') {
              // Let any updates to the document/item on server reflect on the local DB
              await to(this.localService.patch(res[this.id], res));
            }
          })
          .catch(async err => {
            if (el.record.onServerAt === 0  &&  event === 'remove') {
              // This record has probably never been on server (=remoteService), so we silently ignore the error
              await to(this.localQueue.remove(el.id));
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
    this.addListeners();
    return true;
  }

  /* Event listening */

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

  /* Synchronization */

  /**
   * Synchronize the relevant documents/items from the remote db with the local db.
   * @returns (boolean) True if the process was completed, false otherwise.
   */
  async sync () {
    const syncOptions = await this._getSyncOptions();
    debug(`${this.type}.sync(${JSON.stringify(syncOptions)}) started...`);
    let self = this;
    let result = true;

    let [err, snap] = await to( snapshot(this.remoteService, syncOptions) )
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
     *      - patch the row
     *  - otherwise
     *    - if it is not marked as deleted
     *      - create the row
     */
    debug(`  Applying received snapshot data... (${snap.length} items)`);
    await Promise.all(snap.map(async (v) => {
      let [err, res] = await to( self.localService.get(v[self.id]) );
      if (res) {
        if (v.softDelete) {
          [err, res] = await to( self.localService.remove(v[self.id]));
        }
        else {
          [err, res] = await to( self.localService.patch(v[self.id], v));
        }
        if (err) { result = false; }
      }
      else {
        if (!v.softDelete) {
          [err, res] = await to( self.localService.create(v));
          if (err) { result = false; }
        }
      }
    }));

    if (result)
      await this._processQueuedEvents();

    return result;
  }

  /**
   * Determine the relevant options necessary for synchronizing this service.
   * @returns (object) The relevant options.
   */
  async _getSyncOptions () {
    let sQuery = this.query ? (this.query.query || {}) : {};
    let query = Object.assign({}, sQuery, /*{$or: [{onServerAt: {$lt: 0}}, {onServerAt: {$gt: 0}}]},*/ {$sort: {onServerAt: 1}});
    let [err, res] = await to( this.localService.getEntries({query: {onServerAt: {$ne: 0}, $sort: {onServerAt: 1}}}) );
    if (res && res.length) {
      let syncMin = new Date(res[0].onServerAt).getTime();
      let syncMax = new Date(res[res.length-1].onServerAt).getTime();
      query = Object.assign({}, query, /*{$or: [{onServerAt: {$lt: syncMin}}, {onServerAt: {$gt: syncMax}}]},*/ {$sort: {onServerAt: 1}});
      delete query.softDelete;
    }

    return query;
  }

};

/**
 * This is a CLIENT adapter wrapper for FeathersJS services (or the default
 * service call passing adapter) extending them to implement the offline
 * own-data principle (**LINK-TO-DOC**). Alias `Owndata`.
 *
 * @example ```
 * import feathers from '(at)feathersjs/feathers';
 * import { Owndata } from '(at)feathersjs-offline/owndata';
 * import io from 'socket.io-client');
 * import socketioClient from '(at)feathersjs/socketio-client');
 *
 * const port = 3030;
 * const url = `http://localhost:${port}`;
 * const socket = io(url);
 *
 * const app = feathers();
 * app.configure(socketioClient(socket));
 * app.use('/testpath', Owndata({id: 'uuid'}));
 *
 * // The following presumes a running server serving `testpath`
 * app.service('testpath').create({givenName: 'James', familyName: 'Bond'})
 * ...
 * ```
 *
 * It works in co-existence with it's SERVER counterpart, RealtimeServiceWrapper.
 *
 * @param {object} app  The application handle
 * @param {object} path The service path (as used in ```app.use(path, serviceAdapter)```)
 * @param {object} options The options for the serviceAdaptor AND the OwndataWrapper
 *
 */

function init (options) {
  return new OwndataClass(options);
}

let Owndata = init;

/**
 * A owndataWrapper is a CLIENT adapter wrapping for FeathersJS services extending them to
 * implement the offline own-data principle (**LINK-TO-DOC**).
 *
 * @example ```
 * import feathers from '(at)feathersjs/feathers';
 * import memory from 'feathers-memory';
 * import { owndataWrapper } from '(at)feathersjs-offline/owndata';
 * const app = feathers();
 * app.use('/testpath', memory({id: 'uuid', clearStorage: true}));
 * owndataWrapper(app, '/testpath');
 * app.service('testpath').create({givenName: 'James', familyName: 'Bond'})
 * ...
 * ```
 *
 * It works in co-existence with it's SERVER counterpart, RealtimeServiceWrapper.
 *
 * @param {object} app  The application handle
 * @param {object} path The service path (as used in ```app.use(path, serviceAdapter)```)
 * @param {object} options The options for the serviceAdaptor AND the OwndataWrapper
 *
 */
function owndataWrapper (app, path, options = {}) {
  debug(`OwndataWrapper started on path '${path}'`)
  if (!(app && app.version && app.service && app.services)) {
    throw new errors.Unavailable(`The FeathersJS app must be supplied as first argument`);
  }

  let location = stripSlashes(path);

  let old = app.services[location];
  if (typeof old === 'undefined') {
    throw new errors.Unavailable(`No prior service registered on path '${location}'`);
  }

  let opts = Object.assign({}, old.options, options);
  app.use(location, Owndata(opts, true));
  app.services[location].options = opts;
  app.services[location]._listenOptions();

  return app.services[location];
}

module.exports = { init, Owndata, owndataWrapper };

init.Service = OwndataClass;

// --- Helper functions

/**
 * Make a shallow clone of any given object
 * @param {object} obj
 * @returns {object} The copy object
 */
function shallowClone (obj) {
  return Object.assign({}, obj);
}

/**
 * Remove any test attributes in queries
 */
function cleanUpParams (parameters) {
  let p = JSON.parse(JSON.stringify(parameters));
  if (p && p.query && p.query._fail) {
    delete p.query._fail;
  }
  return p;
}

/* Support for updating arapter options through the wrapper */

let depends = [];
let watchingFn = null;

/**
 * Package the data to be observed in a proxy that updates according to
 * relevant recipies registered with watcher().
 * @param {object} data The data object to observe
 */
function observe (data) {
  return new Proxy(data, {
    get (obj, key) {
      if (watchingFn) {
        if (!depends[key])  depends[key] = [];
        depends[key].push(watchingFn);
      }
      return obj[key];
    },
    set (obj, key, val) {
      obj[key] = val;
      if (depends[key])
        depends[key].forEach(cb => cb());
      return true;
    }
  })
}

/**
 * Register a handler for the observer proxy
 * @param {function} target The handler function
 */
function watcher (target) {
  watchingFn = target;
  target();
  watchingFn = null;
}
