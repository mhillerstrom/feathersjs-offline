const { genUuid, hash, hashOfRecord, isObject, stripProps, to } = require('@feathersjs-offline/common');
// const { realtimeWrapper, Realtime } = require('@feathersjs-offline/server');
const { owndataWrapper, Owndata } = require('@feathersjs-offline/owndata');
const { ownnetWrapper, Ownnet } = require('@feathersjs-offline/ownnet');

module.exports = {
  // realtimeWrapper, Realtime,
  owndataWrapper, Owndata,
  ownnetWrapper, Ownnet,
  genUuid, hash, hashOfRecord, isObject, stripProps, to
}
