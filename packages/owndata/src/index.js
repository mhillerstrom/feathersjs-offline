// const errors =('feathers-errors');
const makeDebug = require('debug');

// if (!global._babelPolyfill) { require('babel-polyfill'); }

const debug = makeDebug('myPlugin');

class Service {
  constructor (app, options = {}) {
    debug(`constructor called with options = ${JSON.stringify(options)}`);
    this.options = options;

    debug(`app version = ${app.version}`);
    debug(`app socketio = ${app.io.connected} ${app.io.disconnected}`);
    if (!Service.handlerInstalled) {
      if (typeof feathers === 'undefined') {
        if (typeof window !== 'undefined') {
          window.feathers = app
          window.auth = {currentUser: null} // TODO: remove
        } else {
          global.feathers = app
          global.auth = {currentUser: null} // TODO: remove
        }
        feathers.isOnline = false
      }

      app.io.on('connect_error', Service.handleConnectionEvents('connect_error'))
      app.io.on('connect_timeout', Service.handleConnectionEvents('connect_timeout'))
      app.io.on('connect', Service.handleConnectionEvents('connect'))
      Service.handlerInstalled = true;
    }
    return this;
  }
}

function init (options) {
  debug(`init: options = ${JSON.stringify(options)}`);
  return (app) => {
    if (typeof app === 'undefined') {
      app = options;
      options = undefined;
    }
    return new Service(app,options);
  }
}

module.exports = init;

Service.remoteServices = [];
Service.handlerInstalled = false;

init.Service = Service;

// const handleConnectionEvents = (eventTxt) => (event) => {
//   console.log(`handleConnectionEvents(${eventTxt})() called...`)
//   if (eventTxt === 'connect_error' || eventTxt === 'connect_timeout') {
//     app.isOnline = false
//   }
//   if (eventTxt === 'connect') {
//     app.isOnline = true
//   }
//   notify.warning(`app.isOnline=${app.isOnline}`)
//   app.emit('FeathersIsOnline', app.isOnline)
// }

Service.remoteServices = [];
Service.handleConnectionEvents = (eventTxt) => function (value) {
  let user = 'no one'
  if (auth.currentUser && auth.currentUser.email) {
    user = auth.currentUser.email
  }

  debug(`==> Enter: handleConnectionEvent: value=${JSON.stringify(value)}, auth.currentUser=${user}, ${Service.remoteServices.length} endpoint(s)`)
  if (feathers.isOnline && auth.currentUser) {
    debug(`==> handleConnectionEvent: value=${value}, auth.currentUser=${user}`)
    Service.remoteServices = [];

  Service.remoteServices.forEach((service) => {
      debug(`===== Connect of endpoint '${service.name}'...\nquery: ${JSON.stringify(service.queryFn())}`)
      service.handle.connect(service.queryFn())
      .then(() => debug(`===== Connect of endpoint ${service.name} successful!`))
        .catch((err) => debug(`===== Connect of endpoint ${service.name} failed!!!!`, err))
    })
  }

  if (/*! feathers.isOnline || */ !auth.currentUser) {
    debug(`==> handleConnectionEvent: value=${JSON.stringify(value)}, auth.currentUser=${user}, ${Service.remoteServices.length} endpoint(s)`)
    Service.remoteServices.forEach((service) => {
      debug(`===== Disconnect endpoint ${service.name}...`)
      service.handle.disconnect()
    })
  }
}
