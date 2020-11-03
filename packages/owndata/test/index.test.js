'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const adapterTests = require('@feathersjs/adapter-tests');
const memory = require('feathers-memory');
const { owndataWrapper } = require('../src');
const MutateStore = require('../src/mutate-store').default;

let verbose = false;
let app;
let ix = 0;

function newServicePath() {
  return '/tmp' + ix++;
}

function services1(path) {
  fromServiceNonPaginatedConfig(path);
}

function services2(path) {
  app.use(path, memory({ multi: true }));
  owndataWrapper(app, path);
  return app.service(path);
}

function fromServiceNonPaginatedConfig(path) {
  app.use(path, memory({ multi: true }));
  owndataWrapper(app, path);
  return app.service(path);
}

describe('Owndata-test - client', () => {

  beforeEach(() => {
  });

  // Let's perform all the usual adapter tests to verify full functionality
  app = feathers();
  const events = ['testing'];
});

describe('Owndata-test - Wrapper specific functionality', () => {
  it('fails with missing prior registration', () => {
    app = feathers();
    let path = newServicePath();
    try {
      owndataWrapper(app, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', 'No prior service registered on path');
    }
  });

  it('fails with missing app', () => {
    app = feathers();
    let path = newServicePath();
    app.service(path);
    try {
      owndataWrapper(path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', 'Missing app parameter throws Unavailable');
    }
  });

  it('basic functionality', () => {
    app = feathers();
    expect(typeof owndataWrapper).to.equal('function', 'is a function');
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
    owndataWrapper(app, path, {});
    let service = app.service(path);

    return service.create({ id: 99, order: 99 })
      .then(data => {
        expect(typeof data.uuid).to.equal('string', 'uuid was added');
        expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
        expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
      })
  });

  it('simulation hook throws error', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    setUpHooks(app, 'CLIENT', path, true);
    let service = app.service(path);

    return async () => {
      try {
        await service.create({ id: 98, order: 98 }, { query: { _fail: true } });
        expect(true).to.equal(false, 'hook throws an error');
      } catch (error) {
        expect(error.name).to.equal('Timeout', 'hook throws Timeout');
      }
      return true;
    }
  });

  describe('mutator specific tests', () => {
    it('MutateStore is a class', () => {
      try {
        expect(typeof MutateStore).to.equal('function', 'MutateStore should be a class');
        let mutator = new MutateStore({});
        expect(typeof mutator).to.equal('object', 'Instance of MutateStore should be an object');
      } catch (error) {
        expect(error.name).to.equal('BadRequest', 'MutateStore is no longer what is expected!');
        return true;
      }
    });

    it('publication is not a function', () => {
      try {
        let mutator = new MutateStore({ publication: {} });
        expect(true).to.equal(false, 'This misconfigured publication should throw');
      } catch (error) {
        expect(error.name).to.equal('BadRequest', 'Misconfigured publication should throw BadRequest');
        return true;
      }
    });

    it('subscriber is not a function', () => {
      try {
        let mutator = new MutateStore({ subscriber: null });
        expect(true).to.equal(false, 'This misconfigured subscriber should throw');
      } catch (error) {
        expect(error.name).to.equal('BadRequest', 'Misconfigured subscriber should throw BadRequest');
        return true;
      }
    });

    it('emitter is not a function', () => {
      try {
        let mutator = new MutateStore({ emitter: null });
        expect(true).to.equal(false, 'This misconfigured emitter should throw');
      } catch (error) {
        expect(error.name).to.equal('BadRequest', 'Misconfigured emitter should throw BadRequest');
        return true;
      }
    });

    it('no sorter', () => {
      try {
        let mutator = new MutateStore({ sort: null });
        let rec1 = mutator.mutate('created', {id:1, name: 'first'}, 1);
        let rec2 = mutator.mutate('created', {id:1, name: 'first'}, 0);
        expect(rec1).to.not.equal(rec2, 'The records should be different');
        expect(rec1.record).to.equal(rec2.record, 'The rec.records should be equal');
        expect(rec1.eventName).to.equal(rec2.eventName, 'The rec.eventName should be equal');
      } catch (error) {
        expect(error.name).to.equal('BadRequest', 'MutateStore is mot functioning as expected');
        return true;
      }
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

/**
 * This sets up a before an error hook for all functions for a given service. The hook
 * can simulate e.g. backend failure, network connection troubles, or timeout by supplying
 * ```{query: {_fail:true}}``` to the call options.
 * If `_fail` is false or the query is not supplied all this hook is bypassed.
 *
 * @param {object} app The application handle
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {boolean} allowFail Will we allow the usage of _fail and _timeout? (Default false)
 */
function setUpHooks(app, type, service, allowFail = false) {
  if (verbose) console.log(`setUpHooks called: type=${type}, service=${service}, allowFail=${allowFail}`)
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
      }

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
