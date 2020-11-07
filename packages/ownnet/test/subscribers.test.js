
const assert = require('chai').assert;
const feathers = require('@feathersjs/feathers');
const memory = require('feathers-memory');
const errors = require('@feathersjs/errors');
const { ownnetWrapper } = require('../src');
const _ = require('lodash');
const { omit } = _;

const sampleLen = 5; // Size of test database (backend)
const verbose = false; // Should the test be chatty?

const desc = 'own-net'
const serviceName = '/from';

let app;

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
      all: [async context => {
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
            if (context.params.query._badFail) { // Passing in param _badfail simulates other error than timeout
              throw new errors.GeneralError('Fail requested by user request - simulated general error');
            }
          }
          // In case _fail was supplied but not true and allowed - remove it before continuing
          let newQuery = Object.assign({}, context.params.query);
          delete newQuery._fail;
          delete newQuery._badFail;
          context.params.query = newQuery;
          return context;
        }
      }
      ]
    }
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

function setupServices (publication = null, subscriber = () => { }) {
  app = feathers();
  let options = {subscriber};
  if (publication !== null) options.publication = publication;

  app.use(serviceName, memory({ multi: true }));
  ownnetWrapper(app, serviceName, options);
  clientService = app.service(serviceName);
  setUpHooks('REMOTE', serviceName, clientService.remote, true);
  setUpHooks('CLIENT', serviceName, clientService.local, false);

  return clientService;
}

describe(`${desc} - subscribers`, () => {
  let data;
  let clientService;
  let events;

  describe('without publication', () => {

    beforeEach(async () => {
      events = [];
      clientService = setupServices(null, (records, last) => { events[events.length] = last; });

      data = [];
      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i });
      }

      await clientService.create(clone(data));
      events = [];
    });

    it('create works', () => {
      return clientService.create({ id: 79, uuid: 1079, order: 79 })
        .then(delay())
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          data[sampleLen] = { id: 79, uuid: 1079, order: 79 };

          assert.lengthOf(records, sampleLen + 1);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            {"source":1,"action":"mutated","eventName":"created","record":{"id":79,"uuid":1079,"order":79}},
            {"source":0,"action":"mutated","eventName":"created","record":{"id":79,"uuid":1079,"order":79}},
            {"source":0,"action":"mutated","eventName":"created","record":{"id":79,"uuid":1079,"order":79}},
            {"action":"remove-listeners"},
            {"action":"add-listeners"}
          ], ['updatedAt', 'onServerAt']);
        });
    });

    it('update works', () => {
      return clientService.update(0, { id: 0, uuid: 1000, order: 88 })
        .then(delay())
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          data.splice(0, 1);
          data[data.length] = { id: 0, uuid: 1000, order: 88 };

          assert.lengthOf(records, sampleLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            {"source":1,"action":"mutated","eventName":"updated","record":{"id":0,"uuid":1000,"order":88}},
            {"source":0,"action":"mutated","eventName":"updated","record":{"id":0,"uuid":1000,"order":88}},
            {"source":0,"action":"mutated","eventName":"updated","record":{"id":0,"uuid":1000,"order":88}},
            {"action":"remove-listeners"},
            {"action":"add-listeners"}
          ], ['updatedAt', 'onServerAt']);
        });
    });

    it('patch works', () => {
      return clientService.patch(1, { order: 87 })
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          data.splice(1, 1);
          data[data.length] = { id: 1, uuid: 1001, order: 87 };

          assert.lengthOf(records, sampleLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            {"source":1,"action":"mutated","eventName":"patched","record":{"id":1,"uuid":1001,"order":87}},
            {"source":0,"action":"mutated","eventName":"patched","record":{"id":1,"uuid":1001,"order":87}},
            {"source":0,"action":"mutated","eventName":"patched","record":{"id":1,"uuid":1001,"order":87}},
            {"action":"remove-listeners"},
            {"action":"add-listeners"}
          ], ['updatedAt', 'onServerAt']);
        });
    });

    it('remove works', () => {
      return clientService.remove(2)
        .then(delay())
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          data.splice(2, 1);

          assert.lengthOf(records, sampleLen - 1);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            {"source":1,"action":"remove","eventName":"removed","record":{"id":2,"uuid":1002,"order":2}},
            {"source":0,"action":"remove","eventName":"removed","record":{"id":2,"uuid":1002,"order":2}},
            {"source":0,"action":"remove","eventName":"removed","record":{"id":2,"uuid":1002,"order":2}},
            {"action":"remove-listeners"},
            {"action":"add-listeners"}
          ], ['updatedAt', 'onServerAt']);
        });
    });
  });

  describe('within publication', () => {
    const testLen = 4;

    beforeEach(async () => {
      events = [];
      clientService = setupServices(
        record => record.order <= 3.5,
        (records, last) => { events[events.length] = last; }
      );

      data = [];
      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i });
      }

      data.splice(testLen);
      await clientService.create(clone(data));

      events = [];
    });

    it('create works', () => {
      return clientService.create({ id: 86, uuid: 1086, order: 3.5 })
        .then(delay())
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          data[testLen] = { id: 86, uuid: 1086, order: 3.5 };

          assert.lengthOf(records, testLen + 1);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            {"source":1,"action":"mutated","eventName":"created","record":{"id":86,"uuid":1086,"order":3.5}},
            {"source":0,"action":"mutated","eventName":"created","record":{"id":86,"uuid":1086,"order":3.5}},
            {"source":0,"action":"mutated","eventName":"created","record":{"id":86,"uuid":1086,"order":3.5}},
            {"action":"remove-listeners"},
            {"action":"add-listeners"}
          ], ['updatedAt', 'onServerAt']);
        });
    });
  });

  describe('outside publication', () => {
    const testLen = 4;

    beforeEach(async () => {
      events = [];
      clientService = setupServices(
        record => record.order <= 3.5,
        (records, last) => { events[events.length] = last; }
      );

      data = [];
      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i });
      }

      data.splice(testLen);
      await clientService.create(clone(data));

      events = [];
    });

    it('create works', () => {
      return clientService.create({ id: 85, uuid: 1085, order: 85 })
        .then(delay())
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          data[testLen] = { id: 85, uuid: 1085, order: 85 };

          assert.lengthOf(records, testLen+1);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            {"action":"remove-listeners"},
            {"action":"add-listeners"}
          ], ['updatedAt', 'onServerAt']);
        });
    });
  });

  describe('moving in/out publication', () => {
    const testLen = 4;

    beforeEach(async () => {
      events = [];
      clientService = setupServices(
        record => record.order <= 3.5,
        (records, last) => { events[events.length] = last; }
      );

      data = [];
      for (let i = 0, len = sampleLen; i < len; i += 1) {
        data.push({ id: i, uuid: 1000 + i, order: i });
      }

      data.splice(testLen);
      await clientService.create(clone(data));

      events = [];
    });

    it('patching to without', () => {
      return clientService.patch(1, { order: 84 })
        .then(delay())
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          let record = clone(data[1]);
          record.order = 84;
          data.splice(1, 1);
          data[testLen-1] = record;

          assert.lengthOf(records, testLen);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          assertDeepEqualExcept(events, [
            {"source":1,"action":"left-pub","eventName":"patched","record":{"id":1,"uuid":1001,"order":84}},
            {"action":"remove-listeners"},
            {"action":"add-listeners"}
          ], ['updatedAt', 'onServerAt']);
        });
    });

/*
    it('patching to within', () => {
      return clientService.patch(4, { order: 3.5 })
        .then(delay())
        .then(async () => await getRows(clientService))
        .then(delay())
        .then(records => {
          data[testLen] = { id: 4, uuid: 1004, order: 3.5 };

          console.log(`records = ${JSON.stringify(records)}\ndata = ${JSON.stringify(data)}`);
          assert.lengthOf(records, testLen + 1);
          assertDeepEqualExcept(records, data, ['updatedAt', 'onServerAt']);

          console.log(`events = ${JSON.stringify(events)}`);
          assertDeepEqualExcept(events, [
            { action: 'snapshot' },
            { action: 'add-listeners' },
            { source: 0, eventName: 'patched', action: 'mutated', record: { id: 4, uuid: 1004, order: 3.5 } }
          ], ['updatedAt', 'onServerAt']);
        });
    });
*/

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

function clone (obj) {
  return JSON.parse(JSON.stringify(obj));
}

function assertDeepEqualExcept (ds1, ds2, ignore) {
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
  for (let i = 0; i < ds1.length; i++) {
    const dsi1 = removeIgnore(ds1[i]);
    const dsi2 = removeIgnore(ds2[i]);
    assert.deepEqual(dsi1, dsi2);
  }
}
