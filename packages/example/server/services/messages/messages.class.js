const memory = require('feathers-memory');
// const RealtimeServiceWrapper = require('@feathersjs-offline/server');
const RealtimeServiceWrapper = require('../../../node_modules/@feathersjs-offline/server/lib/server');
const RealtimeService = RealtimeServiceWrapper(memory);

// eslint-disable-next-line no-unused-vars
const Messages = RealtimeService.Service;

module.exports = { Messages };
