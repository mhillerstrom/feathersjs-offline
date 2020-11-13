'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const socketio = require('@feathersjs/socketio');
const socketioClient = require('@feathersjs/socketio-client');
const memory = require('feathers-memory');
const io = require('socket.io-client');
const delay = require('./delay');
const setUpHooks = require('./setup-hooks');
const RealtimeServiceWrapper = require('@feathersjs-offline/server');

const RealtimeService = RealtimeServiceWrapper(memory);
const port = 8888;
const url = `http://localhost:${port}`;
const socket = io(url);

let verbose = false;
let app;
let service;

module.exports = (desc, _app, _errors, wrapperFn, serviceName, verbose) => {
  const logAction = (type, action) => {
    return (msg, _ctx) => {
      console.log(`${type}: action=${action}, msg=${JSON.stringify(msg)}, _ctx.params=${JSON.stringify(_ctx.params)}, _ctx.query=${JSON.stringify(_ctx.query)}`);
    }
  }

  describe(`${desc}`, () => {
    let remote;
    let rApp;
    let clientSyncResult = [];
    let remoteSyncResult = [];

    beforeEach(async () => {
      let path = '/tmp';

      // Define server
      rApp = feathers()
        .configure(socketio())
        .use(path, RealtimeService({ multi: true }));
      remote = rApp.service(path);
      setUpHooks('SERVER', path, remote, true, verbose);

      // ['created', 'updated', 'patched', 'removed'].forEach(a => remote.on(a, logAction('SERVER', a)));

      // Start server
      const server = rApp.listen(port);

      // Let's wait for server is ready to serve...
      let ready = false;
      server.on('listening', async () => {
        // Fill some known data into server
        await remote.create([{ id: 98, order: 98 }, { id: 100, order: 100 }]);

        ready = true;
      });

      while (!ready) {
        await delay(10)(true);
      }

      // Define client
      app = feathers();
      app.configure(socketioClient(socket));
      app.use(path, wrapperFn());
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
        .then(() => remote.find({ query: { $sort: { id: 1 } } }))
        .then(delay())
        .then(data => remoteSyncResult = data)
        .then(() => service.find({ query: { $sort: { id: 1 } } }))
        .then(delay())
        .then(data => {
          clientSyncResult = data;
          expect(remoteSyncResult.length).to.equal(clientSyncResult.length, 'Same number of documents');
          for (let i = 0; i < remoteSyncResult.length; i++) {
            expect(clientSyncResult[i].id).to.equal(remoteSyncResult[i].id, `id was updated (i=${i})`);
            expect(clientSyncResult[i].order).to.equal(remoteSyncResult[i].order, `order was updated (i=${i})`);
            expect(clientSyncResult[i].onServerAt).to.equal(remoteSyncResult[i].onServerAt, `onServerAt was updated (i=${i})`);
          }
        })
    });
  });

}
