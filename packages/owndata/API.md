# First layout
````js
const feathers = require('@feathersjs/feathers');
const storage = require('feathers-localstorage');
const {
  Owndata,
  EndpointOffline,
  EndpointLocal,
  EndpointRemote
} = require('@feathersjs-offline/owndata');

const app = feathers();

app.use('/localdb',
        storage({ multi: true, name: 'sb', storage: localStorage, startId: 10 }));

const api = {
  messages: EndpointOffline(
              'messages',
              {uuid: 'uuid', updatedAt: 'updatedAt'},
              () => { return {userId: [
                                ObjectId(auth.currentUser._id),
                                ObjectId('10000000000000000000002')
                              ]}
                    }
            ),
  users: EndpointRemote('users'),
  sandbox: EndpointLocal('localdb')
};

let [err, res] = await api.messages.create({name: 'John', gender: 'male'});
[err, res] = await api.sandbox.create({name: 'Lassie', animal: 'dog'});

app.service('localdb').find()
  .then(res => console.log(`localdb records: ${JSON.stringify(res)}`))
  .catch(err => console.error(`localdb find error: err = ${JSON.stringify(err)}`));

````
# Second layout
````js
const feathers = require('@feathersjs/feathers');
const storage = require('feathers-localstorage');
const {
  Owndata,
  EndpointOfflineRaw,
  EndpointLocalRaw,
  EndpointRemoteRaw,
  to
} = require('@feathersjs-offline/owndata');

const app = feathers();

app.use('/localdb',
        storage({ multi: true, name: 'sb', storage: localStorage, startId: 10 }));

const api = {
  messages: EndpointOfflineRaw(
              'messages',
              {uuid: 'uuid', updatedAt: 'updatedAt'},
              () => { return {userId: [
                                ObjectId(auth.currentUser._id),
                                ObjectId('10000000000000000000002')
                              ]}
                    }
            ),
  users: EndpointRemoteRaw('users'),
  sandbox: EndpointLocalRaw('localdb')
};

api.messages.create({name: 'John', gender: 'male'})
  .then(res => console.log(`messages create: ${JSON.stringify(res)}`))
  .catch(err => console.error(`messages create error: err = ${JSON.stringify(err)}`));

let [err, res] = await to( api.messages.create({name: 'Jane', gender: 'female'}) );
if(res)
  console.log(`messages create: ${JSON.stringify(res)}`)
else
  console.error(`messages create error: err = ${JSON.stringify(err)}`);

api.sandbox.create({name: 'Lassie', animal: 'dog'})
  .then(res => console.log(`sandbox(localdb) records: ${JSON.stringify(res)}`))
  .catch(err => console.error(`sandbox(localdb) find error: err = ${JSON.stringify(err)}`));

app.service('localdb').find()
  .then(res => console.log(`localdb(sandbox) records: ${JSON.stringify(res)}`))
  .catch(err => console.error(`localdb(sandbox) find error: err = ${JSON.stringify(err)}`));

````

# Fourth set-up
````js
import feathers from 'feathersjs/feathers';
import storage from 'feathers-localstorage';
import serviceWrapper from '@feathersjs-offline/owndata';

const app = feathers();

app.configure(registerOwndataService);
registerOwndataService('/messages', storage, { name: 'msg', storage: localStorage, multi: true, startId: 100 });

app.use('/messages',
        wrappedStorage({ name: 'msg', storage: localStorage, multi: true, startId: 100 }));

// Usage examples
app.service('messages').create({name: 'John', gender: 'male'})
  .then(res => console.log(`messages create: ${JSON.stringify(res)}`))
  .catch(err => console.error(`messages create error: err = ${JSON.stringify(err)}`));

let [err, res] = await to( app.service('messages').create({name: 'Jane', gender: 'female'}) );
if(res)
  console.log(`messages create: ${JSON.stringify(res)}`)
else
  console.error(`messages create error: err = ${JSON.stringify(err)}`);

... other client code
````

# Third set-up
````js
import feathers from 'feathersjs/feathers';
import storage from 'feathers-localstorage';
import serviceWrapper from '@feathersjs-offline/owndata';

const app = feathers();

app.use('/messages',
        storage({ name: 'msg', storage: localStorage, multi: true, startId: 100 }));
serviceWrapper(app, app.service('messages'), { multi: true, startId: 100 );

// Usage examples
app.service('messages').create({name: 'John', gender: 'male'})
  .then(res => console.log(`messages create: ${JSON.stringify(res)}`))
  .catch(err => console.error(`messages create error: err = ${JSON.stringify(err)}`));

let [err, res] = await to( app.service('messages').create({name: 'Jane', gender: 'female'}) );
if(res)
  console.log(`messages create: ${JSON.stringify(res)}`)
else
  console.error(`messages create error: err = ${JSON.stringify(err)}`);

... other client code
````

# Server set-up
````js
const feathers = require('@feathersjs/feathers');
const storage = require('feathers-memory');
const {
  RealtimeServiceWrapper,
  to
} = require('@feathersjs-offline/server');
const RealtimeService = RealtimeServiceWrapper(storage);

const app = feathers();

app.use('/messages', RealtimeService({ multi: true }));
app.use('/users', storage({ multi: true }));

// Usage examples - nothing out of the ordinary
app.service('users').create([ {name: 'John', gender: 'male'}, {text: 'Olivia', gender: 'female'} ])
  .then(res => console.log(`Successfully created 2 records: ${JSON.stringify(res)}`))
  .catch(err => console.error(`I'm totally at a loss - what happened: ${JSON.stringify(err)}`))

app.service('messages').create([ {text: 'Tarzan - King of the Jungle', gender: 'male'}, {text: 'Jane saves the day', gender: 'female'} ])
  .then(res => console.log(`Successfully created 2 records: ${JSON.stringify(res)}`))
  .catch(err => console.error(`I'm totally at a loss - what happened: ${JSON.stringify(err)}`))

let [err, res] = await to( app.service('messages').find({query: {gender: 'female'}}) )
if (err) {
  console.error(`Problems encountered looking for female messages: ${JSON.stringify(err)}`)
}
else {
  console.log(`Successfully found: ${JSON.stringify(res)}`)
}


... other set-up stuff for server
````

# Synchronization
On the client we maintain the latest `updatedAt` for every change. Whenever we synchronize with the server we maintain `syncedAt`.

The server maintains a `onServerAt` which is used for optimizing traffic between client and server.

The programmer can ask the service to sync with the server (with `app.service('offlineservice').sync()`), however, after all successful interactions with the server DB we check for any non-synced records and performs update accordingly until connection is lost or the queue is empty (`own-data`/`own-net`).
