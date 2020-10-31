import { stripSlashes } from '@feathersjs/commons';
import { to } from '@feathersjs-offline/common';
// import { Owndata } from '@feathersjs-offline/owndata';
import { Owndata } from '../../owndata/lib';

const debug = require('debug')('@feathersjs-offline:ownnet:service-wrapper');

class OwnnetClass extends Owndata.Service {
  constructor (options = {}) {
    debug(`Constructor started, opts = ${JSON.stringify(options)}`);
    super(options);
    debug(`Constructor ended, options = ${JSON.stringify(this.options)}`);

    this.type = 'own-net';

    debug('  Done.');
    return this;
  }

  async _processQueuedEvents () {
    debug(`processQueuedEvents (${this.type}) entered`);
    if(this.aPQ) {
      return
    }

    let [err, store] = await to(this.localQueue.getEntries({query:{$sort: {uuid: 1, updatedAt: 1}}}));
    if (!(store && store !== {})) {
      return;
    }

    debug(`  store = ${JSON.stringify(store)}`);
    this.removeListeners();
    let self = this;

    let netOps = [];
    let i = 0;
    let ev = [];
    let event = 'patch';
    let el = {};
    let ids = [];
    let stop = store.length === 0;
    let uuid = !stop ? store[i].record.uuid : '';
    if (!stop) {
      do {
        // For own-net we only send one accumulated record to the server - let's accumulate!
        while (i < store.length && uuid === store[i].record.uuid) {
          ev.push(store[i].eventName);
          event = store[i].eventName==='remove' ? 'remove' : (event==='remove'? 'remove' : event) ;
          el = Object.assign({}, el, store[i].record);
          ids.push(store[i].id);
          i++;
        }

        // Decide whether to create, patch, or remove the document/item
        let arg;
        let arg1;
        let [err, res] = await to(self.remoteService.get(el[this.id]));
        if (err) {
          if (err.name === 'Timeout' && err.type === 'FeathersError') {
            // We probably lost connection... again
            this.processingQueued = false;
            this.addListeners();
            return false;
          }
          if ('update patch'.includes(event)) {
            event = 'create';
            arg = el;
            arg1 = {};
          }
          else if (event === 'remove') {
            arg = el[this.id];
            arg1 = {}
          }
          else { // create
            arg = el[this.id];
            arg1 = el;
          }
        }

        // We have accumulated all for uuid - save for later execution
        netOps.push({event, el, arg, arg1, ids, ev});

        // Any more work to do?
        if (i < store.length) {
          // We have at least one more record to prepare
          ev = [];
          ev.push(store[i].eventName);
          event = store[i].eventName==='remove' ? 'remove' : 'patch';
          uuid = store[i].record.uuid;
          el = Object.assign({}, store[i].record);
          ids = [];
        }
        else { // No, we are done preparing records
          stop = true;
        }
        i++;
      } while (!stop);

      // Now, send all necessary updates to the server
      stop = false;
      let result = await Promise.all(netOps.map(async op => {
        let {event, el, arg, arg1, ids, ev} = op;
        let mdebug = `  remoteService['${event}'](${JSON.stringify(arg)}, ${JSON.stringify(arg1)})`;
        return await self.remoteService[event](arg, arg1)
          .then(async res => {
            return await self.localQueue.remove(null, {query: {id: {$in: ids}}})
              .then(async qres => {
                if (event !== 'remove') {
                  return await self.localService.patch(res[self.id], res)
                  .then(() => {
                    // console.log(`localService.patch(${res[self.id]}, ${JSON.stringify(res)}) OK`)
                    return true})
                    .catch(err => {
                      debug(mdebug);
                      debug(`  localService.patch(${JSON.stringify(res[self.id])}, ${JSON.stringify(res)})`);
                      debug(`  ev = ${JSON.stringify(ev)}`);
                      return false})
                }
                else
                  return true;
              })
              .catch(err => {
                return false});
          })
          .catch(err => {
            if (err.name === 'Timeout' && err.type === 'FeathersError') {
              // We silently accept - we probably lost connection
              stop = true;
            }
            else {
              if (event === 'remove' && el.onServerAt === 0) {
                // This record has probably never been on server (=remoteService), so we silently ignore the error
              }
              else {
                stop = true;
              }
            }
            return stop;
          });
      }));
      let r = result;
   }

    this.addListeners();
    return stop;
  }

};

/**
 * A OwnnetWrapper is a CLIENT adapter wrapping for FeathersJS services extending them to
 * implement the offline own-data principle (**LINK-TO-DOC**).
 *
 * @example ```
 * import feathers from '(at)feathersjs/feathers';
 * import memory from 'feathers-memory';
 * import OwnnetWrapper from '(at)feathersjs-offline/owndata';
 * const app = feathers();
 * app.configure(OwnnetWrapper('/testpath', memory, {id: 'uuid', clearStorage: true}));
 * app.service('testpath').create({givenName: 'James', familyName: 'Bond'})
 * ...
 * ```
 *
 * It works in co-existence with it's SERVER counterpart, RealtimeServiceWrapper.
 *
 * @param {object} path The service path (as used in ```app.use(path, serviceAdapter)```)
 * @param {object} cls  The serviceAdapter class (e.g. ```import memory from 'feathers-memory';```)
 * @param {object} options The options for the serviceAdaptor AND the OwnnetWrapper
 *
 */
function OwnnetWrapper (path, cls, options = {}) {
  debug('OwnnetWrapper called');

  if (!cls) {
    throw new Error(`Bad usage: class for service on path '${path} must be supplied to OwnnetWrapper.`);
  }
  // TODO: figure a way to check that cls is in fact a prototype of AdapterService AND not OwnnetWrapperClass
  // if (cls.Service) {
  //   if (!cls.Service.constructor.isPrototypeOf('AdapterService')) {
  //     throw new Error(`Bad service: Cannot wrap the service supplied for path '${path}'`);
  //   }
  // } else {
  //   if (cls.prototype && cls.prototype.isPrototypeOf('OwnnetWrapperClass')) {
  //     throw new Error(`Bad service: Cannot wrap an already wrapped service (path '${path}')`);
  //   }
  // }

  return app => {
    if (app === null || !(app && app.version)) {
      throw new Error(`Bad usage: OwnnetWrapper must be configured like: app.configure(OwnnetWrapper('mypath', serviceclass, options));`);
    }

   // Let's find the proper path this service was created on
    let remoteService = app.service(path);
    for(let i in app.services) {
      if (app.services[i] === remoteService) {
        path = i;
        break;
      }
    };

    // First we will make this wrapped service a proper FeathersJS service
    // const serviceObject = hooks.enableHooks(new OwnnetWrapperClass(options), ['all'], ['before','after','error']);
    // const Service = Proto.isPrototypeOf(serviceObject) ? serviceObject : Proto.extend(serviceObject);

    // Now we patch the service class to the wrapped one
    app.services[path] = Service;
    app.services[path].remoteService = remoteService;

    return Service;
  }

}

function init (options) {
  return new OwnnetClass(options);
}

let Ownnet = init;

function ownnetWrapper (app, path, options = {}) {
  debug(`OwnnetWrapper started on path '${path}'`)
  if (!(app && app.version && app.service && app.services)) {
    throw new errors.Unavailable(`The FeathersJS app must be supplied as first argument`);
  }

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
