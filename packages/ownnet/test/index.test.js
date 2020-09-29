'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const memory = require('feathers-memory');
const { Ownnet, ownnetWrapper } = require('../lib');

let verbose = false;
let app;
let ix = 0;

function newServicePath () {
  return '/tmp' + ix++;
}

function services1 (path) {
  fromServiceNonPaginatedConfig(path);
}

function services2 (path) {
  app.use(path, memory({ multi: true }));
  ownnetWrapper(app, path);
  return app.service(path);
}

function fromServiceNonPaginatedConfig (path) {
  app.use(path, memory({ multi: true }));
  ownnetWrapper(app, path);
  return app.service(path);
}

describe('Ownnet-test - Wrapper specific functionality', () => {
  it('basic functionality', () => {
    app = feathers();
    expect(typeof Ownnet).to.equal('function', 'is a function');
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

  it('create adds missing uuid, updatedAt, and onServerAt updated', async () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    setUpHooks('SERVER', path, false, true);
    ownnetWrapper(app, path, { clearStorage: true });
    let service = await app.service(path);

    return service.create({ id: 98, order: 98 })
      .then(delay())
      .then(data => {
        expect(typeof data.uuid).to.equal('string', 'uuid was added');
        expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
        expect(typeof data.onServerAt).to.equal('string', 'onServerAt was added');
      })
      .then(() => { service.options.multi = false; })
  });

  it('simulation hook throws error', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    let service = app.service(path);
    setUpHooks('CLIENT', path, true);

    return async () => {
      try {
        await service.create({ id: 98, order: 98 }, { query: { _fail: true } });
        expect(true).to.equal(false, 'hook throws an error');
      } catch (error) {
        expect(error.name).to.equal('BadRequest', 'hook throws BadRequest');
      }
      return true;
    }
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

/**
 * This sets up a before an error hook for all functions for a given service. The hook
 * can simulate e.g. backend failure, network connection troubles, or timeout by supplying
 * ```{query: {_fail:true}}``` to the call options.
 * If `_fail` is false or the query is not supplied all this hook is bypassed.
 * We can also simulate the servers function updating the `onServerAt`attribute by setting
 * `simulateServer` parameter.
 *
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {boolean} allowFail Will we allow the usage of _fail (Default false)
 * @param {boolean} simulateServer Will update the onServerAt attribute on any write (Default false)
 */
function setUpHooks (type, service, allowFail = false, simulateServer = false) {
  if (verbose) console.log(`setUpHooks called: type=${type}, service=${service}, allowFail=${allowFail}`)
  let selfName = app.service(service).thisName;
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
            throw new errors.Timeout(`Fail requested by user request - simulated timout/missing connection ('${service}')`);
          }
          else {
            // _fail was supplied but not true - remove it before continuing
            delete context.params.query._fail;
            return context;
          }
        }
      },
      create: [setOnServerAtHook(simulateServer)],
      update: [setOnServerAtHook(simulateServer)],
      patch: [setOnServerAtHook(simulateServer)]

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

function setOnServerAtHook (simulate) {
  if (simulate) {
    return context => {
      if (Array.isArray(context.data)) {
        context.data.forEach(v => v.onServerAt = new Date().toISOString());
      }
      else {
        context.data.onServerAt = new Date().toISOString();
      }
      return context;
    }
  }
  else {
    return context => { return context };
  }
}
