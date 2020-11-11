'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const adapterTests = require('@feathersjs/adapter-tests');
const memory = require('feathers-memory');
const { owndataWrapper } = require('../src');
const { getEnabledCategories } = require('trace_events');

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
      owndataWrapper(app, path, { someDummyOption: 1 });
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
      owndataWrapper(path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', 'Missing app parameter throws Unavailable');
    }
    try {
      owndataWrapper(null, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', 'null app parameter throws Unavailable');
    }
    try {
      owndataWrapper({}, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{} app parameter throws Unavailable');
    }
    try {
      owndataWrapper({ version: '1' }, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{version:\'1\'} app parameter throws Unavailable');
    }
    try {
      owndataWrapper({ version: '1', service: () => { } }, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{version:\'1\', service: () =>{}} app parameter throws Unavailable');
    }
    try {
      owndataWrapper({ version: '1', service: () => { }, services: [] }, path, { someDummyOption: 1 });
    } catch (err) {
      expect(err.name).to.equal('Unavailable', '{version:\'1\', service: () =>{}, services: []} app parameter throws Unavailable');
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

  it('access local', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    owndataWrapper(app, path, {});
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
    owndataWrapper(app, path, {});
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
    owndataWrapper(app, path, {});
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
    owndataWrapper(app, path, {});
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
    owndataWrapper(app, path, {});
    let service = app.service(path);
    let remoteService = service.remote;

    return remoteService.create({ id: 99, order: 99 })
      .then(data => {
        expect(data).to.deep.equal({ id: 99, order: 99 }, 'Object not changed');
      })
  });


  it('set remote throws error', () => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    owndataWrapper(app, path, {});
    let service = app.service(path);

    try {
      service.remote = () => { return { id: 99, order: 99 } };
      expect(true).to.equal(false, 'We should not be able to get here!!');
    } catch (error) {
      expect(error.name).to.equal('Forbidden', 'Forbidden was thrown as expected');
    }
  });


})

describe('Non _ functions throws exception', () => {
  let service;

  beforeEach(() => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    owndataWrapper(app, path, {});
    service = app.service(path);
  });


  it('update multi throws', async () => {
    try {
      await service.update(null, {b:3});
    } catch(error) {
        expect(error.name).to.equal('BadRequest', `${error.message}`);
    }
    try {
      await service.update(0, [{b:3}, {b:2}]);
    } catch(error) {
        expect(error.name).to.equal('BadRequest', `${error.message}`);
    }
  });

  it('patch multi throws', () => {
    return service.patch(null, {b:2})
      .catch(error => {
        expect(error.name).to.equal('MethodNotAllowed', `${error.message}`);
      });
  });

  it('remove multi throws', () => {
    return service.remove(null)
      .catch(error => {
        expect(error.name).to.equal('MethodNotAllowed', `${error.message}`);
      });
  });

});

describe('_ functions throws exception', () => {
  let service;

  beforeEach(() => {
    app = feathers();
    let path = newServicePath();
    app.use(path, memory());
    owndataWrapper(app, path, {});
    service = app.service(path);
  });


  it('_get exists', () => {
    expect(typeof service._get).to.equal('function', '_get is not defined!');
  });

  it('_find exists', () => {
    expect(typeof service._find).to.equal('function', '_find is not defined!');
  });

  it('_create exists', () => {
    expect(typeof service._create).to.equal('function', '_create is not defined!');
  });

  it('_create multi throws', () => {
    return service._create([{id:99}, {id:98}])
      .catch(error => {
        expect(error.name).to.equal('MethodNotAllowed', `${error.message}`);
      });
  });

  it('_update exists', () => {
    expect(typeof service._update).to.equal('function', '_update is not defined!');
  });

  it('_update multi throws', async () => {
    try {
      await service._update(null, {b:3});
    } catch(error) {
        expect(error.name).to.equal('BadRequest', `${error.message}`);
    }
    try {
      await service._update(0, [{b:3}, {b:2}]);
    } catch(error) {
        expect(error.name).to.equal('BadRequest', `${error.message}`);
    }
  });

  it('_patch exists', () => {
    expect(typeof service._patch).to.equal('function', '_patch is not defined!');
  });

  it('_patch multi throws', () => {
    return service._patch(null, {b:2})
      .catch(error => {
        expect(error.name).to.equal('MethodNotAllowed', `${error.message}`);
      });
  });

  it('_remove exists', () => {
    expect(typeof service._remove).to.equal('function', '_remove is not defined!');
  });

  it('_remove multi throws', () => {
    return service._remove(null)
      .catch(error => {
        expect(error.name).to.equal('MethodNotAllowed', `${error.message}`);
      });
  });

});


describe('Misc quirky tests for high coverage', () => {
  let service;
  let path;

  beforeEach(() => {
    app = feathers();
    path = newServicePath();
    app.use(path, memory({multi: true}));
    owndataWrapper(app, path, {});
    service = app.service(path);
  });


  it('parent\'s _processQueuedEvents throws', async () => {

    try {
      await service.__forTestingOnly();
      expect(true).to.equal(false, `super._processQueuedEvents() unexpectedly did not throw NotImplemented`);
    } catch (error) {
      expect(true).to.equal(true, `_processQueuedEvents() unexpectedly returned '${error.name}', '${error.message}'.`);
      expect(error.name).to.equal('NotImplemented', `Unexpectedly threw '${error.name}', '${error.message}'.`);
    }
  });

  it('_processQueuedEvents works on empty queue', async () => {
    try {
      await service._processQueuedEvents();
    } catch (error) {
      expect(false).to.equal(true, `_processQueuedEvents() unexpectedly returned '${error.name}', '${error.message}'.`);
    }
  });

  it('_processQueuedEvents handles error from remote', async () => {
    let data = [ {name: '1'}, {name: '2'}, {name: '3'} ];
    setUpHooks('REMOTE', path, service.remote, true);

    return service.create(data, {query:{_fail: true}})
      .then(delay())
      .then(created => {
        expect(created.length).to.equal(3, 'Incorrect number of items created!');
      })
      .then(async () => {
        try {
          await service._processQueuedEvents();
        } catch (error) {
          expect(false).to.equal(true, `_processQueuedEvents() unexpectedly returned '${error.name}', '${error.message}'.`);
        }
      })
    });

    it('getEntries works', async () => {
        let data = [ {name: '1'}, {name: '2'}, {name: '3'} ];

        return service.create(data)
          .then(delay())
          .then(created => {
            expect(created.length).to.equal(3, 'Incorrect number of items created!');
            for (let i=0; i<3; i++)
              expect(created[i].name).to.equal(data[i].name, `Expected created '${created[i].name}' to equal data '${data[i].name}, i=${i}'!`);
          })
          .then(() => service.getEntries())
          .then(delay())
          .then(entries => {
            expect(entries.length).to.equal(3, 'Incorrect number of entries found!');
            for (let i=0; i<3; i++)
              expect(entries[i].name).to.equal(data[i].name, `Expected entries '${entries[i].name}' to equal data '${data[i].name}, i=${i}'!`);
          })
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
 * This sets up a before (and error) hook for all functions for a given service. The hook
 * can simulate e.g. backend failure, network connection troubles, or timeout by supplying
 * ```{query: {_fail:true}}``` to the call options.
 * If `_fail` is false or the query is not supplied all this hook is bypassed.
 *
 * @param {string} type Typically 'Remote' or 'Client'
 * @param {string} service The service to be hooked into
 * @param {boolean} allowFail Will we allow the usage of _fail? (Default false)
 */
function setUpHooks(type, serviceName, service, allowFail = false) {

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
            if (context.params.query._badFail) { // Passing in param _badFail simulates other error than timeout
              throw new errors.GeneralError('Fail requested by user request - simulated general error');
            }
          }
          // In case _fail/_badFail was supplied but not true and allowed - remove it before continuing
          let newQuery = Object.assign({}, context.params.query);
          delete newQuery._fail;
          delete newQuery._badFail;
          context.params.query = newQuery;
          return context;
        }
      }
      ]
    }
  });
}
