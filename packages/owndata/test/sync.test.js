'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const io = require('socket.io-client');
const socket = io('http://localhost:8888');
const socketio = require('@feathersjs/socketio-client');
const memory = require('feathers-memory');
const server = require('./server');
const OwndataWrapper = require('../src');


let verbose = false;
let app;
let service;
let ix = 0;

function newServicePath() {
  return '/tmp' /* + ix++ */;
}

function services1(path) {
  fromServiceNonPaginatedConfig(path);
}

function services2(path) {
  app.configure(OwndataWrapper(path, memory, { multi: true }));
  return app.service(path);
}

function fromServiceNonPaginatedConfig(path) {
  app.configure(OwndataWrapper(path, memory, { multi: true }));
  return app.service(path);
}


describe('Owndata-test - sync', () => {
  let remote;
  let clientSyncResult = [];
  let remoteSyncResult = [];

  beforeEach(async () => {
    let path = '/tmp';
    let rApp = server(path);
    rApp.listen(8888);
    remote = rApp.service(path);
    await remote.create([ { id: 98, order: 98 }, { id: 100, order: 100 } ]);

    app = feathers();
    app.configure(socketio(socket));
    app.configure(OwndataWrapper(path, memory, { clearStorage: true }));
    service = app.service(path);
    setUpHooks('CLIENT', path, true);
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
      .then(() => {
        let flag = null;
        try {
          service.sync();
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
        console.log(`Second test: serverData = ${JSON.stringify(remoteSyncResult)}`);
        console.log(`Second test: clientData = ${JSON.stringify(clientSyncResult)}`);
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
function setUpHooks(type, service, allowFail = false) {
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
            throw new errors.BadRequest('Fail requested by user request - simulated timout/missing connection');
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
