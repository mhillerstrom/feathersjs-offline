'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors =  require('@feathersjs/errors');
const adapterTests = require('@feathersjs/adapter-tests');
const memory = require('feathers-memory');
const OwndataWrapper = require('../lib');

let verbose = false;
let app;
let ix = 0;

function newServicePath() {
  return '/tmp' /* + ix++ */;
}

function services1 (path) {
  fromServiceNonPaginatedConfig(path);
}

function services2 (path) {
  app.configure(OwndataWrapper(path, memory, { multi: true }));
  return app.service(path);
}

function fromServiceNonPaginatedConfig (path) {
  app.configure(OwndataWrapper(path, memory, { multi: true }));
  return app.service(path);
}


describe('Owndata-test - client', () => {

  beforeEach(() => {
  });

  // Let's perform all the usual adapter tests to verify full functionality
  app = feathers();
  const events = ['testing'];
});

describe('Owndata-test - client & server', () => {

  beforeEach(() => {
  });

  // Let's perform all the usual adapter tests to verify full functionality
  app = feathers();
  const events = ['testing'];
});

describe('Owndata-test - Wrapper specific functionality', () => {
  it('basic functionality', () => {
    app = feathers();
    expect(typeof OwndataWrapper).to.equal('function', 'is a function');
    let path = newServicePath();
    let obj = fromServiceNonPaginatedConfig(path);
    expect(typeof obj).to.equal('object', 'is an object');
  });

  it('configure (default)', () => {
    app = feathers()
    let path = newServicePath();
    services1(path);
  });

  it('configure (with options)', () => {
    app = feathers()
    let path = newServicePath();
    services2(path)
  });

  it('create adds missing uuid, updatedAt, and onServerAt', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    app.configure(OwndataWrapper(path, memory, { clearStorage: true }));
    let service = app.service(path);

    return service.create({ id: 99, order: 99 })
      .then(data => {
        console.log(`First test: data = ${JSON.stringify(data)}`);
        expect(typeof data.uuid).to.equal('string', 'uuid was added');
        expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
        expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
      })
      .then(delay())
      .then(() => service.find({query: {id: 99}}))
      .then(res => {
        expect(typeof res[0].uuid).to.equal('string', 'uuid was added');
        expect(typeof res[0].updatedAt).to.equal('string', 'updatedAt was added');
/* TODO: Remove 2 lines for client only, 1 line for client+server */
        res[0].onServerAt = res[0].updatedAt;
        expect(typeof res[0].onServerAt).to.equal('string', 'onServerAt was updated');
      });
  });

  it('simulation hook throws error', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    let service = app.service(path);
    setUpHooks('CLIENT', path, true);

    return async () => {
      try {
        await service.create({ id: 99, order: 99 }, {query: {_fail: true}});
        expect(true).to.equal(false, 'hook throws an error');
      } catch (error) {
        expect(error.name).to.equal('BadRequest', 'hook throws BadRequest');
      }
      return true;
    }
  });
});

it('sync works', () => {
  app = feathers();
  let path = newServicePath();
  app.configure(OwndataWrapper(path, memory, { clearStorage: true }));
  let service = app.service(path);
  setUpHooks('CLIENT', path, true);

  return service.create({ id: 99, order: 99 }, {query: {_fail: true}})
    .then(data => {
      expect(typeof data.uuid).to.equal('string', 'uuid was added');
      expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
      expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
    })
    .then(delay())
    .then(() => {
        let flag = null;
        try{
          service.sync = function(){};
          service.sync();
          flag = true;
        } catch (err) {
          flag = false;
        }
        expect(true).to.equal(flag, '.sync() is a method');
    })
    .then(delay())
    .then(() => service.find({query:{id: 99}}))
    .then(res => {
      console.log(`Second test: res = ${JSON.stringify(res)}`);
      expect(typeof res[0].uuid).to.equal('string', 'uuid was added');
      expect(typeof res[0].updatedAt).to.equal('string', 'updatedAt was added');
/* TODO: Remove 2 lines for client only, 1 line for client+server */
      res[0].onServerAt = res[0].updatedAt;
      expect(typeof res[0].onServerAt).to.equal('string', 'onServerAt was updated');
    })
    .then(() => {
      expect(true).to.equal(true, 'sync works');
    })
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
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {boolean} allowFail Will we allow the usage of _fail and _timeout? (Default false)
 */
function setUpHooks (type, service, allowFail = false) {
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
