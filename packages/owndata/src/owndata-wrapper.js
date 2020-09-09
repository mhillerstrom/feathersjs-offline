import EventEmitter from 'component-emitter';
import errors from '@feathersjs/errors';
import { _ } from '@feathersjs/commons';
import { sorter, select } from '@feathersjs/adapter-commons';
import { genUuid, to } from '@feathersjs-offline/common';
import ls from 'feathers-localstorage';
import MutateStore from './mutate-store';

const debug = require('debug')('@feathersjs-offline:owndata:service-wrapper');

if (typeof localStorage === "undefined" || localStorage === null) {
  debug('Simulating localStorage...');
  let LocalStorage = require('node-localstorage').LocalStorage;
  global.localStorage = new LocalStorage('./scratch');
}
else {
  debug('Utilizing built-in localStorage');
}


/**
 * OwndataWrapper is a wrapper function for FeathersJS services extending them to
 * implement the offline own-data principle (**LINK-TO-DOC**)
 */

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


const OwndataWrapper = function (app, service, options) {
  debug('Entering constructor...');
  let self = this;
  this.remoteService = service;

  // This is necessary if we get updates to options (e.g. .options.multi = ['patch'])
  this.depends = {};
  this.options = this.observe(Object.assign({}, defaultOptions, service.options, options));

  // Get the service name and standard settings
  this.name = getServicePath(app, service);
  this.id = this.options.id;
  this.events = service.events;

  // Construct the two helper services
  this.localServiceName = 'owndata_local_' + this.name;
  this.localServiceQueue = 'owndata_queue_' + this.name;

  let localOptions = Object.assign({}, this.options, { name: this.localServiceName, storage: localStorage, store: this.options.store, paginate: null });
  let queueOptions = Object.assign({}, this.options, { name: this.localServiceQueue, storage: localStorage, paginate: null, multi: true });

  debug(`  Setting up services '${this.localServiceName}' and '${this.localServiceQueue}'...`)
  app
    .use(this.localServiceName, ls( localOptions ))
    .use(this.localServiceQueue, ls( queueOptions ));

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
    this._strip =  attrStrip(..._adapterTestStrip);
  }
  else {
    this._strip = v => {return v};
  }

  this._select = (params, ...others) => (res) => {return select(params, ...others, self.id)(res)}

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
    this._mutateStore = new MutateStore({publication: this._publication, subscriber: this._subscriber, emitter: this});
  }
  else {
    this._mutateStore = { mutate: (event, data, params) => {return data}, publication: null, subscriber: () => {} };
  }

  // Initialize the service wrapper
  this.listening = false;
  this.processingQueued = false;
  this.syncedAt = -1;

  this.watcher(() => { // Update all changes to 'this.options' in both localService and remoteService
    for (let i in self.options) {
      self.localService.options[i] = self.options[i];
      self.remoteService.options[i] = self.options[i];
    }
  });

  debug('  Done.');
  return this;
};

OwndataWrapper.prototype.observe = observe;
OwndataWrapper.prototype.watcher = watcher;

OwndataWrapper.prototype.clearService = function (service, name) {
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

// =======================================================
// These metods are here to satisfy adapter-tests...
//
OwndataWrapper.prototype._get = async function (...args) {
  return Promise.resolve(this.localService._get(...args))
    .then(this._strip)
    .then(this._select());
};

OwndataWrapper.prototype._find = async function (...args) {
  return Promise.resolve(this.localService._find(...args))
    .then(this._strip)
    .then(this._select());
};

OwndataWrapper.prototype._create = async function (...args) {
  return Promise.resolve(this.localService._create(...args))
    .then(this._strip)
    .then(this._select());
};

OwndataWrapper.prototype._patch = async function (...args) {
  return Promise.resolve(this.localService._patch(...args))
    .then(this._strip)
    .then(this._select());
};

OwndataWrapper.prototype._update = async function (...args) {
  return Promise.resolve(this.localService._update(...args))
    .then(this._strip)
    .then(this._select());
};

OwndataWrapper.prototype._remove = async function (...args) {
  return Promise.resolve(this.localService._remove(...args))
    .then(this._strip)
    .then(this._select());
};
// =======================================================

OwndataWrapper.prototype.getEntries = async function (params) {
  let res = [];
  to( this.localService.getEntries(params) )
    .then(([err, entries]) => {
      if (!err) {
        res = entries
      }
    })
    .catch(([err, res]) => {throw err})
  return Promise.resolve(res)
    .then(this._strip)
    .then(select(res, ..._internalAlwaysSelect));
};

OwndataWrapper.prototype.get = async function (id, params) {
  return this.localService.get(id, params)
    .then(this._strip)
    .then(this._select())
    .catch(err => {throw err});
};

OwndataWrapper.prototype.find = async function (query, ...args) {
  return this.localService.find(query, ...args)
    .then(this._strip)
    .then(this._select(query));
};

OwndataWrapper.prototype.create = async function (data, params, ts = 0) {
  debug(`Calling create(${JSON.stringify(data)}, ${JSON.stringify(params)}})`);
  let self = this;
  if (Array.isArray(data)) {
    const multi = this.remoteService.allowsMulti('create');
    if (!multi) {
      throw new errors.MethodNotAllowed('Creating multiple without option set throws MethodNotAllowed'/*remove has not been configured to allow multiple documents*/);
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

  if (!('onServerAt' in newData)) {
    newData.onServerAt = 0;
  }

  // Now we'r ready to create

  // Is uuid unique?
  let [err, res] = await to( this.localService.find({query: {'uuid': newData.uuid}}) );
  if (res && res.length) {
    throw new errors.BadRequest(`Optimistic create requires unique uuid. (own-data) res=${JSON.stringify(res)}`);
  }

  // We apply optimistic mutation
  newData = this._mutateStore.mutate('created', newData, 1);
  const tmp = select(params, ..._internalAlwaysSelect)(newData);
  let queueId = await this._addQueuedEvent('create', newData, shallowClone(newData), params);

  // Start actual mutation on remote service
  [err, res] = await to( this.localService.create(newData, params) );
  if (!err) {
    this.remoteService.create(res, params)
      .then(async rres => {
        await self._removeQueuedEvent('create', queueId, newData, newData.updatedAt);

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
};

OwndataWrapper.prototype.update = async function (id, data, params = {}) {
  let self = this;
  let [err, res] = await to( this.localService.get(id) );
  if (!(res && res != {})) {
    throw new errors.NotFound(`Trying to update non-existing ${this.id}=${id}. (own-data) err=${JSON.stringify(err)}`);
  }

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
  [err, res] = await to( this.localService.update(id, newData, params) );
  if (!err) {
    to( this.remoteService.update(id, res, params) )
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
};

OwndataWrapper.prototype.patch = async function (id, data, params = {}) {
  let self = this;
  if (id === null) {
    return this.find(params).then(page => {
      const res = page.data ? page.data : page;
      const multi = this.remoteService.allowsMulti('patch');
      if (Array.isArray(res) && !multi) {
        throw new errors.MethodNotAllowed('Patching multiple without option set throws MethodNotAllowed'/*remove has not been configured to allow multiple documents*/);
      }

      return Promise.all(res.map(
        current => self.patch(current[this.id], data, params))
      );
    });
  }

  let [err, res] = await to( this.localService.get(id) );
  if (!(res && res != {})) {
    throw err;
  }

  // Optimistic mutation
  const beforeRecord = shallowClone(res);
  const afterRecord = Object.assign({}, beforeRecord, data);
  const newData = this._mutateStore.mutate('patched', afterRecord, 1);
  const queueId = await this._addQueuedEvent('patch', newData, id, shallowClone(newData), params);

  // Start actual mutation on remote service
  [err, res] = await to( this.localService.patch(id, newData, params) );
  if (!err) {
    to( this.remoteService.patch(id, res, params) )
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
};

OwndataWrapper.prototype.remove = async function (id, params = {}) {
  let self = this;

  if (id === null) {
    return this.find(params).then(page => {
      const res = page.data ? page.data : page;
      const multi = this.remoteService.allowsMulti('remove');
      if (Array.isArray(res)) {
        if (!multi) {
          throw new errors.MethodNotAllowed('Removing multiple without option set throws MethodNotAllowed'/*remove has not been configured to allow multiple documents*/);
        }
      }
      else {
        res = [ res ];
      }

      return Promise.all(res.map(
        current => self.remove(current[this.id], params))
      );
    });
  }

  let [err, res] = await to( this.localService.get(id) );
  if (!(res && res != {})) {
    throw new errors.BadRequest(`Trying to remove non-existing ${this.id}=${id}. (own-data) err=${JSON.stringify(err)}, res=${JSON.stringify(res)}`);
  }

  // Optimistic mutation
  const beforeRecord = shallowClone(res);
  const oldData = this._mutateStore.mutate('removed', beforeRecord, 1);
  const queueId = await this._addQueuedEvent('remove', beforeRecord, id, params);

  // Start actual mutation on remote service
  [err, res] = await to( this.localService.remove(id, params) );
  if (!err) {
    to( this.remoteService.remove(id, params) )
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
};

OwndataWrapper.prototype._addQueuedEvent = async function (eventName, localRecord, arg1, arg2, arg3) {
  debug('addQueuedEvent entered');
  if (this.processingQueued) {
    debug('addQueuedEvent ignored - processingQueued');
    return;
  }

  let [err, res] = await to( this.localQueue.create({ eventName, record: localRecord, arg1, arg2, arg3 }) );
  return res[this.id];
};

OwndataWrapper.prototype._removeQueuedEvent = async function (eventName, id, localRecord, updatedAt) {
  debug('removeQueuedEvent entered');

  let err, res;
  try {
  [err, res] = await to( this.localQueue.remove(id) );
  } catch (err) {
    console.log(`*** ERROR: _removedQueuedEvent: id=${id} eventName='${eventName}', localRecord=${JSON.stringify(localRecord)}`);
  }

  if (!err && updatedAt) this.syncedAt = updatedAt;
};

OwndataWrapper.prototype._processQueuedEvents = async function () {
  debug('processQueuedEvents entered');
  this.processingQueued = true;

  let [err, store] = await to( this.localQueue.getEntries() );
  // console.error(`ProcessingQueue: store.length=${store.length}\n${JSON.stringify(store, null, 2)} err=${JSON.stringify(err)}`);
  if (!(store && store != {})) {
    this.processingQueued = false;
    return;
  }

  this.removeListeners();

  let stop = false;
  while (store.length && !stop) {
    const el = store.shift();
    const event = el.eventName;

    try{
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
        to( this.localQueue.remove(res[this.id]) );
      })
      .catch((err) => {
        if (el.record.onServerAt === 0) {
          // This record has probably never been on server (=remoteService), so we silently ignore the error
          to( this.localQueue.remove(el[this.id]) );
        }
        else {
          // console.error(`ProcessingQueue: event=${event} FAILED: reenter ${JSON.stringify(el, null, 2)} into queue and STOP!!!\nerror=${JSON.stringify(err, null, 2)}`);
          stop = true;
        }
      });
    } catch (error) {
      console.error(`Got ERROR ${JSON.stringify(error.name,null,2)}, ${JSON.stringify(error.message,null,2)}`);
    }
  }
  this.processingQueued = false;
  this.addListeners();
  return true;
};

OwndataWrapper.prototype.addListeners = function () {
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

OwndataWrapper.prototype.removeListeners = function () {
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

  OwndataWrapper.prototype.mixin = mixin;
  OwndataWrapper.prototype.extend = extend;
};

const owndataWrapper = function (app, service, options = {}) {
  let name = getServicePath(app, service);
  return app.services[name] = new OwndataWrapper(app, service, options);
};

export { owndataWrapper };

// --- Helper functions

/**
 * Get the service path from the service (works both on client and backend)
 * @param {} app
 * @param {*} service
 */
const getServicePath = function (app, service) {
  // Running in client?
  if (typeof service.path !== 'undefined')
    return service.path;

  // No, we'r on a server
  for (let sn in app.services)
    if (app.services[sn] === service) return sn;

  return 'unknown';
};

/**
 * Make a shallow clone of any given object
 * @param {object} obj
 * @returns {object} The copy object
 */
function shallowClone (obj) {
  return Object.assign({}, obj);
}

/**
 * Make an observer proxy for a given object
 * @param {object} data
 */
function observe (data) {
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
};

/**
 * Register a handler for the observer proxy
 * @param {function} target The handler function
 */
function watcher (target) {
  this.watchingFn = target;
  target();
  this.watchingFn = null;
};


// === Borrowed from the NPM 'uberproto' package ====
var HAS_SYMBOLS = typeof Object.getOwnPropertySymbols === 'function';

function makeSuper (_super, old, name, fn) {
  var isFunction = typeof old === 'function';
  var newMethod = function () {
    var tmp = this._super;

    // Add a new ._super() method that is the same method
    // but either pointing to the prototype method
    // or to the overwritten method
    this._super = isFunction ? old : _super[name];

    // The method only need to be bound temporarily, so we
    // remove it when we're done executing
    var ret = fn.apply(this, arguments);

    this._super = tmp;

    return ret;
  };

  if (isFunction) {
    Object.keys(old).forEach(function (name) {
      newMethod[name] = old[name];
    });

    if (HAS_SYMBOLS) {
      Object.getOwnPropertySymbols(old).forEach(function (name) {
        newMethod[name] = old[name];
      });
    }
  }

  return newMethod;
}

/**
 * Mixin a given set of properties
 * @param prop The properties to mix in
 * @param obj [optional]
 * The object to add the mixin
 */
function mixin (prop, obj) {
  var self = obj || this;
  var fnTest = /\b_super\b/;
  var _super = Object.getPrototypeOf(self) || self.prototype;
  var descriptors = {};
  var proto = prop;
  var processProperty = function (name) {
    var descriptor = Object.getOwnPropertyDescriptor(proto, name);

    if (!descriptors[name] && descriptor) {
      descriptors[name] = descriptor;
    }
  };

  // Collect all property descriptors
  do {
    Object.getOwnPropertyNames(proto).forEach(processProperty);

    if (HAS_SYMBOLS) {
      Object.getOwnPropertySymbols(proto).forEach(processProperty);
    }
  } while ((proto = Object.getPrototypeOf(proto)) && Object.getPrototypeOf(proto));

  var processDescriptor = function (name) {
    var descriptor = descriptors[name];

    if (typeof descriptor.value === 'function' && fnTest.test(descriptor.value)) {
      descriptor.value = makeSuper(_super, self[name], name, descriptor.value);
    }

    Object.defineProperty(self, name, descriptor);
  };

  Object.keys(descriptors).forEach(processDescriptor);

  if (HAS_SYMBOLS) {
    Object.getOwnPropertySymbols(descriptors).forEach(processDescriptor);
  }

  return self;
};

/**
 * Extend the current or a given object with the given property and return the extended object.
 * @param prop The properties to extend with
 * @param obj [optional] The object to extend from
 * @returns The extended object
 */
function extend (prop, obj) {
  return this.mixin(prop, Object.create(obj || this));
};
