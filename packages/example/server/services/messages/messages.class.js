const /*{ Service }*/ Service = require('feathers-memory');
// const RealtimeServiceWrapper = require('@feathersjs-offline/server');
const RealtimeServiceWrapper = require('../../../node_modules/@feathersjs-offline/server/lib/server');
const RealtimeService = RealtimeServiceWrapper(Service);

// eslint-disable-next-line no-unused-vars
class Messages extends RealtimeService.Service {

}

module.exports = { Messages };
