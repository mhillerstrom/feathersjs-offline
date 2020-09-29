'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const io = require('socket.io-client');
const socket = io('http://localhost:8888');
const socketioClient = require('@feathersjs/socketio-client');
const memory = require('feathers-memory');
const { Ownnet } = require('../lib');
const socketio = require('@feathersjs/socketio');
const RealtimeServiceWrapper = require('@feathersjs-offline/server');

const RealtimeService = RealtimeServiceWrapper(memory);

let verbose = false;
let app;
let service;


function setupServer(path) {
  const app = feathers()
    .configure(socketio())
    .use(path, new RealtimeService({ multi: true }))

  const actions = ['created', 'updated', 'patched', 'removed'];
  const service = app.service(path);

  const logActions = (actions, service) => {
    actions.forEach(action => service.on(action, (msg, _ctx) => {
      console.log(`action=${action}, msg=${JSON.stringify(msg)}, _ctx.params=${JSON.stringify(_ctx.params)}, _ctx.query=${JSON.stringify(_ctx.query)}`);
    }))
  };

  // logActions(actions, service);

  return app;
}


describe('Ownnet-test - sync', () => {
  let remote;
  let rApp;
  let path;
  let clientSyncResult = [];
  let remoteSyncResult = [];

  beforeEach(() => {
    // Define server - but wait to start it
    path = '/tmp';
    rApp = setupServer(path);
    setUpHooks(rApp, 'SERVER', path, true);

    // Define the client with Ownnet as AdapterService
    app = feathers();
    app.configure(socketioClient(socket));
    app.use(path, Ownnet({ clearStorage: true }));

    service = app.service(path);
  });


  it('sync works', () => {
    return service.create({ id: 99, order: 99 }, {query:{_fail: true}})
      .then(data => {
        expect(typeof data.uuid).to.equal('string', 'uuid was added');
        expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
        expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
      })
      .then(() => service.find())
      .then(res => {
        expect(res.length).to.equal(1, '1 row created locally');
      })
      .then(async () => {
        // Now we start the server
        let server = rApp.listen(8888);
        let running = false;
        server.on('listening', () => {
          // Create some data on server
          remote = rApp.service(path);
          remote.create([ { id: 98, order: 98 }, { id: 100, order: 100 } ])
          running = true;
        });
        while (!running) {
          await delay(50)();
        }
      })
      .then(delay())
      .then(() => {
        let flag = null;
        try {
          service.sync(); // Force start of sync process - and test it exists
          flag = true;
        } catch (err) {
          flag = false;
        }
        expect(flag).to.equal(true, '.sync() is a method');
      })
      .then(delay(1500)) // Allow sync() to settle
      .then(() => remote.find({ query: { $sort: {id: 1} } }))
      .then(delay())
      .then(data => remoteSyncResult = data)
      .then(() => service.find({ query: { $sort: {id: 1} } }))
      .then(delay())
      .then(data => {clientSyncResult = data;})
      .then(() => {
        expect(remoteSyncResult.length).to.equal(clientSyncResult.length, 'Same number of documents');
        for (let i = 0; i < remoteSyncResult.length; i++) {
          expect(clientSyncResult[i].id).to.equal(remoteSyncResult[i].id, 'id ok (i=${i})');
          expect(clientSyncResult[i].order).to.equal(remoteSyncResult[i].order, 'order ok (i=${i})');
          expect(clientSyncResult[i].uuid).to.equal(remoteSyncResult[i].uuid, 'uuid ok (i=${i})');
          expect(clientSyncResult[i].onServerAt).to.equal(remoteSyncResult[i].onServerAt, 'onServerAt was updated (i=${i})');
        }
      })
  });
});

// Helpers

function delay(ms = 0) {
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
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {boolean} allowFail Will we allow the usage of _fail and _timeout? (Default false)
 */
function setUpHooks(app, type, service, allowFail = false) {
  console.log(`setUpHooks called: type=${type}, service=${service}, allowFail=${allowFail}`)
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
      },

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
