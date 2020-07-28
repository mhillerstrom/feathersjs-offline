const { expect } = require('chai');
const feathers = require('@feathersjs/feathers');
const memory = require('feathers-memory');
const socketio = require('@feathersjs/socketio-client');
const io = require('socket.io-client');
const plugin = require('../lib');

let app;

function services1 () {
  app.configure(fromServiceNonPaginatedConfig);
}

function fromServiceNonPaginatedConfig () {
  app.use('/from', memory({ multi: true }));
}

describe('plugin-test', () => {
  let socket;

  beforeEach(() => {
    socket = io('http://localhost:3030');
  });

  it('basic functionality', () => {
    app = feathers();
    expect(typeof plugin).to.equal('function', 'Is function?');
    expect(typeof plugin({ opt1: 1, opt2: 'two' })).to.equal('function');
  });

  it('configure (default)', () => {
    app = feathers()
    .configure(socketio(socket))
    .configure(services1)
    .configure(plugin({}));
  });

  it('configure (with options)', () => {
    app = feathers()
      .configure(socketio(socket))
      .configure(services1)
      .configure(plugin({ opt5: 5, opt6: 'six' }));
  });
});
