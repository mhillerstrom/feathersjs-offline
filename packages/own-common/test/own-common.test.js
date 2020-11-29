//'use strict';
const feathers = require('@feathersjs/feathers');
const { stripSlashes } = require('@feathersjs/commons');
const errors = require('@feathersjs/errors');
const adapterTests = require('./helpers/adapter.test');
const wrapperBasic = require('./helpers/wrapper-basic.test');
const ownWrapper = require('./helpers/own-wrapper.test');
const syncTests = require('./helpers/sync.test');
const eventsTests = require('./helpers/events.test');
const localStorageTests = require('./helpers/local-storage.test');
const OwnClass = require('../src');

let package = 'ownclass';
let verbose = false;
let app;

// OwnClass is not as such expected to be used as a wrapper,
// but we can coerce it in the name of rigorous testing
class OwnclassClass extends OwnClass {
  constructor (opts = {}) {
    super(opts);
    this.type = 'own-class';
    this.__forTestingOnly = super._processQueuedEvents;
  }

  async _processQueuedEvents () {
    return Promise.resolve(true);
  }
}

function ownclassWrapper (app, path, options = {}) {
  if (!(app && app.version && app.service && app.services) ) {
    throw new errors.Unavailable(`The FeathersJS app must be supplied as first argument`);
  }

  let location = stripSlashes(path);

  let old = app.services[location];
  if (typeof old === 'undefined') {
    throw new errors.Unavailable(`No prior service registered on path '${location}'`);
  }

  let opts = Object.assign({}, old.options, options);
  app.use(location, new OwnclassClass(opts, true));
  app.services[location].options = opts;
  app.services[location]._listenOptions();

  return app.services[location];
}

const init = options => {return new OwnclassClass(options)};
init.Service = OwnclassClass;

describe(`${package}Wrapper tests`, () => {
  app = feathers();
  let testTitle = `${package}Wrapper adapterTests`
  adapterTests(testTitle, app, errors, ownclassWrapper, 'people');
  adapterTests(testTitle, app, errors, ownclassWrapper, 'people-customId', 'customId');
  adapterTests(testTitle, app, errors, ownclassWrapper, 'people-uuid', 'uuid');

  wrapperBasic(`${package}Wrapper basic functionality`, app, errors, ownclassWrapper, 'wrapperBasic', verbose);
  ownWrapper(`${package}Wrapper specific functionality`, app, errors, ownclassWrapper, 'ownWrapper', verbose, true);
  syncTests(`${package}Wrapper sync functionality`, app, errors, init, 'syncTests', verbose, true);
  eventsTests(`${package}Wrapper events functionality`, app, errors, ownclassWrapper, 'wrapperEvents', verbose);
  localStorageTests(`${package}Wrapper storage functionality`, app, errors, ownclassWrapper, 'wrapperStorage', verbose);

})
