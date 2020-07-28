const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors =  require('@feathersjs/errors');
const adapterTests = require('@feathersjs/adapter-tests');
const memory = require('feathers-memory');
const { owndataWrapper } = require('../src');

let app;
let ix = 0;

function newServicePath () {
  return 'from' + ++ix;
}
function services1 (path) {
  fromServiceNonPaginatedConfig(path);
}

function services2 (path) {
  app.use(path, memory({ multi: true }));
  return owndataWrapper(app, app.service(path), { multi: true, trackMutations: false });
}

function fromServiceNonPaginatedConfig (path) {
  app.use(path, memory({ multi: true }));
  return owndataWrapper(app, app.service(path), { multi: true });
}

const testSuite = adapterTests([
  '.options',
  '.events',
  '._get',
  '._find',
  '._create',
  '._update',
  '._patch',
  '._remove',
  '.get',
  '.get + $select',
  '.get + id + query',
  '.get + NotFound',
  '.get + id + query id',
  '.find',
  '.remove',
  '.remove + $select',
  '.remove + id + query',
  '.remove + multi',
  '.remove + id + query id',
  '.update',
  '.update + $select',
  '.update + id + query',
  '.update + NotFound',
  '.update + id + query id',
  '.patch',
  '.patch + $select',
  '.patch + id + query',
  '.patch multiple',
  '.patch multi query',
  '.patch + NotFound',
  '.patch + id + query id',
  '.create',
  '.create + $select',
  '.create multi',
  'internal .find',
  'internal .get',
  'internal .create',
  'internal .update',
  'internal .patch',
  'internal .remove',
  '.find + equal',
  '.find + equal multiple',
  '.find + $sort',
  '.find + $sort + string',
  '.find + $limit',
  '.find + $limit 0',
  '.find + $skip',
  '.find + $select',
  '.find + $or',
  '.find + $in',
  '.find + $nin',
  '.find + $lt',
  '.find + $lte',
  '.find + $gt',
  '.find + $gte',
  '.find + $ne',
  '.find + $gt + $lt + $sort',
  '.find + $or nested + $sort',
  '.find + paginate',
  '.find + paginate + $limit + $skip',
  '.find + paginate + $limit 0',
  '.find + paginate + params'
]);

describe('Owndata-test', () => {

  beforeEach(() => {
  });

  // Let's perform all the usual adapter tests to verify full functionality
  app = feathers();
  const events = ['testing'];

  app.use('/people', memory({ events }));
  owndataWrapper(app, app.service('people'), { adapterTest: true, clearStorage: true });
  // testSuite(app, errors, 'people');

  app.use('/people-customid', memory({ id: 'customid', events }));
  owndataWrapper(app, app.service('people-customid'), { adapterTest: true, clearStorage: true });
  // testSuite(app, errors, 'people-customid', 'customid');


  describe('Wrapper specific functionality', () => {
    it('basic functionality', () => {
      app = feathers();
      expect(typeof owndataWrapper).to.equal('function', 'Is function?');
      let path = newServicePath();
      let obj = fromServiceNonPaginatedConfig(path);
      expect(typeof obj).to.equal('object', 'Is object?');
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
      app.use('/tmp', memory());
      owndataWrapper(app, app.service('tmp')/*, { clearStorage: true }*/);
      let service = app.service('tmp');

      return service.create({ id: 99, order: 99 } /*, {query: {_fail: true}}*/)
        .then(data => {
          console.log(`First test: data = ${JSON.stringify(data)}`);
          expect(typeof data.uuid).to.equal('string', 'uuid was added');
          expect(typeof data.updatedAt).to.equal('string', 'updatedAt was added');
          expect(typeof data.onServerAt).to.equal('number', 'onServerAt was added');
        })
        .then(() => service.sync())
        .then(delay())
        .then(() => service.find({query:{id: 99}}))
        .then(res => {
          console.log(`Second test: res = ${JSON.stringify(res)}`);
          expect(typeof res[0].uuid).to.equal('string', 'uuid was added');
          expect(typeof res[0].updatedAt).to.equal('string', 'updatedAt was added');
          expect(typeof res[0].onServerAt).to.equal('string', 'onServerAt was updated');
        })
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
