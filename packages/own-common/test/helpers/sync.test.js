'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const socketio = require('@feathersjs/socketio');
const socketioClient = require('@feathersjs/socketio-client');
const memory = require('feathers-memory');
const io = require('socket.io-client');
const delay = require('./delay');
const setUpHooks = require('./setup-hooks');
const { realtimeWrapper } = require('../../../server/src');

let app;
let service;

module.exports = (desc, _app, _errors, wrapperFn, serviceName, verbose, isBaseClass = false) => {
  const logAction = (type, action) => {
    return (msg, _ctx) => {
      console.log(`${type}: action=${action}, msg=${JSON.stringify(msg)}, _ctx.params=${JSON.stringify(_ctx.params)}, _ctx.query=${JSON.stringify(_ctx.query)}`);
    }
  }

  describe(`${desc}`, () => {
    let port = 9990;
    let socket;
    let remote;
    let rApp;
    let clientSyncResult = [];
    let remoteSyncResult = [];

    after(() => {
      console.log('\n');
    });

    beforeEach(async () => {
      // Define server
      port++;
      const url = `http://localhost:${port}`;
      socket = io(url);

      rApp = feathers()
        .configure(socketio())
        .use(serviceName, memory({ multi: true, id: 'id' }));
      realtimeWrapper(rApp, serviceName);
      remote = rApp.service(serviceName);
      setUpHooks('SERVER', serviceName, remote, true, verbose);

      // ['created', 'updated', 'patched', 'removed'].forEach(a => remote.on(a, logAction('SERVER', a)));

      // Start server
      const server = rApp.listen(port);

      // Let's wait for server being ready to serve...
      let ready = false;
      server.on('listening', async () => {
        // Fill some known data into server
        await remote.create([{ id: 96, order: 96 }, { id: 100, order: 100 }]);

        ready = true;
      });

      while (!ready) {
        await delay(10)(true);
      }

      // Define client
      app = feathers();
      app.configure(socketioClient(socket));
      app.use(serviceName, wrapperFn({id: 'id'}));
      service = app.service(serviceName);
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
        // Now, let's trigger synchronization (and test the method exists)
        .then(async () => {
          let flag = null;
          try {
            await service.sync(true);
            flag = true;
          } catch (err) {
            console.log(`isBaseClass=${isBaseClass}, err.name=${err.name}, err.mes=${err.message}`)
            flag = isBaseClass && err.name === 'NotImplemented';
          }
          expect(true).to.equal(flag, '.sync() is a method');
        })
        .then(delay())
        .then(() => remote.find({ query: { $sort: { id: 1 } } }))
        .then(delay())
        .then(remoteData => remoteSyncResult = remoteData)
        .then(() => service.find({ query: { $sort: { id: 1 } } }))
        .then(delay())
        .then(data => {
          clientSyncResult = data;
          if (!isBaseClass) {
            expect(remoteSyncResult.length).to.equal(clientSyncResult.length, 'Same number of documents');
          }
          else {
            console.log(`remoteSync.len=${remoteSyncResult.length}, remoteSync=${JSON.stringify(remoteSyncResult)}\nclientSync.len=${clientSyncResult.length}, clientSync=${JSON.stringify(clientSyncResult)}`)
            expect(remoteSyncResult.length).to.equal(clientSyncResult.length-1, 'Still missing one document from client');
          }
          for (let i = 0; i < remoteSyncResult.length; i++) {
            if (isBaseClass && clientSyncResult[i].id === 99) continue;
            expect(clientSyncResult[i].id).to.equal(remoteSyncResult[i].id, `id was updated (i=${i})`);
            expect(clientSyncResult[i].order).to.equal(remoteSyncResult[i].order, `order was updated (i=${i})`);
            expect(clientSyncResult[i].onServerAt).to.equal(remoteSyncResult[i].onServerAt, `onServerAt was updated (i=${i})`);
            // expect(clientSyncResult[i].onServerAt).to.satisfy((v) => {return v <= remoteSyncResult[i].onServerAt}, `onServerAt was set or kept (i=${i})`);
          }
        })
    });

    it('sync with more clients works', () => {
      let client2SyncResult = [];

      // Define 2nd client
      let app2 = feathers();
      app2.configure(socketioClient(socket));
      app2.use(serviceName, wrapperFn({id: 'id'}));
      const service2 = app2.service(serviceName);
      setUpHooks('SERVER2', serviceName, service2.remote, true, verbose);
      setUpHooks('SERVICE2', serviceName, service2, false, verbose);

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
        .then(() => service2.create({ id: 98, order: 98 }, { query: { _fail: true } }))
        .then(data => {
          expect(typeof data.uuid).to.equal('string', 'uuid was added');
          expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
          expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
        })
        .then(delay())
        .then(() => service2.find())
        .then(res => {
          expect(res.length).to.equal(1, '1 row created locally');
        })
        .then(() => remote.find())
        .then(res => {
          expect(res.length).to.equal(2, '2 rows on remote');
        })
        // Now, let's trigger synchronization (and test the method exists)
        .then(async () => {
          let flag = null;
          try {
            await service.sync(true);
            flag = true;
          } catch (err) {
            console.log(`isBaseClass=${isBaseClass}, err.name=${err.name}, err.mes=${err.message}`)
            flag = isBaseClass && err.name === 'NotImplemented';
          }
          expect(true).to.equal(flag, '.sync() is a method');
        })
        .then(async () => {
          let flag = null;
          try {
            await service2.sync(true);
            flag = true;
          } catch (err) {
            console.log(`isBaseClass=${isBaseClass}, err.name=${err.name}, err.mes=${err.message}`)
            flag = isBaseClass && err.name === 'NotImplemented';
          }
          expect(true).to.equal(flag, '.sync() is a method');
        })
        // As sync of service2 might have contributed to changes, we need to sync service again to
        .then(async () => {
          let flag = null;
          try {
            await service.sync(true);
            flag = true;
          } catch (err) {
            console.log(`isBaseClass=${isBaseClass}, err.name=${err.name}, err.mes=${err.message}`)
            flag = isBaseClass && err.name === 'NotImplemented';
          }
          expect(true).to.equal(flag, '.sync() is a method');
        })
        .then(delay())
        .then(() => remote.find({ query: { $sort: { id: 1 } } }))
        .then(delay())
        .then(remoteData => remoteSyncResult = remoteData)
        .then(() => service.find({ query: { $sort: { id: 1 } } }))
        .then(delay())
        .then(data => {
          clientSyncResult = data;
          if (!isBaseClass) {
            expect(remoteSyncResult.length).to.equal(clientSyncResult.length, 'client has ame number of documents');
          }
          else {
            expect(remoteSyncResult.length).to.equal(clientSyncResult.length-1, 'client still missing one document from client');
          }
          for (let i = 0; i < remoteSyncResult.length; i++) {
            if (isBaseClass && clientSyncResult[i].id === 99) continue;
            expect(clientSyncResult[i].id).to.equal(remoteSyncResult[i].id, `client id was updated (i=${i})`);
            expect(clientSyncResult[i].order).to.equal(remoteSyncResult[i].order, `client order was updated (i=${i})`);
            expect(clientSyncResult[i].onServerAt).to.equal(remoteSyncResult[i].onServerAt, `client onServerAt was updated (i=${i})`);
            // expect(clientSyncResult[i].onServerAt).to.satisfy((v) => {return v <= remoteSyncResult[i].onServerAt}, `onServerAt was set or kept (i=${i})`);
          }
        })
        .then(() => service2.find({ query: { $sort: { id: 1 } } }))
        .then(delay())
        .then(data => {
          client2SyncResult = data;
          if (!isBaseClass) {
            expect(remoteSyncResult.length).to.equal(client2SyncResult.length, 'client2 has same number of documents');
          }
          else {
            // BaseClass does not do any handling of queued events...
            expect(remoteSyncResult.length).to.equal(client2SyncResult.length, 'client2 still missing one document from client');
          }
          for (let i = 0; i < remoteSyncResult.length; i++) {
            if (isBaseClass && client2SyncResult[i].id === 98) continue;
            expect(client2SyncResult[i].id).to.equal(remoteSyncResult[i].id, `client2 id was updated (i=${i})`);
            expect(client2SyncResult[i].order).to.equal(remoteSyncResult[i].order, `client2 order was updated (i=${i})`);
            expect(client2SyncResult[i].onServerAt).to.equal(remoteSyncResult[i].onServerAt, `client2 onServerAt was updated (i=${i})`);
            // expect(client2SyncResult[i].onServerAt).to.satisfy((v) => {return v <= remoteSyncResult[i].onServerAt}, `onServerAt was set or kept (i=${i})`);
          }
        })
        // Now let both clients patch the same row (known on all instances)
        .then(() => service.patch(96, {order: 196}))
        .then(delay())
        .then(() => service2.find({query: {$sort: { id: 1}}}))
        .then(res => console.log(`service2 items: ${JSON.stringify(res)}`))
        .then(() => service2.patch(96, {order: 296}, {query: {_fail: true}}))
        // .then(() => service2.patch(96, {order: 296}))
        .then(() => console.log('After service2...'))
        .then(delay())
        .then(async () => {
          try {
            await service.sync();
          } catch (err) {
            expect(true).to.equal(isBaseClass && err.name === 'NotImplemented', '.sync() is a method');
          }
          try {
            await service2.sync();
          } catch (err) {
            expect(true).to.equal(isBaseClass && err.name === 'NotImplemented', '.sync() is a method');
          }
          try {
            await service.sync();
          } catch (err) {
            expect(true).to.equal(isBaseClass && err.name === 'NotImplemented', '.sync() is a method');
          }
        })
        .then(() => remote.find({ query: { $sort: { id:1 } }}))
        .then(res => {
          remoteSyncResult = res;
        })
        .then(() => service.find({ query: { $sort: { id:1 } }}))
        .then(res => {
          clientSyncResult = res;
        })
        .then(() => service2.find({ query: { $sort: { id:1 } }}))
        .then(res => {
          client2SyncResult = res;
        })
        .then(() => {
          if (!isBaseClass) {
            expect(remoteSyncResult.length).to.equal(clientSyncResult.length, 'Same number of documents');
            expect(remoteSyncResult.length).to.equal(client2SyncResult.length, 'Same number of documents');
          }
          else {
            expect(remoteSyncResult.length).to.equal(clientSyncResult.length-1, 'Still missing one document from client');
            expect(client2SyncResult.length).to.equal(clientSyncResult.length-1, 'client2 still missing one document from client');
          }
          for (let i = 0; i < remoteSyncResult.length; i++) {
            if (isBaseClass && (clientSyncResult[i].id === 99 || client2SyncResult[i].id === 98)) continue;
            expect(client2SyncResult[i].id).to.equal(remoteSyncResult[i].id, `id was updated (i=${i})`);
            expect(client2SyncResult[i].order).to.equal(remoteSyncResult[i].order, `order was updated (i=${i})`);
            expect(client2SyncResult[i].onServerAt).to.equal(remoteSyncResult[i].onServerAt, `onServerAt was updated (i=${i})`);
            // expect(client2SyncResult[i].onServerAt).to.satisfy((v) => {return v <= remoteSyncResult[i].onServerAt}, `onServerAt was set or kept (i=${i})`);
          }
          expect(clientSyncResult[0].id).to.equal(96, `We got item 96 in the right place`);
          expect(clientSyncResult[0].order).to.equal(296, `order was updated in all instances`);
        })
    });
  });

}
