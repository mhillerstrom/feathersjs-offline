'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const adapterTests = require('@feathersjs/adapter-tests');
const memory = require('feathers-memory');
const { ownnetWrapper } = require('../src');
const MutateStore = require('../../owndata/src/mutate-store').default;

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
  ownnetWrapper(app, path);
  return app.service(path);
}

function fromServiceNonPaginatedConfig(path) {
  app.use(path, memory({ multi: true }));
  ownnetWrapper(app, path);
  return app.service(path);
}

describe('Owndata-test - client only', () => {

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
      ownnetWrapper(app, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', 'Missing app parameter throws Unavailable');
    }
  });

  it('fails with missing or wrong app', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    app.service(path);
    try {
      ownnetWrapper(path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', 'Missing app parameter throws Unavailable');
    }
    try {
      ownnetWrapper(null, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', 'null app parameter throws Unavailable');
    }
    try {
      ownnetWrapper({}, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{} app parameter throws Unavailable');
    }
    try {
      ownnetWrapper({ version: '1' }, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{version:\'1\'} app parameter throws Unavailable');
    }
    try {
      ownnetWrapper({ version: '1', service: () => { } }, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{version:\'1\', service: () =>{}} app parameter throws Unavailable');
    }
    try {
      ownnetWrapper({ version: '1', service: () => { }, services: [] }, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{version:\'1\', service: () =>{}, services: []} app parameter throws Unavailable');
    }
  });

  it('basic functionality', () => {
    app = feathers();
    expect(typeof ownnetWrapper).to.equal('function', 'is a function');
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
    ownnetWrapper(app, path, {});
    let service = app.service(path);

    return service.create({ id: 99, order: 99 })
      .then(data => {
        expect(typeof data.uuid).to.equal('string', 'uuid was added');
        expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
        expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
      })
  });

  it('access local', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    ownnetWrapper(app, path, {});
    let service = app.service(path);
    let localService = service.local;

    return localService.create({ id: 99, order: 99 })
      .then(data => {
        expect(data).to.deep.equal({ id: 99, order: 99 }, 'Object not changed');
      })
  });

  it('set local throws error', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    ownnetWrapper(app, path, {});
    let service = app.service(path);

    try {
      service.local = () => { return { id: 99, order: 99 } };
      expect(true).to.equal(false, 'We should not be able to get here!!');
    } catch (error) {
      expect(error.name).to.equal('Forbidden', 'Forbidden was thrown as expected');
    }
  });


  it('access queue', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    ownnetWrapper(app, path, {});
    let service = app.service(path);
    let localQueue = service.queue;

    return localQueue.create({ id: 99, order: 99 })
      .then(data => {
        expect(data).to.deep.equal({ id: 99, order: 99 }, 'Object not changed');
      })
  });

  it('set queue throws error', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    ownnetWrapper(app, path, {});
    let service = app.service(path);

    try {
      service.queue = () => { return { id: 99, order: 99 } };
      expect(true).to.equal(false, 'We should not be able to get here!!');
    } catch (error) {
      expect(error.name).to.equal('Forbidden', 'Forbidden was thrown as expected');
    }
  });


  it('access remote', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    ownnetWrapper(app, path, {});
    let service = app.service(path);
    let remoteService = service.remote;

    return remoteService.create({ id: 99, order: 99 })
      .then(data => {
        expect(data).to.deep.equal({ id: 99, order: 99 }, 'Object not changed');
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


  it('set remote throws error', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    ownnetWrapper(app, path, {});
    let service = app.service(path);

    try {
      service.remote = () => { return { id: 99, order: 99 } };
      expect(true).to.equal(false, 'We should not be able to get here!!');
    } catch (error) {
      expect(error.name).to.equal('Forbidden', 'Forbidden was thrown as expected');
    }
  });


})

describe('_ functions throws exception', () => {
  let service;

  beforeEach(() => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    ownnetWrapper(app, path, {});
    service = app.service(path);
  });


  it('_get exists', () => {
    expect(typeof service._get).to.equal('function', '_get is not defined!');
  });

  it('_get throws', () => {
    return service._get(99)
      .catch(error => {
        expect(error.name).to.equal('NotImplemented', `${error.message}`);
      });
  });

  it('_find exists', () => {
    expect(typeof service._find).to.equal('function', '_find is not defined!');
  });

  it('_find throws', () => {
    return service._find()
      .catch(error => {
        expect(error.name).to.equal('NotImplemented', `${error.message}`);
      });
  });

  it('_create exists', () => {
    expect(typeof service._create).to.equal('function', '_create is not defined!');
  });

  it('_create throws', () => {
    return service._create({id:99})
      .catch(error => {
        expect(error.name).to.equal('NotImplemented', `${error.message}`);
      });
  });

  it('_update exists', () => {
    expect(typeof service._update).to.equal('function', '_update is not defined!');
  });

  it('_update throws', () => {
    return service._update(99, {b:3})
      .catch(error => {
        expect(error.name).to.equal('NotImplemented', `${error.message}`);
      });
  });

  it('_patch exists', () => {
    expect(typeof service._patch).to.equal('function', '_patch is not defined!');
  });

  it('_patch throws', () => {
    return service._patch(99, {b:2})
      .catch(error => {
        expect(error.name).to.equal('NotImplemented', `${error.message}`);
      });
  });

  it('_remove exists', () => {
    expect(typeof service._remove).to.equal('function', '_remove is not defined!');
  });

  it('_remove throws', () => {
    return service._remove(99)
      .catch(error => {
        expect(error.name).to.equal('NotImplemented', `${error.message}`);
      });
  });

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
      let rec1 = mutator.mutate('created', { id: 1, name: 'first' }, 1);
      let rec2 = mutator.mutate('created', { id: 1, name: 'first' }, 0);
      expect(rec1).to.not.equal(rec2, 'The records should be different');
      expect(rec1.record).to.equal(rec2.record, 'The rec.records should be equal');
      expect(rec1.eventName).to.equal(rec2.eventName, 'The rec.eventName should be equal');
    } catch (error) {
      expect(error.name).to.equal('BadRequest', 'MutateStore is mot functioning as expected');
      return true;
    }
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
