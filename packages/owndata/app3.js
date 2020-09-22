const feathers = require('@feathersjs/feathers');
const memory = require('feathers-memory');
const { owndataWrapper } = require('./lib/owndata-wrapper');

function debug (txt) {
  console.log(txt);
}

const getServicePath = function (app, service) {
  // Running in client?
  if (typeof service.path !== 'undefined')
    return service.path;

  // No, we'r on a server
  for (let sn in app.services)
    if (app.services[sn] === service) return sn;

  return 'unknown';
};

let appHandle = null;

const OwndataWrapper = (path, cls, options = {}) => {
  if (path && path.version) {
    // We have been called through app.configure() and path is in fact 'app'
    appHandle = path;
    return path;
  }

  if (appHandle === null) {
    throw new Error(`Bad usage: OwndataWrapper must be configured like: app.configure(OwndataWrapper('mypath', {}));`);
  }

  if (!cls) {
    throw new Error(`Bad usage: class for service on path '${path} must be supplied to OwndataWrapper.`);
  }
  if (cls && cls.Service && cls.Service.prototype.isPrototypeOf('AdapterService')) {
    throw new Error(`Bad service: Cannot wrap the service supplied for path '${path}`);
  }

  let serviceClass = class extends cls.Service {
    constructor (options = {}) {
      debug('Constructor started');
      super(options);
      let app = appHandle;
      this.path = path;
    }

    async myspec (greet) {
      return { greet, who: 'my dear friend!' };
    }
  };

  appHandle.use(path, new serviceClass(options));
  return app;
}

app = feathers();

const events = ['testing'];

app.use('/allpeople',memory({ events }));
const apService = app.service('allpeople');

app.configure(OwndataWrapper);
OwndataWrapper('/people', memory, { events });
const pService = app.service('people');
//app.configure(OwndataWrapper('people', { adapterTest: true, clearStorage: true }))

app.service('people').create({name:'xyz', type: 'test'})
  .then(res => console.log(`found res=${JSON.stringify(res)}`))
  .catch(err => console.error(`Got error: name = ${err.name}, message = ${err.message}`))

app.service('people').myspec('Hello Michael')
  .then(res => console.log(`found res=${JSON.stringify(res)}`))
  .catch(err => console.error(`Got error: name = ${err.name}, message = ${err.message}`))

  console.log(`apService path = ${getServicePath(app, apService)}`);
  console.log(`pService  path = ${getServicePath(app,  pService)}`);
