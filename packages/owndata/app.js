// Testing as an app...

const feathers = require('@feathersjs/feathers');
//const express = require('@feathersjs/express')
const socketio = require('@feathersjs/socketio-client');
const io = require('socket.io-client');
const memory = require('feathers-memory');
const plugin = require('./lib');
const socket = io('http://localhost:3030');

let app = feathers();
//let app = express(feathers());
app.configure(socketio(socket));

app.use('/from', memory({ multi: true }));
// app.use('/hidden/plugin', plugin({option: 'What\'s for dinner?'}));
app.configure(new plugin({opt1: 'Kylling med softice og pølser', opt2: 'MacArine'}));
app.configure(new plugin({opt3: 'Vuffelivov', opt4: 'Minus til plus'}));
//app.use('/hidden/plugin', plugin({option: 'What\'s for dinner?'}));

//let server = app.listen(3030);

// server.on('listening', async () => {
//   console.log('Now running on http://localhost:3030.......');
// });
