'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const socketio = require('@feathersjs/socketio');
const memory = require('feathers-memory');
const io = require('socket.io-client');
const socketioClient = require('@feathersjs/socketio-client');
const RealtimeServiceWrapper = require('@feathersjs-offline/server');
const { Owndata, owndataWrapper } = require('../src');

const RealtimeService = RealtimeServiceWrapper(memory);
const port = 8888;
const url = `http://localhost:${port}`;
const socket = io(url);

let verbose = false;
let app;
let service;
let ix = 0;

const logAction = (type, action) => {
  return (msg, _ctx) => {
    console.log(`${type}: action=${action}, msg=${JSON.stringify(msg)}, _ctx.params=${JSON.stringify(_ctx.params)}, _ctx.query=${JSON.stringify(_ctx.query)}`);
  }
}

describe('Owndata-test - sync', () => {
  let remote;
  let rApp;
  let clientSyncResult = [];
  let remoteSyncResult = [];

  beforeEach(async () => {
    let path = '/tmp';

    // Define server
    rApp = feathers()
    .configure(socketio())
    .use(path, RealtimeService({multi: true}));
    setUpHooks(rApp, 'SERVER', path, true);
    remote = rApp.service(path);

    // ['created', 'updated', 'patched', 'removed'].forEach(a => remote.on(a, logAction('SERVER', a)));

    // Start server
    const server = rApp.listen(port);

    // Let's wait for server is ready to serve...
    let ready = false;
    server.on('listening', async () => {
      // Fill some known data into server
      await remote.create([ { id: 98, order: 98 }, { id: 100, order: 100 } ]);

      ready = true;
    });

    while (!ready) {
      await delay(10)(true);
    }

    // Define client
    app = feathers();
    app.configure(socketioClient(socket));
    app.use(path, Owndata({ clearStorage: true }));
    service = app.service(path);
    // ['created', 'updated', 'patched', 'removed'].forEach(a => service.on(a, logAction('CLIENT', a)));
    // ['created', 'updated', 'patched', 'removed'].forEach(a => service.local.on(a, logAction('LOCAL', a)));
    // ['created', 'updated', 'patched', 'removed'].forEach(a => service.queue.on(a, logAction('QUEUE', a)));
  });

  it('sync works', () => {
    return service.create({ id: 99, order: 99 }, { query: { _fail: true } })
      .then(data => {
        expect(typeof data.uuid).to.equal('string', 'uuid was added');
        expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
        expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
      })
      .then(delay())
      .then(() => service.find())
      .then(res => {
        expect(res.length).to.equal(1, '1 row created locally');
      })
      .then(() => remote.find())
      .then(res => {
        expect(res.length).to.equal(2, '2 rows on remote');
      })
      .then(async () => {
        let flag = null;
        try {
          await service.sync();
          flag = true;
        } catch (err) {
          flag = false;
        }
        expect(true).to.equal(flag, '.sync() is a method');
      })
      .then(delay())
      .then(() => remote.find({ query: { $sort: {id: 1} } }))
      .then(delay())
      .then(data => remoteSyncResult = data)
      .then(() => service.find({ query: { $sort: {id: 1} } }))
      .then(delay())
      .then(data => {
        clientSyncResult = data;
        expect(remoteSyncResult.length).to.equal(clientSyncResult.length, 'Same number of documents');
        for (let i = 0; i < remoteSyncResult.length; i++) {
          expect(clientSyncResult[i].id).to.equal(remoteSyncResult[i].id, 'id was updated (i=${i})');
          expect(clientSyncResult[i].order).to.equal(remoteSyncResult[i].order, 'order was updated (i=${i})');
          expect(clientSyncResult[i].onServerAt).to.equal(remoteSyncResult[i].onServerAt, 'onServerAt was updated (i=${i})');
        }
      })
  });
});

// Helpers

function delay (ms = 0) {
  return data => new Promise(resolve => {
    setTimeout(() => {
      resolve(data);
    }, ms);
  });
}

/**
 * This sets up a before an error hook for all functions for a given service. The hook
 * can simulate e.g. backend failure, network connection troubles, or timeout by supplying
 * ```{query: {_fail:true}}``` to the call options.
 * If `_fail` is false or the query is not supplied all this hook is bypassed.
 *
 * @param {object} app The application handle
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {boolean} allowFail Will we allow the usage of _fail and _timeout? (Default false)
 */
function setUpHooks (app, type, service, allowFail = false) {
  if (verbose) console.log(`setUpHooks called: type=${type}, service=${service}, allowFail=${allowFail}`)
  app.service(service).hooks({
    before: {
      all: async context => {
        if (verbose) {
          const data = context.data ? `\n\tdata\t${JSON.stringify(context.data)}` : '';
          const params = context.params ? `\n\tparams\t${JSON.stringify(context.params)}` : '';
          console.log(`Before.all.hook ${type}.${context.method} called${data}${params}\n\tallowFail = ${allowFail}`);
        }
        if (allowFail && context.params.query) {
          if (context.params.query._fail) { // Passing in param _fail simulates errors
            throw new errors.Timeout('Fail requested by user request - simulated timeout/missing connection');
          }
          else {
            // _fail was supplied but not true - remove it before continuing
            delete context.params.query._fail;
            return context;
          }
        }
      }

    },
    error: {
      all: context => {
        if (verbose) {
          console.error(`Error.all.hook ${type}.${context.method} ERROR ${JSON.stringify(context.error)}`);
        }
      }
    }
  });
}
