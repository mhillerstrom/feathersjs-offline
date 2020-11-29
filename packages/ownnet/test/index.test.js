//'use strict';
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const adapterTests = require('../../own-common/test/helpers/adapter.test');
const wrapperBasic = require('../../own-common/test/helpers/wrapper-basic.test');
const ownWrapper = require('../../own-common/test/helpers/own-wrapper.test');
const syncTests = require('../../own-common/test/helpers/sync.test');
const eventsTests = require('@feathersjs-offline/own-common/test/helpers/events.test');
const { Ownnet, ownnetWrapper } = require('../src');

let package = 'ownnet';
let verbose = false;
let app;

describe(`${package}Wrapper tests`, () => {
  app = feathers();
  let testTitle = `${package}Wrapper adapterTests`
  adapterTests(testTitle, app, errors, ownnetWrapper, 'people');
  adapterTests(testTitle, app, errors, ownnetWrapper, 'people-customId', 'customId');
  adapterTests(testTitle, app, errors, ownnetWrapper, 'people-uuid', 'uuid');

  wrapperBasic(`${package}Wrapper basic functionality`, app, errors, ownnetWrapper, 'wrapperBasic', verbose);
  ownWrapper(`${package}Wrapper specific functionality`, app, errors, ownnetWrapper, 'ownWrapper', verbose);
  syncTests(`${package}Wrapper sync functionality`, app, errors, Ownnet, 'syncTests', verbose);
  eventsTests(`${package}Wrapper events functionality`, app, errors, ownnetWrapper, 'wrapperEvents', verbose);

})
