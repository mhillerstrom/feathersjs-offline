'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const RealtimeServiceWrapper = require('../src/server');
const memory = require('feathers-memory');

let app;
let service;

describe('RealtimeServerWrapper', () => {

  describe('configuration tests', () => {
    it('missing adapter class throws error', () => {
      app = feathers();
      try {
        const RealtimeService = RealtimeServiceWrapper();
      } catch (err) {
        expect(err.name).to.equal('Unavailable', 'Missing adapter class throws Unavailable');
      }
    })
  });

  describe('real-life tests', () => {
    // Let's perform all the usual adapter tests to verify full functionality
    app = feathers();
    const RealtimeService = RealtimeServiceWrapper(memory);

    beforeEach(() => {
      app.use('people', RealtimeService({ multi: true }, app));
      service = app.service('people');
    });

    it('.create adds missing uuid, updatedAt, onServerAt, and deletedAt', () => {
      return service.create({ id: 99, order: 99 })
        .then(data => {
          expect(typeof data.uuid).to.equal('string', 'uuid was added');
          expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
          expect(typeof data.onServerAt).to.equal('string', 'onServerAt was added');
          expect(data.deletedAt).to.equal(undefined, 'deletedAt was wrongly added');
        })
    });

    describe('Special functionality', () => {
      const sampleLen = 5;
      const data = [];
      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i, updatedAt: new Date(i).toISOString(), onServerAt: new Date(i).toISOString() });
      }
      const deleted = [];
      for (let i = sampleLen, len = 2 * sampleLen; i < len; i += 1) {
        deleted.push({ id: i, uuid: 1000 + i, order: i, updatedAt: new Date(i).toISOString(), onServerAt: new Date(i).toISOString() });
      }

      var cdata = [];
      var ddata = [];
      var onServerAt;

      beforeEach(async () => {
        cdata = await service.create(data);
        await delay(10)();
        let tmp = await service.create(deleted);
        while (tmp.length) {
          let row = tmp.shift();
          ddata.push(await service.remove(row.id));
        }
        onServerAt = ddata[0].onServerAt;
      })

      afterEach(async () => {
        await service.remove(null, { query: { uuid: { $gt: '' }, offline: { _forceAll: true } } });
        cdata = [];
        ddata = [];
      })

      it('all rows are created', () => {
        return delay()()
          .then(() => {
            expect(cdata.length).to.equal(data.length, `${sampleLen} rows inserted`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(cdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
              expect(cdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
              expect(cdata[i].order).to.equal(data[i].order, `order is ok (i=${i})`);
              expect(cdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(cdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(cdata[i].deletedAt).to.equal(data[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
          .then(() => {
            expect(ddata.length).to.equal(deleted.length, `${sampleLen} rows deleted`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(ddata[i].id).to.equal(deleted[i].id, `id is ok (i=${i})`);
              expect(ddata[i].uuid).to.equal(deleted[i].uuid, `uuid is ok (i=${i})`);
              expect(ddata[i].order).to.equal(deleted[i].order, `order is ok (i=${i})`);
              expect(ddata[i].updatedAt).to.equal(deleted[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(ddata[i].onServerAt).to.not.equal(deleted[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(ddata[i].deletedAt).to.not.equal(deleted[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      })

      it('.find + _forceAll: false', () => {
        // Test to verify it is only the '_forceAll' key we are relying on - not its value
        return service.find({ query: { offline: { _forceAll: false } } })
          .then(delay())
          .then(sdata => {
            expect(sdata.length).to.equal(data.length + deleted.length, `${2 * sampleLen} rows found`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(data[i].order, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.equal(data[i].deletedAt, `deletedAt is not updated (i=${i})`);
            }
            for (let i = sampleLen; i < 2 * sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(deleted[i - sampleLen].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(deleted[i - sampleLen].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(deleted[i - sampleLen].order, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(deleted[i - sampleLen].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(deleted[i - sampleLen].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.not.equal(undefined, `deletedAt is not undefined (i=${i})`);
            }
          })
      });

      it('.find + _forceAll: true', () => {
        // Test to verify it is only the '_forceAll' key we are relying on - not its value
        return service.find({ query: { offline: { _forceAll: true } } })
          .then(delay())
          .then(sdata => {
            expect(sdata.length).to.equal(data.length + deleted.length, `${2 * sampleLen} rows found`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(data[i].order, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.equal(data[i].deletedAt, `deletedAt is not updated (i=${i})`);
            }
            for (let i = sampleLen; i < 2 * sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(deleted[i - sampleLen].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(deleted[i - sampleLen].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(deleted[i - sampleLen].order, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(deleted[i - sampleLen].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(deleted[i - sampleLen].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.not.equal(undefined, `deletedAt is not undefined (i=${i})`);
            }
          })
      });

      it('.find + _forceAll: true + onServerAt string', () => {
        return service.find({ query: { offline: { _forceAll: true, onServerAt } } })
          .then(delay())
          .then(sdata => {
            expect(sdata.length).to.equal(deleted.length, `${sampleLen} rows found`);
            for (let i = 0; i < sampleLen - 1; i += 1) {
              expect(sdata[i].id).to.equal(deleted[i].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(deleted[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(deleted[i].order, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(deleted[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(deleted[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.find + _forceAll: true + onServerAt date', () => {
        onServerAt = new Date(onServerAt);
        return service.find({ query: { offline: { _forceAll: true, onServerAt } } })
          .then(delay())
          .then(sdata => {
            expect(sdata.length).to.equal(deleted.length, `${sampleLen} rows found`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(deleted[i].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(deleted[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(deleted[i].order, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(deleted[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(deleted[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(cdata[i].deletedAt).to.equal(deleted[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.update + _forceAll: true (onServerAt > updatedAt)', () => {
        onServerAt = new Date(onServerAt);
        let upd = Object.assign({}, ddata[0], {order: 90});
        return service.update(5, upd, { query: { offline: { _forceAll: true} } })
          .then(delay())
          .then(sdata => {
            // We keep existing data, as onServerAt in DB is newer than updatedAt
            expect(typeof sdata).to.equal('object', `1 row updated`);
            for (let i = 0; i < 1; i += 1) {
              expect(sdata.id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata.uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata.order).to.equal(ddata[i].order, `order is ok (i=${i})`);
              expect(sdata.updatedAt).to.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata.onServerAt).to.equal(ddata[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata.deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.update + _forceAll: true', () => {
        onServerAt = new Date(onServerAt);
        let upd = Object.assign({}, ddata[0], {order: 91, updatedAt: new Date()});
        return service.update(5, upd, { query: { offline: { _forceAll: true} } })
          .then(delay())
          .then(sdata => {
            // We update data, as onServerAt in DB is older than updatedAt
            expect(typeof sdata).to.equal('object', `1 row updated`);
            for (let i = 0; i < 1; i += 1) {
              expect(sdata.id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata.uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata.order).to.equal(91, `order is ok (i=${i})`);
              expect(sdata.updatedAt).to.not.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata.onServerAt).to.not.equal(ddata[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata.deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.update + _forceAll: true + params', () => {
        onServerAt = new Date(ddata[0].onServerAt);
        let newData = Object.assign({}, ddata[0], {order: 92, updatedAt: new Date()});
        return service.update(5, newData, { query: { offline: { _forceAll: true}, uuid: 1005 } })
          .then(delay())
          .then(sdata => {
            // We update data, as onServerAt in DB is older than updatedAt
            expect(typeof sdata).to.equal('object', `1 row updated`);
            for (let i = 0; i < 1; i += 1) {
              expect(sdata.id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata.uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata.order).to.equal(92, `order is ok (i=${i})`);
              expect(sdata.updatedAt).to.not.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata.onServerAt).to.not.equal(ddata[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata.deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.update + _forceAll: true + onServerAt', () => {
        onServerAt = new Date(onServerAt);
        let upd = Object.assign({}, ddata[0], {order: 93, updatedAt: new Date()});
        return service.update(5, upd, { query: { offline: { _forceAll: true, onServerAt} } })
          .then(delay())
          .then(sdata => {
            // We update data, as onServerAt in DB is older than updatedAt
            expect(typeof sdata).to.equal('object', `1 row updated`);
            for (let i = 0; i < 1; i += 1) {
              expect(sdata.id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata.uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata.order).to.equal(93, `order is ok (i=${i})`);
              expect(sdata.updatedAt).to.not.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata.onServerAt).to.not.equal(ddata[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata.deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.patch + _forceAll: true', () => {
        onServerAt = new Date(onServerAt);
        return service.patch(null, {order: 94}, { query: { offline: { _forceAll: true} } })
          .then(delay())
          .then(sdata => {
            expect(sdata.length).to.equal(cdata.length + ddata.length, `${2*sampleLen} rows found`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(data[i].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(data[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(94, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(data[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(data[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.equal(data[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
            for (let i = sampleLen; i < 2*sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(ddata[i-sampleLen].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(ddata[i-sampleLen].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(94, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(ddata[i-sampleLen].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(ddata[i-sampleLen].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.equal(ddata[i-sampleLen].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.patch + _forceAll: true + params', () => {
        onServerAt = new Date(onServerAt);
        return service.patch(null, {order: 95}, { query: { offline: { _forceAll: true}, onServerAt } })
          .then(delay())
          .then(sdata => {
            expect(sdata.length).to.equal(ddata.length, `${sampleLen} rows found`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(95, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(ddata[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.patch + _forceAll: true + onServerAt', () => {
        onServerAt = new Date(onServerAt);
        return service.patch(null, {order: 96}, { query: { offline: { _forceAll: true, onServerAt }} })
          .then(delay())
          .then(sdata => {
            expect(sdata.length).to.equal(ddata.length, `${sampleLen} rows found`);
            for (let i = 0; i < sampleLen; i += 1) {
              expect(sdata[i].id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata[i].uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata[i].order).to.equal(96, `order is ok (i=${i})`);
              expect(sdata[i].updatedAt).to.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata[i].onServerAt).to.not.equal(ddata[i].onServerAt, `onServerAt is updated (i=${i})`);
              expect(sdata[i].deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
          })
      });

      it('.remove + _forceAll: true', () => {
        return service.remove(5, { query: { offline: { _forceAll: true} } })
          .then(delay())
          .then(sdata => {
            expect(typeof sdata).to.equal('object', `1 row found`);
            for (let i = 0; i < 1; i += 1) {
              expect(sdata.id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata.uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata.order).to.equal(ddata[i].order, `order is ok (i=${i})`);
              expect(sdata.updatedAt).to.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata.onServerAt).to.equal(ddata[i].onServerAt, `onServerAt is ok (i=${i})`);
              expect(sdata.deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
         })
      });

      it('.remove + _forceAll: true + params', () => {
        onServerAt = new Date(onServerAt);
        return service.remove(5, { query: { offline: { _forceAll: true}, onServerAt } })
          .then(delay())
          .then(sdata => {
            expect(typeof sdata).to.equal('object', `1 row found`);
            for (let i = 0; i < 1; i += 1) {
              expect(sdata.id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata.uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata.order).to.equal(ddata[i].order, `order is ok (i=${i})`);
              expect(sdata.updatedAt).to.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata.onServerAt).to.equal(ddata[i].onServerAt, `onServerAt is ok (i=${i})`);
              expect(sdata.deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
         })
      });

      it('.remove + _forceAll: true + onServerAt', () => {
        onServerAt = new Date(onServerAt);
        return service.remove(5, { query: { offline: { _forceAll: true, onServerAt }} })
          .then(delay())
          .then(sdata => {
            expect(typeof sdata).to.equal('object', `1 row found`);
            for (let i = 0; i < 1; i += 1) {
              expect(sdata.id).to.equal(ddata[i].id, `id is ok (i=${i})`);
              expect(sdata.uuid).to.equal(ddata[i].uuid, `uuid is ok (i=${i})`);
              expect(sdata.order).to.equal(ddata[i].order, `order is ok (i=${i})`);
              expect(sdata.updatedAt).to.equal(ddata[i].updatedAt, `updatedAt is ok (i=${i})`);
              expect(sdata.onServerAt).to.equal(ddata[i].onServerAt, `onServerAt is ok (i=${i})`);
              expect(sdata.deletedAt).to.equal(ddata[i].deletedAt, `deletedAt is ok (i=${i})`);
            }
         })
      });

    });
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
