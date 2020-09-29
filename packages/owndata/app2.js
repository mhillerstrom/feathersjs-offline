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

const OwndataWrapper = (path, cls, options = {}) => {
  if (!cls) {
    throw new Error(`Bad usage: class for service on path '${path} must be supplied to OwndataWrapper.`);
  }
  if (cls && cls.Service && cls.Service.prototype.isPrototypeOf('AdapterService')) {
    throw new Error(`Bad service: Cannot wrap the service supplied for path '${path}`);
  }
  return app => {
    if (app === null || !(app && app.version)) {
      throw new Error(`Bad usage: OwndataWrapper must be configured like: app.configure(OwndataWrapper('mypath', serviceclass, options));`);
    }

    let serviceClass = class extends cls.Service {
      constructor (options = {}) {
        debug('Constructor started');
        super(options);
       this.path = path;
      }

      async myspec (greet) {
        return { greet, who: 'my dear friend!' };
      }
    };

    app.use(path, new serviceClass(options));
    return app;
  }
}

app = feathers();

const events = ['testing'];

app.use('/allpeople', memory({ events }));
const apService = app.service('allpeople');

app.use('/people', memory({ events /* , paginate: {default: 1, max: 2} */ }));
owndataWrapper(app, 'people', {multi: true, clearStorage: true});
const pService = app.service('people');

app.service('people').create([{name: 'abc', type: 'demo'}, {name: 'def', type: 'production'}, {name:'xyz', type: 'test'}])
  .then(res => console.log(`created1 res=${JSON.stringify(res)}`))
  .catch(err => console.error(`Got error1: name = ${err.name}, message = ${err.message}`))
  .then(() => app.service('people').options.paginate = {
    default: 1,
    max: 2
  })
  .then(() => {
    app.service('people').find({
      query: { $sort: { name: -1 } }
    })
    .then(res => console.log(`found2 res=${JSON.stringify(res)}`))
    .catch(err => console.error(`Got error2: name = ${err.name}, message = ${err.message}`))
  });

    console.log(`apService path = ${getServicePath(app, apService)}`);
  console.log(`pService  path = ${getServicePath(app,  pService)}`);
