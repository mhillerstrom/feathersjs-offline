//'use strict';
const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const errors = require('@feathersjs/errors');
const adapterTests = require('@feathersjs-offline/own-common/test/helpers/adapter.test');
const wrapperBasic = require('@feathersjs-offline/own-common/test/helpers/wrapper-basic.test');
const ownWrapper = require('@feathersjs-offline/own-common/test/helpers/own-wrapper.test');
const syncTests = require('@feathersjs-offline/own-common/test/helpers/sync.test');
const { Owndata, owndataWrapper } = require('../src');

let package = 'owndata';
let verbose = false;
let app;


describe(`${package}Wrapper tests`, () => {
  app = feathers();
  let testTitle = `${package}Wrapper adapterTests`
  adapterTests(testTitle, app, errors, owndataWrapper, 'people');
  adapterTests(testTitle, app, errors, owndataWrapper, 'people-customId', 'customId');
  adapterTests(testTitle, app, errors, owndataWrapper, 'people-uuid', 'uuid');

  wrapperBasic(`${package}Wrapper basic functionality`, app, errors, owndataWrapper, 'wrapperBasic', verbose);
  ownWrapper(`${package}Wrapper specific functionality`, app, errors, owndataWrapper, 'ownWrapper', verbose);
  syncTests(`${package}Wrapper sync functionality`, app, errors, Owndata, 'syncTests', verbose);

})
