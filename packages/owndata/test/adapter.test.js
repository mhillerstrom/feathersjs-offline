'use strict';
const feathers = require('@feathersjs/feathers');
const errors =  require('@feathersjs/errors');
const adapterTests = require('@feathersjs/adapter-tests');
const memory = require('feathers-memory');
const { owndataWrapper } = require('../src');

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
  '.update + query + NotFound',
  '.update + id + query id',
  '.patch',
  '.patch + $select',
  '.patch + id + query',
  '.patch multiple',
  '.patch multi query same',
  '.patch multi query changed',
  '.patch + NotFound',
  '.patch + query + NotFound',
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

describe('OwndataWrapper - adapterTest', () => {
  beforeEach(() => {
  });

  // Let's perform all the usual adapter tests to verify full functionality
  let app = feathers();
  const events = ['testing'];

  app.use('people', memory({ events }));
  owndataWrapper(app, 'people', {adapterTest: true, store: {}});
  testSuite(app, errors, 'people');

  app.use('people-customid', memory({ events, id: 'customid' }));
  owndataWrapper(app, 'people-customid', {adapterTest: true, store: {}});
  testSuite(app, errors, 'people-customid', 'customid');

  app.use('people-uuid', memory({ events, id: 'uuid' }));
  owndataWrapper(app, 'people-uuid', {adapterTest: true, store: {}});
  testSuite(app, errors, 'people-uuid', 'uuid');
});
