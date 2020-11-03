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
  'store': null,
  'storage': null,
  'useShortUuid': true,
  'trackMutations': true,
  'publication': null,
  'subscriber': () => {},
  'adapterTest': false,
  // 'multi': false,
  // 'paginate': false,
  'matcher': sift,
  sorter,
  query: () => {return {};},
  'fixedName': false
  };

const _adapterTestStrip = ['uuid', 'updatedAt', 'onServerAt', 'deletedAt'];

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
  constructor (opts = {}) {
    let newOpts = Object.assign({}, defaultOptions, opts);

    debug(`Constructor started, newOpts = ${JSON.stringify(newOpts)}, publication = ${newOpts.publication===null?'null':newOpts.publication.toString()}, subscriber = ${newOpts.subscriber===null?'null':newOpts.subscriber.toString()}`);
    super(newOpts);

    this.wrapperOptions = Object.assign({}, newOpts, this.options);
    debug(`Constructor ended, options = ${JSON.stringify(this.options)}, publication = ${this.options.publication===null?'null':this.options.publication.toString()}, subscriber = ${this.options.subscriber===null?'null':this.options.subscriber.toString()}`);

    this.type = 'own-data';

    debug('  Done.');
    return this;
  }

  async _setup (app, path) {
    debug(`SetUp('${path}') started`);
    if (!this._setup) { // Assure we only run setup once
      return;
    }
    this._setup = true;

    this.options = this.wrapperOptions;

    let self = this;
    this.thisName = this.options.fixedName ? this.options.fixedName : `${this.type}_offline_${nameIx++}_${path}`;

    // Now we are ready to define the path with its underlying service (the remoteService)
    let old = app.services[path];
    this.remoteService = old || app.service(path); // We want to get the default service (redirects to server or points to a local service)
    app.services[path] = self;  // Install this service instance

    // Get the service name and standard settings
    this.name = path;

    // Construct the two helper services
    this.localServiceName = this.thisName + '_local';
    this.localServiceQueue = this.thisName + '_queue';

    this.storage = this.options.storage ? this.options.storage : localStorage;
    this.localSpecOptions = { name: this.localServiceName, storage: this.storage, store: this.options.store };
    let localOptions = Object.assign({}, this.options, this.localSpecOptions);
    let queueOptions = { id: 'id', name: this.localServiceQueue, storage: this.storage, paginate: null, multi: true, reuseKeys: this.options.reuseKeys };

    debug(`  Setting up services '${this.localServiceName}' and '${this.localServiceQueue}'...`);
    app
      .use(this.localServiceName, ls(localOptions))
      .use(this.localServiceQueue, ls(queueOptions));

    this.localService = app.service(this.localServiceName);
    this.localQueue = app.service(this.localServiceQueue);

    // We need to make sure that localService is properly initiated - make a dummy search
    //    (one of the quirks of feathers-localstorage)
    await this.localService.ready();

    // The initialization/setup of the localService adapter screws-up our options object
    this.options = this.wrapperOptions;

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

    // Make sure we always select the key (id) in our results
    this._select = (params, ...others) => (res) => { return select(params, ...others, self.id)(res) }

    // Do we care about tracking the mutations in the old-fashioned way? (Let's us use the many test cases already in place)
    // Let's prepare the pub/sub system
    this._eventEmitter = new EventEmitter();

    this._publication = this.options.publication;
    if (this._publication && typeof this._publication !== 'function')
        throw new errors.BadRequest(`option 'publication' must be a function or 'null'!`);

    this._subscriber = this.options.subscriber;
    if (typeof this._subscriber !== 'function')
      throw new errors.BadRequest(`option 'subscriber' must be a function!`);

    if (this.options.trackMutations) {
      this._mutateStore = new MutateStore({ publication: this._publication, subscriber: this._subscriber, emitter: this._eventEmitter.emit.bind(this), id: this.id });
    }
    else {
      this._mutateStore = { mutate: (event, data, params) => { return data }, publication: null, subscriber: () => { } };
    }

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

    // Initialize the service wrapper
    this.listening = false;
    this.aIP = 0; // Our semaphore for internal processing
    this.pQActive = false; // Our flag for avoiding more than one processing of queued operations at a time

    // Determine latest registered sync timestamp
    this.syncedAt = new Date(this.storage.getItem(this.thisName+'_syncedAt') || 0).toISOString();
    this.storage.setItem(this.thisName+'_syncedAt', new Date(this.syncedAt).toISOString());

    // This is necessary if we get updates to options (e.g. .options.multi = ['patch'])
    if (!(this.remoteService instanceof AdapterService)) {
      this._listenOptions();
    }

    this.addListeners();

    debug('  Done.');
  }

  _listenOptions () {
    // This is necessary if we get updates to options (e.g. .options.multi = ['patch'])

    let self = this;

    this.options = observe(Object.assign(
      {},
      this.remoteService.options ? this.remoteService.options : {},
      self.options
    ));
    watcher(() => {
      // Update all changes to 'this.options' in both localService and remoteService
      self.remoteService.options = Object.assign({}, self.remoteService.options, self.options);
      self.localService.options = Object.assign({}, self.options, self.localSpecOptions);
    });

  }

  async getEntries (params) {
    debug(`Calling getEntries(${JSON.stringify(params)}})`);
    let res = [];
    await this.localService.getEntries(params)
      .then(entries => {
          res = entries
      });

    return Promise.resolve(res)
      .then(this._strip)
      .then(this._select(params));
  }

  async get (id, params) {
    debug(`Calling get(${JSON.stringify(id)}, ${JSON.stringify(params)}})`);
    return await this.localService.get(id, params)
      .then(this._strip)
      .then(this._select(params))
      .catch(err => {throw err});
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
      throw new errors.BadRequest(`Optimistic create requires unique uuid. (${this.type}) res=${JSON.stringify(res)}`);
    }

    // We apply optimistic mutation
    newData = this._mutateStore.mutate('created', newData, 1);
    let newParams = shallowClone(params);
    this.disallowInternalProcessing();
    let queueId = await this._addQueuedEvent('create', newData, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.create(newData, shallowClone(params)));
    if (!err) {
      this.remoteService.create(res, shallowClone(params))
        .then(async rres => {
          self._mutateStore.mutate('created', rres, 0);
          await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
          await self.localService.patch(rres[self.id], rres)
            .catch(async err => {
              // We have to test for a possible race condition
              let [lerr, lres] = await to( self.localService.get(id) );
              let [rerr, rres] = await to( self.remoteService.get(id) );
              if (!lres && rres) {
                // Something is very wrong
                throw new errors.NotFound(`Create. id = '${id} not found on localService. Please report error!`);
              }
              // We have simply been overtaken by a remove request.
            });

          // Ok, we have connection - empty queue if we have any items queued
          self.allowInternalProcessing();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (!(rerr.name === 'Timeout' && rerr.type === 'FeathersError')) {
            // Let's silently ignore missing connection to server -
            // we'll catch-up next time we get a connection
            // In all other cases do the following:
            self._mutateStore.mutate('removed', newData, 2);
            await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
            await self.localService.remove(res[self.id], params);
          }

          self.allowInternalProcessing();
       });
    }
    else {
      await this._removeQueuedEvent('create', queueId, newData, newData.updatedAt);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(res)
      .then(this._strip)
      .then(this._select(params));
  }

  async update (id, data, params = {}) {
    debug(`Calling update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
    let self = this;
    let [err, res] = await to(this.localService.get(id));
    if (!(res && res !== {})) {
      throw new errors.NotFound(`Trying to update non-existing ${this.id}=${id}. (${this.type}) err=${JSON.stringify(err)}`);
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
    this.disallowInternalProcessing();
    let queueId = await this._addQueuedEvent('update', newData, id, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.update(id, newData, shallowClone(params)));
    if (!err) {
      this.remoteService.update(id, res, shallowClone(params))
        .then(async rres => {
          self._mutateStore.mutate('updated', rres, 0);
          await self._removeQueuedEvent('update', queueId, newData, res.updatedAt);
          await self.localService.update(res[self.id], res, shallowClone(params))
            .catch(async err => {
              // We have to test for a possible race condition
              let [lerr, lres] = await to( self.localService.get(id) );
              // We have to test for a possible race condition
              let [rerr, rres] = await to( self.remoteService.get(id) );
              if (!lres && rres) {
                // Something is very wrong
                throw new errors.NotFound(`Update: id = '${id} not found on localService. Please report error!`);
              }
              // We have simply been overtaken by a remove request.
            });
          self.allowInternalProcessing();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.className === 'timeout' && rerr.name === 'Timeout') {
            debug(`_update TIMEOUT: ${rerr.name}, ${rerr.message}`);
            // Let's silently ignore missing connection to server
            // We'll catch-up next time we get a connection
          } else {
            debug(`_update ERROR: ${rerr.name}, ${rerr.message}`);
            self._mutateStore.mutate('updated', data, 2);
            await self._removeQueuedEvent('update', queueId, newData, res.updatedAt);
            await self.localService.patch(id, beforeRecord);
          }
          self.allowInternalProcessing();
        });
    }
    else {
      await this._removeQueuedEvent('update', queueId, newData, newData.updatedAt);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(newData)
      .then(this._strip)
      .then(this._select(params));
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
    this.disallowInternalProcessing();
    const queueId = await this._addQueuedEvent('patch', newData, id, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.patch(id, newData, shallowClone(params)));
    if (!err) {
      this.remoteService.patch(id, res, shallowClone(params))
        .then(async rres => {
          self._mutateStore.mutate('patched', rres, 0);
          await self._removeQueuedEvent('patch', queueId, newData, res.updatedAt);
          await self.localService.patch(id, rres, shallowClone(params))
            .catch(async err => {
              // We have to test for a possible race condition
              let [lerr, lres] = await to( self.localService.get(id) );
              let [rerr, rres] = await to( self.remoteService.get(id) );
              if (!lres && rres) {
                // Something is very wrong
                throw new errors.NotFound(`Patch: id = '${id} not found on localService. Please report error!`);
              }
              // We have simply been overtaken by a remove request.
            });
          self.allowInternalProcessing();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.className === 'timeout' && rerr.name === 'Timeout') {
            debug(`_patch TIMEOUT: ${rerr.name}, ${rerr.message}`);
            // Let's silently ignore missing connection to server
            // We'll catch-up next time we get a connection
          } else {
            debug(`_patch ERROR: ${rerr.name}, ${rerr.message}`);
            self._mutateStore.mutate('updated', afterRecord, 2);
            await self._removeQueuedEvent('patch', queueId, newData, res.updatedAt);
            await self.localService.patch(id, beforeRecord);
          }
          self.allowInternalProcessing();
        });
    }
    else {
      await this._removeQueuedEvent('patch', queueId, newData, newData.updatedAt);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(newData)
      .then(this._strip)
      .then(this._select(params));
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
    this.disallowInternalProcessing();
    const queueId = await this._addQueuedEvent('remove', beforeRecord, id, cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.remove(id, shallowClone(params)));
    if (!err) {
      this.remoteService.remove(id, shallowClone(params))
        .then(async rres => {
          self._mutateStore.mutate('removed', rres, 0);
          await to(self._removeQueuedEvent('remove', queueId, beforeRecord, null));
          self.allowInternalProcessing();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.className === 'timeout' && rerr.name === 'Timeout') {
            debug(`_remove TIMEOUT: ${rerr.name}, ${rerr.message}`);
          } else {
            debug(`_remove ERROR: ${rerr.name}, ${rerr.message}`);
            if (beforeRecord.onServerAt === 0) {
              // In all likelihood the document/item was never on the server
              // so we choose to silently ignore this situation
            } else {
              // We have to restore the record to  the local DB
              await to(self.localService.create(beforeRecord, null));
              self._mutateStore.mutate('created', beforeRecord, 2);
              await self._removeQueuedEvent('remove', queueId, beforeRecord, null);
            }
          }
          self.allowInternalProcessing();
        });
    }
    else {
      await this._removeQueuedEvent('remove', queueId, beforeRecord, null);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(oldData)
      .then(this._strip)
      .then(this._select(params));
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

  // Allow access to our internal services (for application hooks and the demo). Use with care!
  get remote () {
    return this.remoteService;
  }

  set remote (value) { // Do not allow reassign
    throw new errors.Forbidden(`You cannot change value of remote!`);
  }

  get local () {
    return this.localService;
  }

  set local (value) { // Do not allow reassign
    throw new errors.Forbidden(`You cannot change value of local!`);
  }

  get queue () {
    return this.localQueue;
  }

  set queue (value) { // Do not allow reassign
    throw new errors.Forbidden(`You cannot change value of queue!`);
  }

  /* Queue handling */

  /**
   * Allow queue processing (allowed when semaphore this.aIP === 0)
   */
  allowInternalProcessing () {
    this.aIP--;
  }
  /**
   * Disallow queue processing (when semaphore this.aIP !== 0)
   */
  disallowInternalProcessing () {
    // // Do we have an active timer for DB changes
    // if (this.watchKeeper) {
    //   clearTimeout(this.watchKeeper);
    // }

    this.aIP++;

    // // Make sure we are not caught in an endless loop
    // this.watchKeeper = setTimeout(() => {this.aIP = 0}, this.timeout+5000);
  }
  /**
   * Is queue processing allowed?
   */
  internalProcessingAllowed () {
    return this.aIP === 0;
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
      console.log(`*** ERROR: _removedQueuedEvent: id=${id} eventName='${eventName}', localRecord=${JSON.stringify(localRecord)}, err.name =${err.name}, err.message=${err.message}`);
    }
  }

  async _processQueuedEvents () {
    debug(`processQueuedEvents (${this.type}) entered`);
    if(!this.internalProcessingAllowed() || this.pQActive) {
      // console.log(`processingQueuedEvents: internalProcessing (aIP=${this.aIP}), pQActive=${this.pQActive}`);
      return false;
    }
    this.pQActive = true;

    let [err, store] = await to(this.localQueue.getEntries({query:{$sort: {[this.id]: 1}}}));
    if (!(store && store !== {})) {
      this.pQActive = false;
      return true;
    }

    this.removeListeners();

    debug(`  processing ${store.length} queued entries...`);
    let self = this;
    let stop = false;
    while (store.length && !stop) {
      const el = store.shift();
      const event = el.eventName;
      debug(`    >> ${JSON.stringify(el)} <<`);

      try {
        let arg2 = el.arg2 || null;
        let arg3 = el.arg3 || null;
        debug(`    processing: event=${event}, arg1=${JSON.stringify(el.arg1)}, arg2=${JSON.stringify(arg2)}, arg3=${JSON.stringify(arg3)}`)
        await self.remoteService[event](el.arg1, arg2, arg3)
          .then(async res => {
            await to(self.localQueue.remove(el.id));
            if (event !== 'remove') {
              // Let any updates to the document/item on server reflect on the local DB
              await to(self.localService.patch(res[self.id], res));
            }
          })
          .catch(async err => {
            if (el.record.onServerAt === 0  &&  event === 'remove') {
              // This record has probably never been on server (=remoteService), so we silently ignore the error
              await to(self.localQueue.remove(el.id));
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

    debug(`  processing ended, stop=${stop}`);

    this.addListeners();
    this.pQActive = false;

    return !stop;
  }

  /* Event listening */

  addListeners () {
    debug('addListeners entered');
    if (this.listening) return;

    const service = this.remoteService;
    const eventListeners = this._eventListeners;

    Object.keys(eventListeners).forEach(ev => service.on(ev, eventListeners[ev]));

    this.listening = true;

    let self = this;
    this.localService.getEntries()
      .then(store => {
        self.emit('events', store, { action: 'add-listeners' });
        self._subscriber(store, { action: 'add-listeners' });
      })
      .catch(err => {
        console.trace('Trace from add-listeners:');
        throw new Error(`add-listeners: Bad result reading local service '${self.localServiceName}', err = ${err.name}, ${err.message}`);
      })
  };

  removeListeners () {
    debug('removeListeners entered');
    if (this.listening) {
      const service = this.remoteService;
      const eventListeners = this._eventListeners;

      Object.keys(eventListeners).forEach(ev => service.removeListener(ev, eventListeners[ev]));

      this.listening = false;
      let self = this;
      this.localService.getEntries()
        .then(store => {
          self.emit('events', store, { action: 'remove-listeners' });
          self._subscriber(store, { action: 'remove-listeners' });
        })
        .catch(err => {
          throw new Error(`remove-listeners: Bad result reading local service '${self.localServiceName}', err = ${err.name}, ${err.message}`);
        })
      }
  }

  /* Synchronization */

  /**
   * Synchronize the relevant documents/items from the remote db with the local db.
   *
   * @param (boolean) bAll If true, we try to sync for the beginning of time.
   * @returns (boolean) True if the process was completed, false otherwise.
   */
  async sync (bAll = false) {
    while (!this.internalProcessingAllowed()) {
      // console.log(`sync: await internalProcessing (aIP=${this.aIP})`);
      await new Promise(resolve => {
        setTimeout(() => {
          resolve(true);
        }, 100);
      });
    }

    const syncOptions = await this._getSyncOptions(bAll);
    debug(`${this.type}.sync(${JSON.stringify(syncOptions)}) started...`);
    let self = this;
    let result = true;

    let [err, snap] = await to( snapshot(this.remoteService, syncOptions) )
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
     * Moreover we track the `onServerAt` to determine latest sync timestamp
     */
    debug(`  Applying received snapshot data... (${snap.length} items)`);
    let syncTS = new Date(0).toISOString();
    await Promise.all(snap.map(async (v) => {
      let [err, res] = await to( self.localService.get(v[self.id]) );
      if (res) {
        syncTS = syncTS < v.onServerAt ? v.onServerAt : syncTS;
        if (v.deletedAt) {
          [err, res] = await to( self.localService.remove(v[self.id]));
        }
        else {
          [err, res] = await to( self.localService.patch(v[self.id], v));
        }
        if (err) { result = false; }
      }
      else {
        if (!v.deletedAt) {
          syncTS = syncTS < v.onServerAt ? v.onServerAt : syncTS;
          [err, res] = await to( self.localService.create(v));
          if (err) { result = false; }
        }
      }
    }));

    // Save last sync timestamp
    this.storage.setItem(this.thisName+'_syncedAt', new Date(syncTS).toISOString());

    if (result) // Wait until internal Processing is ok
      while (!await this._processQueuedEvents()) {
        await new Promise(resolve => {
          setTimeout(() => {
            resolve(true);
          }, 100);
        });
      };

    if (this.options.trackMutations) {
      let data = await this.getEntries();
      self.emit('events', data, { action: 'snapshot' });
    }

    return result;
  }

  /**
   * Determine the relevant options necessary for synchronizing this service.
   *
   * @param (boolean) bAll If true, we try to sync for the beginning of time.
   * @returns (object) The relevant options for snapshot().
   */
  async _getSyncOptions (bAll) {
    let sQuery = this.query ? (this.query.query || {}) : {};
    let query = Object.assign({}, sQuery, {offline:{_forceAll: true}, $sort: {onServerAt: 1}});
    let ts = bAll ? new Date(0).toISOString() : this.syncedAt;
    let syncTS = ts < this.syncedAt ? ts : this.syncedAt;
    // }
    if (syncTS !== new Date(ts)) {
      query.offline.onServerAt = new Date(syncTS);
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
  debug(`owndataWrapper started on path '${path}'`)
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

/* Support for updating adapter options through the wrapper */

let depends = [];
let watchingFn = null;

/**
 * Package the data to be observed in a proxy that updates according to
 * relevant recipes registered with watcher().
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
