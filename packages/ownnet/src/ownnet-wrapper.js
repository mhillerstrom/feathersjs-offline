import { stripSlashes } from '@feathersjs/commons';
import errors from '@feathersjs/errors';
import { to } from '@feathersjs-offline/common';
import OwnClass from '../../owndata/src/own-class';
import { config } from 'process';

const debug = require('debug')('@feathersjs-offline:ownnet:service-wrapper');

class OwnnetClass extends OwnClass {
  constructor(options = {}) {
    debug(`Constructor started, opts = ${JSON.stringify(options)}`);
    super(options);

    this.type = 'own-net';
    this.__forTestingOnly = super._processQueuedEvents;

    debug('  Done.');
    return this;
  }

  async _processQueuedEvents() {
//    const debug = (...args) => console.log(...args);
    debug(`processQueuedEvents (${this.type}) entered (IPallowed=${this.internalProcessingAllowed()}, pQActive=${this.pQActive})`);
    if (!this.internalProcessingAllowed() || this.pQActive) {
      // console.log(`processingQueuedEvents: internalProcessing (aIP=${this.aIP}), pQActive=${this.pQActive}`);
      return false;
    }
    this.pQActive = true;

    let [err, store] = await to(this.localQueue.getEntries({ query: { $sort: { uuid: 1, updatedAt: 1 } } }));
    if (!store || store === [] || store.length === 0) {
      this.pQActive = false;
      return true;
    }

    this.disallowInternalProcessing();

    debug(`  store = ${JSON.stringify(store)}`);
    let self = this;

    let i = 0; // Current event
    let j = 0; // Current first event
    let ids = []; // The ids of the entries in localQueue currently accumulated
    let netOps = [];
    let ev = [];
    let stop = false;

    // For own-net we only send one accumulated record to the server - let's accumulate!
    // Remember, we already have the accumulated record on file in localService.get, so all we
    // need to do, it to look out for create and remove - the rest we remoteService.patch!
    let eventName, record, arg1, arg2, arg3;
    do {
      while (i < store.length && store[i].record.uuid === store[j].record.uuid) {
        ({ eventName, record, arg1, arg2, arg3 } = store[i]);
        ids.push(store[i].id);
        ev.push(eventName);
        if (eventName === 'remove') {
          netOps.push(_accEvent(this.id, eventName, record, arg1, arg2, arg3, ids));
          ev = []; ids = [];
          j = i + 1; // New start at next record
        }
        i++; // get next possible record
      }
      if (ids.length) {
                          try{
        let res, err;
        if (store[j].eventName !== 'create')
          [err, res] = await to(self.localService.get(store[j].record[this.id]));
        else
          res = store[j].record;
        let action = ev.includes('create') ? 'create' : 'patch';
        netOps.push(_accEvent(this.id, action, res, arg1, arg2, arg3, ids));
      } catch (err) {
        console.error(`******* ERROR : ${err.name}, ${err.message} i=${i}, j=${j}, store.length=${store.length}, store=${JSON.stringify(store[j].record)}`);
      }
        if (i < store.length) {
          ev = [ store[i].eventName ];
          ids = [ store[i].id ];
        }
        j = i++; // New start at i and move to next record
      }
    } while (i < store.length);

//    console.log(`netOps = ${JSON.stringify(netOps)}`);

    // Now, send all necessary updates to the remote service (server)
    stop = false;
    // In future version we will user Promise.allSettled() instead...
    let result = await Promise.all(netOps.map(async op => {
      let { event, el, arg1, arg2, arg3, ids } = op;
      let mdebug = `  remoteService['${event}'](${JSON.stringify(arg1)}, ${JSON.stringify(arg2)}, ${JSON.stringify(arg3)})`;
//      console.log(mdebug);
      return await self.remoteService[event](arg1, arg2, arg3)
        .then(async res => {
          return await self.localQueue.remove(null, { query: { id: { $in: ids } } })
            .then(async qres => {
              if (event !== 'remove') {
                return await self.localService.patch(res[self.id], res)
                  .catch(err => {
                    debug(mdebug);
                    debug(`  localService.patch(${JSON.stringify(res[self.id])}, ${JSON.stringify(res)})`);
                    debug(`  ev = ${JSON.stringify(ev)}`);
                    return true;
                  })
                  .then(() => { return false; })
              }

              return false;
            })
            .catch(err => {
              console.log(`err2=${err.name}, ${err.message}`);
              return false;
            });
        })
        .catch(err => {
          // if (err.name === 'Timeout' && err.type === 'FeathersError') {
          //   // We silently accept - we probably lost connection
          // }
          // else {
          //   if (event === 'remove' && el.onServerAt === 0) {
          //     // This record has probably never been on server (=remoteService), so we silently ignore the error
          //   }
          //   else {
          if (err.name !== 'Timeout' && event !== 'remove' && el.onServerAt !== 0) {
            return false;
          }
          // }
          return false;
        });
    }));
    // stop = result.reduce((pv, cv, ci, arr) => stop || arr[ci]);

    this.allowInternalProcessing();
    this.pQActive = false;

    return true;
    }

}
function init(options) {
  return new OwnnetClass(options);
}

let Ownnet = init;


/**
 * A ownnetWrapper is a CLIENT adapter wrapping for FeathersJS services extending them to
 * implement the offline own-net principle (**LINK-TO-DOC**).
 *
 * @example ```
 * import feathers from '(at)feathersjs/feathers';
 * import memory from 'feathers-memory';
 * import { ownnetWrapper } from '(at)feathersjs-offline/ownnet';
 * const app = feathers();
 * app.use('/testpath', memory({id: 'uuid', clearStorage: true}));
 * ownnetWrapper(app, '/testpath');
 * app.service('testpath').create({givenName: 'James', familyName: 'Bond'})
 * ...
 * ```
 *
 * It works in co-existence with it's SERVER counterpart, RealtimeServiceWrapper.
 *
 * @param {object} app  The application handle
 * @param {object} path The service path (as used in ```app.use(path, serviceAdapter)```)
 * @param {object} options The options for the serviceAdaptor AND the OwnnetWrapper
 *
 */
function ownnetWrapper(app, path, options = {}) {
  debug(`OwnnetWrapper started on path '${path}'`)
  if (!(app && app['version'] && app['service'] && app['services']))
    throw new errors.Unavailable(`The FeathersJS app must be supplied as first argument`);

  let location = stripSlashes(path);

  let old = app.services[location];
  if (typeof old === 'undefined') {
    throw new errors.Unavailable(`No prior service registered on path '${location}'`);
  }

  let opts = Object.assign({}, old.options, options);
  app.use(location, Ownnet(opts, true));
  app.services[location].options = opts;
  app.services[location]._listenOptions();

  return app.services[location];
}

module.exports = { init, Ownnet, ownnetWrapper };

init.Service = OwnnetClass;


// Helper

function _accEvent(idName, event, el, arg1, arg2, arg3, ids) {
  let id = el[idName];
  switch (event) {
    case 'create':
      return { event, el, arg1: el, arg2: {}, arg3: {}, ids };
    case 'update':
      return { event, el, arg1, arg2, arg3: {}, ids };
    case 'patch':
      return { event, el, arg1: id, arg2: el, arg3: {}, ids };
    case 'remove':
      return { event, el, arg1: id, arg2: {}, arg3: {}, ids };
  }
}
