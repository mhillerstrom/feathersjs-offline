const { assert, expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const memory = require('feathers-memory');
const _ = require('lodash');
const { omit, remove } = _;
const sorter = require('./sorter'); // require('@feathersjs/adapter-commons');
const { service2, service4 } = require('./client-service');
const LocalStorage = require('./local-storage');

const sampleLen = 5; // Size of test database (backend)

module.exports = (desc, _app, _errors, wrapper, serviceName, verbose, isBaseClass = false) => {

let clientService;

async function getRows (service) {
  let gRows = null;
  gRows = await service.find({ query: { id: { $gte: 0 }, $sort: { order: 1 } } });
  return gRows;
}

function setupServices () {
    app = feathers();
    app.use(serviceName, memory({ multi: true, storage: new LocalStorage() }));
    clientService = wrapper(app, serviceName);

  return clientService;
}

describe(`${desc} - alternative storage`, () => {
  let data;
  let eventSort = sorter({ id: 1, uuid: 1 });

  after(() => {
    console.log('\n');
  });

  beforeEach(() => {
    setupServices();

    const updatedAt = new Date();
    data = [];
    for (let i = 0, len = sampleLen; i < len; i++) {
      data.push({ id: i, uuid: 1000 + i, order: i, updatedAt });
    }
  });

  describe('own local storage', () => {

    beforeEach(() => {
    });

    it('alternative storage works', () => {
      return clientService.create(clone(data))
      .then(delay())
      .then(() => clientService.getEntries())
      .then(result => {
        assertDeepEqualExcept(data, result,
          ['onServerAt', 'updatedAt'], eventSort);
      });
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

}
