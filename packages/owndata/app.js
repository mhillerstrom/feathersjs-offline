// Testing as an app...
const feathers = require('@feathersjs/feathers');
const socketio = require('@feathersjs/socketio-client');
const io = require('socket.io-client');
const ls = require('feathers-localstorage');
const { serviceWrapper } = require('./src');
// const { genUuid, to } = require('@feathersjs-offline/common');
const localStorage = require('./localStorage');

const socket = io('http://localhost:9999');

let app = feathers();
app.configure(socketio(socket));

// Some definitions to avoid building a full system
let auth = {currentUser: {_id:1}};
let ObjectId = function (arg) {};

// Initialize the localStorage keys ('sb' and 'sb2') to pre-fill the databases
localStorage.setItem('sb', JSON.stringify({0: {name: 'Sandbox', gender: 'no gender', id: 0}}) );
localStorage.setItem('sb2', JSON.stringify({0: {name: 'Sandbox2', gender: 'no gender', id: 0}, 1: {name: 'Sandbox2', gender: 'no gender', id: 1}}) );
localStorage.setItem('off-messages', '');

// Define the services
app.use('/sandbox', ls({ multi: true, name: 'sb', storage: localStorage, startId: 10 }));
app.use('/sandbox2', ls({ multi: true, name: 'sb2', storage: localStorage, startId: 20 }));

// Initialize the offline (owndata) wrapper
app.configure(Owndata({prefix: ''}));

// Define the api
const api = {
  messages: new EndpointOffline('messages', {uuid: 'uuid', updatedAt: 'updatedAt'},
              () => { return { userId: [ ObjectId(auth.currentUser._id),
                                  ObjectId('100000000000000000000002')
                                ]
                      }
                    }
            ),
  users: new EndpointRemote('users'),
  sandbox: new EndpointLocal('sandbox'),
  sandbox2: new EndpointLocal('sandbox2')
}

// Let's test the services
const testLocal = async function () {
  // First we see any records already in 'sandbox'
  let [err, res] = await api.sandbox.find();
  console.log(`Find all from sandbox: ${JSON.stringify(res)}`);

  // Next we add some documents to 'sandbox'
  [err, res] = await api.sandbox.create(
    [ {name: 'Tarzan', gender: 'male'},
      {name: 'Jane', gender: 'female'}
    ]);
  if (err) {
  console.error(`Error creating sandbox data: err = ${JSON.stringify(err)}`);
  throw new Error('Shouldn\'t happen!');
  }
  else
    console.log(`Created locally: ${JSON.stringify(res)}`);

  // Next we add some documents to 'sandbox2'
  [err, res] = await api.sandbox2.create(
    [ {name: 'Batman', gender: 'male'},
      {name: 'Robin', gender: 'male'}
    ]);
  if (err) {
  console.error(`Error creating sandbox data: err = ${JSON.stringify(err)}`);
  throw new Error('Shouldn\'t happen!');
  }
  console.log(`Created locally: ${JSON.stringify(res)}`);

  // Now we display the documents from 'sandbox' and 'sandbox2'
  [err, res] = await api.sandbox.find({query:{gender: 'male'}});
  console.log(`Gender male from sandbox: ${JSON.stringify(res)}`);

  [err, res] = await api.sandbox2.find();
  console.log(`All items from sandbox2: ${JSON.stringify(res)}`);

  // =========================================
  // Now for the real stuff

  // Here we lookup any existing messages
  [err, res] = await api.messages.find();
  console.log(`Find all from messages I: ${JSON.stringify(res)}`);

  // Now let's create a couple
  [err, res] = await api.messages.create(
    [ {title: 'Tarzan', text: 'He is a male'},
      {title: 'Jane', text: 'She is a female'}
    ]);
  if (err) {
    console.error(`Error creating messages data I: err = ${JSON.stringify(err)}`);
    throw new Error('Shouldn\'t happen!');
  }

  // Let's display localStorage
  console.log(`localStorage I:\n${JSON.stringify(localStorage.toString(), null, 2)}`);

  // Let's create yet another document in 'messages'
  [err, res] = await api.messages.create({'title': 'Arrow', 'text': 'He is a male'});
  if (err) {
    console.error(`Error creating messages data II: err = ${JSON.stringify(err)}`);
    throw new Error('Shouldn\'t happen!');
  }
  [err, res] = await api.messages.find();
  console.log(`Find all from messages II: ${JSON.stringify(res)}`);

  // Let's display localStorage
  console.log(`localStorage II:\n${JSON.stringify(localStorage.toString(), null, 2)}`);

  return res;
};

testLocal()
  .then(async res => {
    // Make sure all changes are committed to LocalStorage (feathers-localstorage throttle defaults to 200ms)
    await new Promise(resolve => setTimeout(resolve, 200))

    // Let's see the final result of testLocal() (api.messages.find())
    console.log(`testLocal res=${JSON.stringify(res)}`);

    // Let's display localStorage
    console.log(`localStorage III:\n${JSON.stringify(localStorage.toString(), null, 2)}`);

    process.exit();
  })
  .catch(err => {
    err = err;
    console.error(`testLocal caught err=${parseErrors(err, true)}`)
    process.exit();
  })

  // Utility function
  const parseErrors = function parseErrors (err, showStack = false) {
    if (err.name) {
      if (!showStack) {
        return err.message
      }
      return err.message + '\n' + err.stack;
    } else {
      return _.map(_.get(err, 'errors', []), err =>
        err.message
          .replace('Path ', '')
          .replace('`', '')
          .replace('`', ''))
        .join('<br>')
    }
  }
