import EventEmitter from 'component-emitter';
import sift from 'sift';
import { sorter, select, AdapterService } from '@feathersjs/adapter-commons';
import { _, hooks, stripSlashes } from '@feathersjs/commons';
import errors from '@feathersjs/errors';
import ls from 'feathers-localstorage';
import { genUuid, to } from '@feathersjs-offline/common';
import snapshot from '@feathersjs-offline/snapshot';

const debug = require('debug')('@feathersjs-offline:owndata:ownnet:service-base');

if (typeof localStorage === 'undefined' /* || localStorage === null */) {
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
  'adapterTest': false,
  // 'multi': false,
  // 'paginate': false,
  'matcher': sift,
  sorter,
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

class OwnClass extends AdapterService {
  constructor (opts) {
    let newOpts = Object.assign({}, defaultOptions, opts);

    debug(`Constructor started, newOpts = ${JSON.stringify(newOpts)}`);
    super(newOpts);

    this.wrapperOptions = Object.assign({}, newOpts, this.options);
    debug(`Constructor ended, options = ${JSON.stringify(this.options)}`);

    this.type = 'own-class';

    debug('  Done.');
    return this;
  }

  async _setup (app, path) {  // This will be removed for future versions of Feathers
    debug(`_SetUp('${path}') started`);
    this.setup(app, path);
  }

  async setup (app, path) {
    debug(`SetUp('${path}') started`);
    // if (!this._setup) { // Assure we only run setup once
    //   return;
    // }
    // this._setup = true;

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
    return this._get(id, params);
  }

  async _get (id, params) {
    debug(`Calling _get(${JSON.stringify(id)}, ${JSON.stringify(params)}})`);
    return await this.localService.get(id, params)
      .then(this._strip)
      .then(this._select(params))
      .catch(err => {throw err});
  }

  async find (params) {
    debug(`Calling find(${JSON.stringify(params)}})`);
    return this._find(params);
  }

  async _find (params) {
    debug(`Calling _find(${JSON.stringify(params)}})`);
    return this.localService.find(params)
      .then(this._strip)
      .then(this._select(params));
  };

  async create(data, params) {
    debug(`Calling create(${JSON.stringify(data)}, ${JSON.stringify(params)})`);
    if (Array.isArray(data) && !this.allowsMulti('create')) {
      return Promise.reject(new errors.MethodNotAllowed('Creating multiple without option \'multi\' set'));
    }

    return this._create(data, params);
  }

  async _create (data, params, ts = 0) {
    debug(`Calling _create(${JSON.stringify(data)}, ${JSON.stringify(params)}, ${ts})`);
    let self = this;
    if (Array.isArray(data)) {
      const multi = this.allowsMulti('create');
      if (!multi) {
        return Promise.reject(new errors.MethodNotAllowed('Creating multiple without option \'multi\' set'));
      }

      let timestamp = new Date();
      // In future version we will user Promise.allSettled() instead...
      return Promise.all(data.map(current => self._create(current, params, timestamp)));
    }

    ts = ts || new Date();

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
    let newParams = shallowClone(params);
    this.disallowInternalProcessing();
    let queueId = await this._addQueuedEvent('create', newData, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.create(newData, shallowClone(params)));
    if (!err) {
//      console.log(`remote.create(${JSON.stringify(res)}, ${JSON.stringify(params)}})`);
      this.remoteService.create(res, shallowClone(params))
        .then(async rres => {
          await self._removeQueuedEvent('create1', queueId, newData, newData.updatedAt);
          await self.localService.patch(rres[self.id], rres)
            .catch(async err => {
              // // We have to test for a possible race condition
              // let [lerr, lres] = await to( self.localService.get(id) );
              // let [rerr, rres] = await to( self.remoteService.get(id) );
              // if (!lres && rres) {
              //   // Something is very wrong
              //   throw new errors.NotFound(`Create. id = '${id} not found on localService. Please report error!`);
              // }
              // We have simply been overtaken by a remove request.
            });

          // Ok, we have connection - empty queue if we have any items queued
          self.allowInternalProcessing();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.name !== 'Timeout') {
            // Let's silently ignore missing connection to server -
            // we'll catch-up next time we get a connection
            // In all other cases do the following:
          try {
              await self._removeQueuedEvent('create2', queueId, rerr.message/*newData*/, newData.updatedAt);
          } catch (error) {
            console.error(`Error _removeQueuedEvent (create2) error=${error.name}, ${error.message}`);
          }
          try {
            await self.localService.remove(res[self.id], params);
          } catch (error) {
            console.error(`Error localService.remove2 (create2) error=${error.name}, ${error.message}`);
          }
          }

          self.allowInternalProcessing();
        });
    }
    else {
      await this._removeQueuedEvent('create3', queueId, newData, newData.updatedAt);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(res)
      .then(this._strip)
      .then(this._select(params));
  }

  async update (id, data, params) {
    debug(`Calling update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
    if (id === null || Array.isArray(data)) {
      return Promise.reject(new errors.BadRequest(
        `You can not replace multiple instances. Did you mean 'patch'?`
      ));
    }

    return this._update(id, data, params);
  }

  async _update (id, data, params = {}) {
    debug(`Calling _update(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
    let self = this;

    if (id === null || Array.isArray(data)) {
      return Promise.reject(new errors.BadRequest(
        `You can not replace multiple instances. Did you mean 'patch'?`
      ));
    }

    let [err, res] = await to(this.localService._get(id));
    if (!(res && res !== {})) {
      throw new errors.NotFound(`Trying to update non-existing ${this.id}=${id}. (${this.type}) err=${JSON.stringify(err.name)}`);
    }

    // We don't want our uuid to change type if it can be coerced
    const beforeRecord = shallowClone(res);
    const beforeUuid = beforeRecord.uuid;

    let newData = shallowClone(data);
    newData.uuid = beforeUuid; // eslint-disable-line
    newData.updatedAt = new Date();
    newData.onServerAt = 0;

    // Optimistic mutation
    this.disallowInternalProcessing();
    let queueId = await this._addQueuedEvent('update', newData, id, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.update(id, newData, shallowClone(params)));
    if (!err) {
      this.remoteService.update(id, res, shallowClone(params))
        .then(async rres => {
          await self._removeQueuedEvent('update1', queueId, newData, res.updatedAt);
          await self.localService.update(res[self.id], res, shallowClone(params))
            .catch(async err => {
              // // We have to test for a possible race condition
              // let [_lerr, lres] = await to( self.localService._get(id) );
              // // We have to test for a possible race condition
              // let [_rerr, rres] = await to( self.remoteService._get(id) );
              // if (!lres && rres) {
              //   // Something is very wrong
              //   throw new errors.NotFound(`Update: id = '${id} not found on localService. Please report error!`);
              // }
              // We have simply been overtaken by a remove request.
            });
          self.allowInternalProcessing();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.name === 'Timeout') {
            debug(`_update TIMEOUT: ${rerr.name}, ${rerr.message}`);
            // Let's silently ignore missing connection to server
            // We'll catch-up next time we get a connection
          } else {
            debug(`_update ERROR: ${rerr.name}, ${rerr.message}`);
            await self._removeQueuedEvent('update2', queueId, newData, res.updatedAt);
            await self.localService.patch(id, beforeRecord);
          }
          self.allowInternalProcessing();
        });
    }
    else {
      await this._removeQueuedEvent('update3', queueId, newData, newData.updatedAt);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(newData)
      .then(this._strip)
      .then(this._select(params));
  }

  async patch (id, data, params) {
    debug(`Calling patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
    if (id === null && !this.allowsMulti('patch')) {
      return Promise.reject(new errors.MethodNotAllowed(`Can not patch multiple entries`));
    }

    return this._patch(id, data, params);
  }

  async _patch (id, data, params = {}, ts = 0) {
    debug(`Calling _patch(${id}, ${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
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

        let timestamp = new Date().toISOString();
        return Promise.all(res.map(
          current =>
{
debug(`patch current = ${JSON.stringify(current)}`);
            return self._patch(current[this.id], data, params, timestamp)
}
        )
        );
      });
    }

    ts = ts || new Date();

    let [err, res] = await to(this.localService._get(id));
    if (!(res && res !== {})) {
      throw err;
    }

    // Optimistic mutation
    const beforeRecord = shallowClone(res);
    const newData = Object.assign({}, beforeRecord, data);
    newData.onServerAt = 0;
    newData.updatedAt = ts;
    this.disallowInternalProcessing();
    const queueId = await this._addQueuedEvent('patch', newData, id, shallowClone(newData), cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.patch(id, newData, shallowClone(params)));
    if (!err) {
      this.remoteService.patch(id, res, shallowClone(params))
        .then(async rres => {
          await self._removeQueuedEvent('patch1', queueId, newData, res.updatedAt);
          try {
            await self.localService.patch(id, rres, shallowClone(params))
            .catch(async err => {
              // // We have to test for a possible race condition
              // let [_lerr, lres] = await to( self.localService._get(id) );
              // let [_rerr, rres] = await to( self.remoteService._get(id) );
              // if (!lres && rres) {
              //   // Something is very wrong
              //   let lerr = _lerr || {name:'lerr', message:'.'};
              //   let rerr = _rerr || {name:'rerr', message:'.'};
              //   throw new errors.NotFound(`Patch: ${this.id} = '${id}' not found on localService. Please report error! \n${err.name} ${err.message}\n${lerr.name} ${lerr.message}\n${rerr.name} ${rerr.message}`);
              // }
              // We have simply been overtaken by a remove request.
            });
          } catch (error) {
            console.error(`Error localService.patch ${this.id}=${id}, error=${error.name}, ${error.message}`);
            console.error(`localService.getEntries = ${JSON.stringify(await self.localService.getEntries())}`);
          }
          self.allowInternalProcessing();
          await self._processQueuedEvents();
      })
        .catch(async rerr => {
          if (rerr.name === 'Timeout') {
            debug(`_patch TIMEOUT: ${rerr.name}, ${rerr.message}`);
            // Let's silently ignore missing connection to server
            // We'll catch-up next time we get a connection
          } else {
            debug(`_patch ERROR: ${rerr.name}, ${rerr.message}`);
            try {
              await self._removeQueuedEvent('patch2', queueId, newData, res.updatedAt);
            } catch (error) {
              console.error(`Error _removeQueuedEvent2 error=${error.name}, ${error.message}`);
            }
            try {
              await self.localService.patch(id, beforeRecord);
              } catch (error) {
                console.error(`Error localService.patch2 error=${error.name}, ${error.message}`);
              }
                }
          self.allowInternalProcessing();
        });
    }
    else {
      await this._removeQueuedEvent('patch3', queueId, newData, newData.updatedAt);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(newData)
      .then(this._strip)
      .then(this._select(params));
  }

  async remove (id, params) {
    debug(`Calling remove(${id}, ${JSON.stringify(params)}})`);
    if (id === null && !this.allowsMulti('remove')) {
      return Promise.reject(new errors.MethodNotAllowed(`Can not remove multiple entries`));
    }

    return this._remove(id, params);
  }

  async _remove (id, params = {}) {
    debug(`Calling _remove(${id}, ${JSON.stringify(params)}})`);
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
          current => self._remove(current[this.id], params))
        );
      });
    }

    let [err, res] = await to(this.localService._get(id));
    if (!(res && res !== {})) {
      throw new errors.BadRequest(`Trying to remove non-existing ${this.id}=${id}. (${this.type}) err=${JSON.stringify(err)}, res=${JSON.stringify(res)}`);
    }

    // Optimistic mutation
    const beforeRecord = shallowClone(res);
    this.disallowInternalProcessing();
    const queueId = await this._addQueuedEvent('remove', beforeRecord, id, cleanUpParams(params));

    // Start actual mutation on remote service
    [err, res] = await to(this.localService.remove(id, shallowClone(params)));
    if (!err) {
      this.remoteService.remove(id, shallowClone(params))
        .then(async rres => {
          await to(self._removeQueuedEvent('remove1', queueId, beforeRecord, null));
          self.allowInternalProcessing();
          await self._processQueuedEvents();
        })
        .catch(async rerr => {
          if (rerr.name === 'Timeout') {
            debug(`_remove TIMEOUT: ${rerr.name}, ${rerr.message}`);
          } else {
            debug(`_remove ERROR: ${rerr.name}, ${rerr.message}`);
            debug(`beforeRecord = ${JSON.stringify(beforeRecord)}`);
            if (beforeRecord.onServerAt === 0) {
              // In all likelihood the document/item was never on the server
              // so we choose to silently ignore this situation
            } else {
              // We have to restore the record to  the local DB
              await to(self.localService.create(beforeRecord, null));
              await self._removeQueuedEvent('remove2', queueId, beforeRecord, null);
            }
          }
          self.allowInternalProcessing();
        });
    }
    else {
      await this._removeQueuedEvent('remove3', queueId, beforeRecord, null);
      this.allowInternalProcessing();
      throw err;
    }

    return Promise.resolve(beforeRecord)
      .then(this._strip)
      .then(this._select(params));
  }


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
    this.aIP++;
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
    return Promise.resolve(res.id);
  }

  async _removeQueuedEvent (eventName, id, localRecord, updatedAt) {
    debug('removeQueuedEvent entered');

    return Promise.resolve(this.localQueue.remove(id))
      .then(res => {
        debug(`removeQueuedEvent removed: ${JSON.stringify(res)}`);
      })
      .catch(err => {
        console.log(`*** ERROR: _removedQueuedEvent: id=${id} eventName='${eventName}', localRecord=${JSON.stringify(localRecord)}, err.name =${err.name}, err.message=${err.message}`);
      });
  }

  /**
   * This method must be implemented in own-data and own-net classes extending this class
   */
  async _processQueuedEvents () {
    throw new errors.NotImplemented(`_processQueuedEvents must be implemented!!!`);
  }

  /* Event listening */


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

    return result;
  }

  /**
   * Determine the relevant options necessary for synchronizing this service.
   *
   * @param (boolean) bAll If true, we try to sync for the beginning of time.
   * @returns (object) The relevant options for snapshot().
   */
  async _getSyncOptions (bAll) {
    let query = Object.assign({}, {offline:{_forceAll: true}, $sort: {onServerAt: 1}});
    let ts = bAll ? new Date(0).toISOString() : this.syncedAt;
    let syncTS = ts < this.syncedAt ? ts : this.syncedAt;

    if (syncTS !== new Date(ts)) {
      query.offline.onServerAt = new Date(syncTS);
    }

    return query;
  }

};


module.exports = OwnClass;

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
