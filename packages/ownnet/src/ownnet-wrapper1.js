import { stripSlashes } from '@feathersjs/commons';
import errors from '@feathersjs/errors';
import { to } from '@feathersjs-offline/common';
import { Owndata } from '../../owndata/src';

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
    debug(`processQueuedEvents (${this.type}) entered (IPallowed=${this.internalProcessingAllowed()}, pQActive=${this.pQActive})`);
    if(!this.internalProcessingAllowed() || this.pQActive) {
      // console.log(`processingQueuedEvents: internalProcessing (aIP=${this.aIP}), pQActive=${this.pQActive}`);
      return false;
    }
    this.pQActive = true;

    let [err, store] = await to(this.localQueue.getEntries({query:{$sort: {uuid: 1, updatedAt: 1}}}));
    if (!(store && store !== {})) {
      return;
    }

    console.log(`store = ${JSON.stringify(store)}\nstore.length = ${store.length}`);

    this.removeListeners();

    debug(`  store = ${JSON.stringify(store)}`);
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
            this.addListeners();
            this.pQActive = false;
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
        else {
          if (event == 'create') {
            arg = el;
            arg1 = {};
          } else if (event === 'remove') {
            arg = el[this.id];
            arg1 = {};
          } else {
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
        // i++;
      } while (!stop);

console.log(`netOps.length=${netOps.length}, stop=${stop}, store.length=${store.length}`);
      // Now, send all necessary updates to the server
      stop = false;
      let result = await Promise.all(netOps.map(async op => {
console.log(`>>> op = ${JSON.stringify(op)}`);
        let {event, el, arg, arg1, ids, ev} = op;
        let mdebug = `  remoteService['${event}'](${JSON.stringify(arg)}, ${JSON.stringify(arg1)})`;
console.log(`>>> ${mdebug}`);
        return await self.remoteService[event](arg, arg1)
          .then(async res => {
            console.log(`res=${JSON.stringify(res)}`);
            return await self.localQueue.remove(null, {query: {id: {$in: ids}}})
              .then(async qres => {
                console.log(`qres=${JSON.stringify(qres)}`);
                if (event !== 'remove') {
                  return await self.localService.patch(res[self.id], res)
                   .catch(err => {
                    console.log(`err=${err.name}, ${err.message}`);
                    debug(mdebug);
                      debug(`  localService.patch(${JSON.stringify(res[self.id])}, ${JSON.stringify(res)})`);
                      debug(`  ev = ${JSON.stringify(ev)}`);
                      return false})
                }
                else
                  return true;
              })
              .catch(err => {
                console.log(`err2=${err.name}, ${err.message}`);
                return false}
              );
          })
          .catch(err => {
            console.log(`err3=${err.name}, ${err.message}`);
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
console.log(`result=${JSON.stringify(result)}`);
      let r = result;
   }

    this.addListeners();
    this.pQActive = false;

    return stop;
  }

};


function init (options) {
  return new OwnnetClass(options);
}

let Ownnet = init;

function ownnetWrapper (app, path, options = {}) {
  debug(`OwnnetWrapper started on path '${path}'`)
  if (!(app && app['version'] && app['service'] && app['services']) )
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
