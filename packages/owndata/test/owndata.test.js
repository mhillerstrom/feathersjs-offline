const { assert, expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const { sorter, select, AdapterService } = require('@feathersjs/adapter-commons');
const memory = require('feathers-memory');
const errors = require('@feathersjs/errors');
const { owndataWrapper } = require('../lib');
const _ = require('lodash');
const { omit, remove } = _;

const sampleLen = 5; // Size of test database (backend)
const verbose = false; // Should the test be chatty?

const desc = 'own-data'
const serviceName = '/from';

let app;
let clientService;

async function getRows (service) {
  let gRows = null;
  gRows = await service.find({ query: { id: { $gte: 0 }, $sort: { order: 1 } } });
  return gRows;
}

/**
 * This sets up a before an error hook for all functions for a given service. The hook
 * can simulate e.g. backend failure, network connection troubles, or timeout by supplying
 * ```{query: {_fail:true}}``` to the call options.
 * If `_fail` is false or the query is not supplied all this hook is bypassed.
 *
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {boolean} allowFail Will we allow the usage of _fail? (Default false)
 */
function setUpHooks (type, serviceName, service, allowFail = false) {

  service.hooks({
    before: {
      all: [ async context => {
        if (verbose) {
          const data = context.data ? `\n\tdata\t${JSON.stringify(context.data)}` : '';
          const params = context.params ? `\n\tparams\t${JSON.stringify(context.params)}` : '';
          console.log(`Before.all.hook ${type}.${context.method} called${data}${params}\n\tallowFail = ${allowFail}`);
        }
        if (context.params.query) {
          if (allowFail) {
            if (context.params.query._fail) { // Passing in param _fail simulates errors
              throw new errors.Timeout('Fail requested by user request - simulated timeout/missing connection');
            }
          }
          // In case _fail was supplied but not true and allowed - remove it before continuing
          let newQuery = Object.assign({}, context.params.query);
          delete newQuery._fail;
          context.params.query = newQuery;
          return context;
        }
      }
    ]}
    // error: {
    //   all: context => {
    //     if (verbose) {
    //       console.error(`Error.all.hook ${type}.${context.method} ERROR ${JSON.stringify(context.error)}`);
    //     };
    //     throw context.error;
    //   }
    // }
  });
}

function setupServices () {
  app = feathers();

  app.use(serviceName, memory({ multi: true }));
  owndataWrapper(app, serviceName, {});
  clientService = app.service(serviceName);
  setUpHooks('REMOTE', serviceName, clientService.remote, true);
  setUpHooks('CLIENT', serviceName, clientService.local, false);

  return clientService;
}

describe(`${desc} - optimistic mutation online`, () => {
  let data;
  let replicator;
  let eventSort = sorter({action:1, source:-1, 'record.id':1, 'record.uuid':1/*, 'record.updatedAt':1*/});

  beforeEach(() => {
    setupServices();

    const updatedAt = new Date();
    data = [];
    for (let i = 0, len = sampleLen; i < len; i += 1) {
      data.push({ id: i, uuid: 1000 + i, order: i, updatedAt });
    }
  });

  describe('General availability', () => {
    it('is CommonJS compatible', () => {
      assert.strictEqual(typeof owndataWrapper, 'function');
    });
  });

  describe('not connected', () => {
    let events;

    beforeEach(() => {
      events = [];

      return clientService.create(clone(data))
        .then(delay())
        .then(() => {
          clientService = app.service(serviceName);

          clientService.on('events', (records, last) => {
            events[events.length] = last;
          });
        });
    });

    it('create do not fail', () => {
      return clientService.create({ id: 96, uuid: 1096, order: 96 }, { query: { _fail: true } })
        .then(() => {
          assert(true, 'Succeeded as expected.');
        })
        .catch(err => {
          assert(false, 'Unexpectedly failed.');
        });
    });

  });

  describe('without publication', () => {
    let events;

    beforeEach(() => {
      events = [];

      return clientService.create(clone(data))
      .then(delay())
      .then(() => {
          clientService.on('events', (records, last) => {
            events[events.length] = last;
          });
        });
    });

    afterEach(() => {
      clientService.removeAllListeners();
    });

    it('find works', () => {
      return clientService.find({ query: { order: { $lt: 3 } } })
        .then(async result => {
          const records = await getRows(clientService.local);
          assertDeepEqualExcept(result, data.slice(0, 3), ['updatedAt', 'onServerAt', 'deletedAt']);
          assert.lengthOf(events, 0);
          assert.lengthOf(records, sampleLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt', 'deletedAt']);
        })
    });

    it('get works', () => {
      return clientService.get(0)
        .then(async result => {
          const records = await getRows(clientService.local);

          assertDeepEqualExcept([result], [{ id: 0, uuid: 1000, order: 0 }], ['updatedAt', 'onServerAt']);
          assert.lengthOf(events, 0);
          assert.lengthOf(records, sampleLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);
        })
    });

    it('create works', () => {
      return clientService.create({ id: 99, uuid: 1099, order: 99 })
        .then(delay())
        .then(async result => {
          const records = await getRows(clientService.local);

          data[sampleLen] = { id: 99, uuid: 1099, order: 99 };

          assertDeepEqualExcept([result], [{ id: 99, uuid: 1099, order: 99 }], ['updatedAt', 'onServerAt']);
          assertDeepEqualExcept(events, [
            {'source':1,'action':'mutated','eventName':'created','record':{'id':99,'uuid':1099,'order':99,'updatedAt':'2020-10-29T07:29:03.533Z','onServerAt':0}},{'source':0,'action':'mutated','eventName':'created','record':{'id':99,'uuid':1099,'order':99}},
            {'source':0,'action':'mutated','eventName':'created','record':{'id':99,'uuid':1099,'order':99}},
            {'action':'remove-listeners'},
            {'action':'add-listeners'}
          ], ['updatedAt', 'onServerAt'], eventSort);

          assert.lengthOf(records, sampleLen + 1);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);
        })
    });

    it('create adds missing uuid', () => {
      return clientService.create({ id: 99, order: 99 })
        .then(data => {
          assert.isString(data.uuid);
        })
    });

    it('update works', () => {
      return clientService.update(0, { id: 0, uuid: 1000, order: 99 })
        .then(delay())
        .then(async result => {
          const records = await getRows(clientService.local);
          data.splice(0, 1);
          data[data.length] = { id: 0, uuid: 1000, order: 99 };

          assertDeepEqualExcept([result], [{ id: 0, uuid: 1000, order: 99 }], ['updatedAt', 'onServerAt']);
          assert.lengthOf(records, sampleLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            { source: 1, eventName: 'updated', action: 'mutated', record: { id: 0, uuid: 1000, order: 99 } },
            { source: 0, eventName: 'updated', action: 'mutated', record: { id: 0, uuid: 1000, order: 99 } },
            { source: 0, eventName: 'updated', action: 'mutated', record: { id: 0, uuid: 1000, order: 99 } },
            { action: 'remove-listeners' },
            { action: 'add-listeners' }
          ], ['updatedAt', 'onServerAt'], eventSort);
        });
    });

    it('patch works', () => {
      return clientService.patch(1, { order: 99 })
        .then(delay())
        .then(async result => {
          const records = await getRows(clientService.local);
          data.splice(1, 1);
          data[data.length] = { id: 1, uuid: 1001, order: 99 };

          assertDeepEqualExcept([result], [{ id: 1, uuid: 1001, order: 99 }], ['updatedAt', 'onServerAt']);
          assert.lengthOf(records, sampleLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 99 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 99 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 99 } },
            { action: 'remove-listeners' },
            { action: 'add-listeners' }
          ], ['updatedAt', 'onServerAt'], eventSort);
        });
    });

    it('remove works', () => {
      return clientService.remove(2)
        .then(delay())
        .then(async result => {
          const records = await getRows(clientService.local);
          data.splice(2, 1);

          assertDeepEqualExcept([result], [{ id: 2, uuid: 1002, order: 2 }], ['updatedAt', 'onServerAt']);
          assert.lengthOf(records, sampleLen - 1);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            { source: 1, eventName: 'removed', action: 'remove', record: { id: 2, uuid: 1002, order: 2 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 2, uuid: 1002, order: 2 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 2, uuid: 1002, order: 2 } },
            { action: 'remove-listeners' },
            { action: 'add-listeners' }
          ], ['updatedAt', 'onServerAt'], eventSort);
        });
    });
  });

  describe('without publication, null id', () => {
    let events;

    beforeEach(() => {
      events = [];

      return clientService.create(clone(data))
       .then(() => {
          clientService.on('events', (records, last) => {
            events[events.length] = last;
          });
        });
    });

    it('create works', () => {
      return clientService.create([
          { id: 98, uuid: 1098, order: 98 },
          { id: 99, uuid: 1099, order: 99 }
        ])
        .then(delay())
        .then(async result => {
          const records = await getRows(clientService.local);

          data[sampleLen] = { id: 98, uuid: 1098, order: 98 };
          data[sampleLen + 1] = { id: 99, uuid: 1099, order: 99 };

          assertDeepEqualExcept(result, [
            { id: 98, uuid: 1098, order: 98 },
            { id: 99, uuid: 1099, order: 99 }
          ], ['updatedAt', 'onServerAt']);
          assertDeepEqualExcept(events, [
            { source: 1, eventName: 'created', action: 'mutated', record: { id: 98, uuid: 1098, order: 98 } },
            { source: 1, eventName: 'created', action: 'mutated', record: { id: 99, uuid: 1099, order: 99 } },
            { source: 0, eventName: 'created', action: 'mutated', record: { id: 98, uuid: 1098, order: 98 } },
            { source: 0, eventName: 'created', action: 'mutated', record: { id: 99, uuid: 1099, order: 99 } },
            { source: 0, eventName: 'created', action: 'mutated', record: { id: 98, uuid: 1098, order: 98 } },
            { source: 0, eventName: 'created', action: 'mutated', record: { id: 99, uuid: 1099, order: 99 } },
            { action: 'remove-listeners' },
            { action: 'add-listeners' }
          ], ['updatedAt', 'onServerAt'], eventSort);

          assert.lengthOf(records, sampleLen + 2);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);
        })
   });

   it('patch works', () => {
      return clientService.patch(null, { foo: 1 }, { query: { order: { $gt: 0, $lt: 4 } } })
        .then(delay())
        .then(async result => {
          const records = await getRows(clientService.local);

          data[1].foo = 1;
          data[2].foo = 1;
          data[3].foo = 1;

          assertDeepEqualExcept(result, [
            { id: 1, uuid: 1001, order: 1, foo: 1 },
            { id: 2, uuid: 1002, order: 2, foo: 1 },
            { id: 3, uuid: 1003, order: 3, foo: 1 }
          ], ['updatedAt', 'onServerAt']);

          assert.lengthOf(records, sampleLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          const evTable = [
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 2, uuid: 1002, order: 2, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 3, uuid: 1003, order: 3, foo: 1 } },
            // { action: 'add-listeners' },
            // { action: 'remove-listeners' },
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 1, foo: 1 } },
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 2, uuid: 1002, order: 2, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 2, uuid: 1002, order: 2, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 3, uuid: 1003, order: 3, foo: 1 } },
            // { action: 'remove-listeners' },
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 3, uuid: 1003, order: 3, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 1, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 1, foo: 1 } }
            // { action: 'add-listeners' },
          ];
          const tmp = Object.assign([], evTable);
          tmp.sort(eventSort);
          assertDeepEqualExcept(events, [
            { action: 'remove-listeners' },
            { action: 'add-listeners' },
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 1, foo: 1 } },
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 2, uuid: 1002, order: 2, foo: 1 } },
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 3, uuid: 1003, order: 3, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 1, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 2, uuid: 1002, order: 2, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 3, uuid: 1003, order: 3, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 1, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 2, uuid: 1002, order: 2, foo: 1 } },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 3, uuid: 1003, order: 3, foo: 1 } },
            { action: 'remove-listeners' },
            { action: 'add-listeners' }
          ], ['updatedAt', 'onServerAt'], eventSort);
        });
    });

    it('remove works', () => {
      return clientService.remove(null, { query: { order: { $gt: 0, $lt: 4 } } })
        .then(delay())
        .then(async result => {
          const records = await getRows(clientService.local);
          data.splice(1, 3);

          assertDeepEqualExcept(result, [
            { id: 1, uuid: 1001, order: 1 },
            { id: 2, uuid: 1002, order: 2 },
            { id: 3, uuid: 1003, order: 3 }
          ], ['updatedAt', 'onServerAt']);

          assert.lengthOf(records, sampleLen - 3);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            { action: 'remove-listeners' },
            { action: 'add-listeners' },
            { source: 1, eventName: 'removed', action: 'remove', record: { id: 1, uuid: 1001, order: 1 } },
            { source: 1, eventName: 'removed', action: 'remove', record: { id: 2, uuid: 1002, order: 2 } },
            { source: 1, eventName: 'removed', action: 'remove', record: { id: 3, uuid: 1003, order: 3 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 1, uuid: 1001, order: 1 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 2, uuid: 1002, order: 2 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 3, uuid: 1003, order: 3 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 1, uuid: 1001, order: 1 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 2, uuid: 1002, order: 2 } },
            { source: 0, eventName: 'removed', action: 'remove', record: { id: 3, uuid: 1003, order: 3 } },
            { action: 'remove-listeners' },
            { action: 'add-listeners' }
          ], ['updatedAt', 'onServerAt'], eventSort);
        });
    });
  });

  describe('without publication & remote error (timeout)', () => {
    let events;

    beforeEach(() => {
      events = [];
      return clientService.create(clone(data))
      .then(delay())
       .then(() => {
          clientService.on('events', (records, last) => {
            events[events.length] = last;
          });
        });
    });

    it('get succeeds correctly', () => {
      return clientService.get(0, {query:{_fail: true}})
        .then(res => {
          assert(res.id == 0, 'Succeeded as expected');
        })
        .catch(err => {
          expect(err.className).to.equal('not-found', 'Invalid id throws NotFound');
          assert(false, 'Unexpectedly failed');
        })
    });

    it('get fails correctly', () => {
      return clientService.get(9999, {query:{_fail: true}})
        .then(() => {
          assert(false, 'Unexpectedly succeeded');
        })
        .catch(err => {
          expect(err.className).to.equal('not-found', 'Invalid id throws NotFound');
        })
    });

    it('create works and sync recovers', () => {
      let clientRows = null;

      return clientService.create({ id: 99, uuid: 1099, order: 99 }, { query: { _fail: true } })
        .then(delay())
        // Current client side store status
        .then(() => getRows(clientService))
        .then(delay())
        .then(rows => { clientRows = rows; })
        .then(() => {
          assertDeepEqualExcept(events, [
            { source: 1, eventName: 'created', action: 'mutated', record: { id: 99, uuid: 1099, order: 99 } }
          ], ['updatedAt', 'onServerAt']);

          data[data.length] = { id: 99, uuid: 1099, order: 99 };

          assert.lengthOf(clientRows, sampleLen + 1);
          assertDeepEqualExcept(clientRows, data, ['updatedAt', 'onServerAt']);
        })
        .then(delay())
        .then(() => clientService.sync())
        .then(delay())
        // See changes after synchronization
        .then(() => getRows(clientService))
        .then(delay())
        .then(afterRows => {
          // Make sure remote data has changed...
          assert.lengthOf(afterRows, sampleLen + 1);
          assertDeepEqualExcept(afterRows, clientRows, ['updatedAt', 'onServerAt']);
        })
    });

    it('update works and sync recovers', () => {
      let clientRows = null;

      return clientService.update(0, { id: 0, uuid: 1000, order: 99 }, { query: { _fail: true } })
        .then(delay())
        .then(() => {
          assertDeepEqualExcept(events, [
            { source: 1, eventName: 'updated', action: 'mutated', record: { id: 0, uuid: 1000, order: 99 } }
          ], ['updatedAt', 'onServerAt'], eventSort);
        })
        // We have simulated offline - make sure remote data has not yet changed...
        .then(() => getRows(clientService.remote))
        .then(delay())
        .then(fromRows => {
          assert.lengthOf(fromRows, sampleLen);
          assertDeepEqualExcept(fromRows, data, ['updatedAt', 'onServerAt']);
        })
        // Current client side store status
        .then(() => getRows(clientService.local))
        .then(delay())
        .then(rows => { clientRows = rows; })
        .then(delay())
        // See changes after synchronization
        .then(() => clientService.sync())
        .then(delay())
        .then(() => getRows(clientService))
        .then(delay())
        .then(afterRows => {
          // Make sure remote data has changed...
          assert.lengthOf(afterRows, sampleLen);
          assertDeepEqualExcept(afterRows, clientRows, ['updatedAt', 'onServerAt']);
        })
    });

    it('patch works and sync recovers', () => {
      let clientRows = null;

      return clientService.patch(1, { order: 99 }, { query: { _fail: true } })
        .then(delay())
        // Current client side store status
        .then(() => getRows(clientService.local))
        .then(delay())
        .then(rows => { clientRows = rows; })
        .then(() => {
          assertDeepEqualExcept(events, [
            { source: 1, eventName: 'patched', action: 'mutated', record: { id: 1, uuid: 1001, order: 99 } }
          ], ['updatedAt', 'onServerAt'], eventSort);

          assert.lengthOf(clientRows, sampleLen);
        })
        // We have simulated offline - make sure remote data has not yet changed...
        .then(() => getRows(clientService.remote))
        .then(delay())
        .then(fromRows => {
          assert.lengthOf(fromRows, sampleLen);
          assertDeepEqualExcept(fromRows, data, ['updatedAt', 'onServerAt']);
        })
        .then(() => clientService.sync())
        .then(delay(20))
        // See changes after synchronization
        .then(() => getRows(clientService.remote))
        .then(delay())
        .then(fromRows => {
          // Make sure remote data has changed...
          assert.lengthOf(fromRows, sampleLen);
          assertDeepEqualExcept(fromRows, clientRows, ['updatedAt', 'onServerAt']);
        })
    });

    it('remove works and sync recovers', () => {
      let clientRows = null;

      return clientService.remove(2, { query: { _fail: true } })
        .then(delay())
        .then(async () => {
          const records = await getRows(clientService.local);

          assertDeepEqualExcept(events, [
            {'source':1,'action':'remove','eventName':'removed','record':{'id':2,'uuid':1002,'order':2}}
          ], ['updatedAt', 'onServerAt'], eventSort);
          assert.lengthOf(records, sampleLen - 1);

          // Remove uuid=1002 from sample data
          let newData = JSON.parse(JSON.stringify(data));
          newData = remove(newData, (val, ix, arr) => val.uuid !== 1002);

          assertDeepEqualExcept(records, newData, ['updatedAt', 'onServerAt']);
        })
        // We have simulated offline - make sure remote data has not yet changed...
        .then(() => getRows(clientService.remote))
        .then(delay())
        .then(fromRows => {
          assert.lengthOf(fromRows, sampleLen);
          assertDeepEqualExcept(fromRows, data, ['updatedAt', 'onServerAt']);
        })
        // Current client side store status
        .then(() => getRows(clientService.local))
        .then(delay())
        .then(rows => { clientRows = rows; })
        // See changes after synchronization
        .then(() => clientService.sync())
        .then(() => delay())
        .then(() => getRows(clientService.remote))
        .then(delay())
        .then(fromRows => {
          // Make sure remote data has changed...
          assert.lengthOf(fromRows, sampleLen - 1);
          assertDeepEqualExcept(fromRows, clientRows, ['updatedAt', 'onServerAt']);
        })
    });
});

  describe('test of sync', () => {
    let events;

    beforeEach(() => {
      events = [];
      return clientService.create(clone(data))
      .then(delay())
      .then(() => {
          clientService.on('events', (records, last) => {
            events[events.length] = last;
          });
        });
      });

    it('sync all', () => {
      let clientRows = null;
      let countEvents = 0;

      return () => clientService.update(0, { id: 0, uuid: 1000, order: 99 }, { query: { _fail: true, _timeout: true } })
        .then(delay())
        .then(() => clientService.update(0, { id: 0, uuid: 1000, order: 999 }, { query: { _fail: true, _timeout: true } }))
        .then(delay())
        .then(() => clientService.update(0, { id: 0, uuid: 1000, order: 9999 }, { query: { _fail: true, _timeout: true } }))
        .then(delay())
        .then(() => {
          assertDeepEqualExcept(events, [
            { action: 'add-listeners' },
            { source: 1, eventName: 'updated', action: 'mutated', record: { id: 0, uuid: 1000, order: 99 } },
            { source: 1, eventName: 'updated', action: 'mutated', record: { id: 0, uuid: 1000, order: 999 } },
            { source: 1, eventName: 'updated', action: 'mutated', record: { id: 0, uuid: 1000, order: 9999 } }
          ], ['updatedAt', 'onServerAt'], eventSort);
        })
        // We have simulated offline - make sure remote data has not yet changed...
        .then(() => clientService.remote.find({ query: { uuid: 1000 } }))
        .then(delay())
        .then(fromRows => {
          assertDeepEqualExcept(fromRows, [{ id: 0, uuid: 1000, order: 0 }], ['updatedAt', 'onServerAt']);
        })
        // Current client side store status
        .then(() => getRows(clientService))
        .then(delay())
        .then(rows => { clientRows = rows; })
        .then(() => {
          clientService.on('updated', () => {
            countEvents++;
          });
        })
        .then(async () => await clientService.sync())
        .then(delay())
        // See changes after synchronization
        .then(() => getRows(clientService.remote))
        .then(delay())
        .then(fromRows => {
          // Make sure remote data has changed...
          assert.lengthOf(clientRows, sampleLen);
          assert.equal(countEvents, 3);
          assert.lengthOf(fromRows, sampleLen);
          assertDeepEqualExcept(fromRows, clientRows, ['updatedAt', 'onServerAt']);
        })
    });
  });
});

  // Helpers

  function clone (obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function delay (ms = 0) {
    return data => new Promise(resolve => {
      setTimeout(() => {
        resolve(data);
      }, ms);
    });
  }

  function assertDeepEqualExcept (ds1, ds2, ignore, sort) {
    function removeIgnore (ds) {
      let dsc = clone(ds);
      dsc = omit(dsc, ignore);
      for (const i in dsc) {
        if (typeof dsc[i] === 'object') {
          dsc[i] = removeIgnore(dsc[i]);
        }
      }
      return dsc;
    }

    assert.isArray(ds1);
    assert.isArray(ds2);
    assert.isArray(ignore);
    assert.equal(ds1.length, ds2.length);
    ds1 = ds1.sort(sort);
    ds2 = ds2.sort(sort);
    for (let i = 0; i < ds1.length; i++) {
      const dsi1 = removeIgnore(ds1[i]);
      const dsi2 = removeIgnore(ds2[i]);
      assert.deepEqual(dsi1, dsi2);
    }
  }
