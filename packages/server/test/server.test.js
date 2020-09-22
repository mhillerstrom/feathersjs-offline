'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const memory = require('feathers-memory');
const RealtimeServiceWrapper = require('../lib/server');

let app;
let service;

describe('RealtimeServerWrapper', () => {
  // Let's perform all the usual adapter tests to verify full functionality
  app = feathers();
  const RealtimeService = RealtimeServiceWrapper(memory);

  beforeEach(() => {
    app.use('people', new RealtimeService({ multi: true }, app));
    service = app.service('people');
  });


  it('.create adds missing uuid, updatedAt, and onServerAt', () => {
    return service.create({ id: 99, order: 99 })
      .then(data => {
        // console.log(`First test: data = ${JSON.stringify(data)}`);
        expect(typeof data.uuid).to.equal('string', 'uuid was added');
        expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
        expect(typeof data.onServerAt).to.equal('string', 'onServerAt was added');
      })
  });

  describe('.sync', () => {
    it('.sync all', () => {
      const sampleLen = 5;
      const data = [];
      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i, updatedAt: new Date(i).toISOString(), onServerAt: new Date(i).toISOString() });
      }
      return service.create(data)
        .then(delay())
        .then(cdata => {
          expect(cdata.length).to.equal(data.length, `${sampleLen} rows inserted`);
          for (let i = 0; i < sampleLen; i += 1) {
            expect(cdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
            expect(cdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
            expect(cdata[i].order).to.equal(data[i].order, `order is ok (i=${i})`);
            expect(cdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
            expect(cdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
          }
        })
        .then(() => service.sync())
        .then(delay())
        .then(sdata => {
          expect(sdata.length).to.equal(data.length, `${sampleLen} rows synced`);
          for (let i = 0; i < sampleLen; i += 1) {
            expect(sdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
            expect(sdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
            expect(sdata[i].order).to.equal(data[i].order, `order is ok (i=${i})`);
            expect(sdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
            expect(sdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
          }
        })
    });


    it('.sync all + query', () => {
      const sampleLen = 5;
      const data = [];
      let onServerAt = 0;
      let pOnServerAt = 0;
      let serverData = [];

      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i, updatedAt: new Date(i).toISOString(), onServerAt: new Date(i).toISOString() });
      }
      return service.create(data)
        .then(delay())
        .then(cdata => {
          expect(cdata.length).to.equal(data.length, `${sampleLen} rows inserted`);
          for (let i = 0; i < sampleLen; i += 1) {
            expect(cdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
            expect(cdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
            expect(cdata[i].order).to.equal(data[i].order, `order is ok (i=${i})`);
            expect(cdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
            expect(cdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
          }
          serverData = cdata;
          onServerAt = cdata[4].onServerAt;
        })
        .then(delay())
        .then(() => service.patch(4, { order: 44 }))
        .then(delay())
        .then(pdata => {
          expect(pdata.id).to.equal(serverData[4].id, 'id is ok');
          expect(pdata.uuid).to.equal(serverData[4].uuid, 'uuid is ok');
          expect(pdata.order).to.equal(44, 'order updated');
          expect(pdata.updatedAt).to.equal(serverData[4].updatedAt, 'updatedAt is ok');
          expect(pdata.onServerAt).to.not.equal(serverData[4].onServerAt, 'onServerAt is updated');
          pOnServerAt = pdata.onServerAt
        })
        .then(delay())
        .then(() => service.sync({ query: { order: 44 } }))
        .then(sdata => {
          expect(sdata.length).to.equal(1, '1 row synced');
          expect(sdata[0].id).to.equal(serverData[4].id, 'id is ok');
          expect(sdata[0].uuid).to.equal(serverData[4].uuid, 'uuid is ok');
          expect(sdata[0].order).to.equal(44, 'order is ok');
          expect(sdata[0].updatedAt).to.equal(serverData[4].updatedAt, 'updatedAt is ok');
          expect(sdata[0].onServerAt).to.equal(pOnServerAt, 'onServerAt is ok');
        })
    });


    it('.sync + query', () => {
      const sampleLen = 5;
      const data = [];
      let onServerAt = 0;
      let pOnServerAt = 0;
      let serverData = [];

      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i, updatedAt: new Date(i).toISOString(), onServerAt: new Date(i).toISOString() });
      }
      return service.create(data)
        .then(delay())
        .then(cdata => {
          expect(cdata.length).to.equal(data.length, `${sampleLen} rows inserted`);
          for (let i = 0; i < sampleLen; i += 1) {
            expect(cdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
            expect(cdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
            expect(cdata[i].order).to.equal(data[i].order, `order is ok (i=${i})`);
            expect(cdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
            expect(cdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
          }
          serverData = cdata;
          onServerAt = cdata[4].onServerAt;
        })
        .then(delay())
        .then(() => service.patch(4, { order: 44 }))
        .then(delay())
        .then(pdata => {
          expect(pdata.id).to.equal(serverData[4].id, 'id is ok');
          expect(pdata.uuid).to.equal(serverData[4].uuid, 'uuid is ok');
          expect(pdata.order).to.equal(44, 'order updated');
          expect(pdata.updatedAt).to.equal(serverData[4].updatedAt, 'updatedAt is ok');
          expect(pdata.onServerAt).to.not.equal(serverData[4].onServerAt, 'onServerAt is updated');
          pOnServerAt = pdata.onServerAt
        })
        .then(delay())
        .then(() => service.sync({ query: { syncMin: 0, syncMax: new Date(onServerAt).getTime() } }))
        .then(sdata => {
          expect(sdata.length).to.equal(1, '1 row synced');
          expect(sdata[0].id).to.equal(serverData[4].id, 'id is ok');
          expect(sdata[0].uuid).to.equal(serverData[4].uuid, 'uuid is ok');
          expect(sdata[0].order).to.equal(44, 'order is ok');
          expect(sdata[0].updatedAt).to.equal(serverData[4].updatedAt, 'updatedAt is ok');
          expect(sdata[0].onServerAt).to.equal(pOnServerAt, 'onServerAt is ok');
        })
    });
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
