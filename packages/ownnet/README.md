# @feathersjs-offline/ownnet

[![Build Status](https://travis-ci.org/mhillerstrom/feathersjs-offline-ownnet.png?branch=master)](https://travis-ci.org/mhillerstrom/feathersjs-offline-ownnet)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-ownnet/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-ownnet)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-ownnet/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-ownnet/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathersjs-offline-ownnet.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathersjs-offline-ownnet)
[![Download Status](https://img.shields.io/npm/dm/feathersjs-offline-ownnet.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-offline-ownnet)
[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lerna.js.org/)

> Offline-first own-net replication with optimistic updates.


> I have a sample Quasar-Cordova-FeathersJS-MongoDB [app](https://github.com/mhillerstrom/Quasar-Cordova) showcasing `@feathersjs-offline/owndata`. It's still not complete, but it will show offline ability.

## Installation

```bash
$ npm install @feathersjs-offline/ownnet --save
```
## API

```js
Ownnet([options])
```
Returns a new service instance initialized with the given options.

```js
import { Ownnet } from '@feathersjs-offline/ownnet');

app.use('/messages', Ownnet());
app.use('/messages', Ownnet({ id, events, paginate }));
````

or

```js
ownnetWrapper(app, path, [options])
```
Returns a new wrapped service instance initialized with the given options.

```js
import memory from 'feathers-memory');
import { ownnetWrapper } from '@feathersjs-offline/ownnet');

// Wrap local db with own-data
app.use('/messages', memory());
ownnetWrapper(app, 'messages');

// Wrap local db with own-data (and special options)
app.use('/messages', memory());
ownnetWrapper(app, 'messages', { id, events, paginate }));

// Wrap server path `snippets`. (No prior `app.use('snippets', ...);` )
ownnetWrapper(app, 'snippets');
````

### Options:
All options available for the wrapped adapter can be used in addition to:

- `id` (optional, default: 'id') - The name of the id field property.
- `events` (optional) - A list of custom service events sent by this service.
- `paginate` (optional) - A pagination object containing a default and max page size.
- `whitelist` (optional) - A list of additional query parameters to allow.
- `multi` (optional) - Allow create with arrays and update and remove with id null to change multiple items. Can be true for all methods or an array of allowed methods (e.g. [ 'remove', 'create' ]).
- `useShortUuid` (optional, default `true`) - Generate short `uuid`s. If `false` long `uuid`s are generated. This option should match whatever you choose on the client.
- `adapterTest` (optional, default `false`) - This is usually only used for running adapter tests as it suppresses the generation of `uuid`, and updating of `onServerAt`.

### Example
Here is an example of a FeathersJS client with a messages own-net service that supports pagination:

```bash
$ npm install @feathersjs/feathers @feathersjs/express @feathersjs/socketio @feathersjs/errors feathers-memory @feathersjs-offline/ownnet
```

In app.js:

```js
const feathers = require('@feathersjs/feathers');
const io = require('socket.io-client');
const port = 3030;
const socket = io(`http://localhost:${port}`);
const socketio = require('@feathersjs/socketio-client');
const io = require('@feathersjs/socketio');
const { Ownnet } = require('@feathersjs-offline/ownnet');

// Create an Express compatible Feathers application instance.
const app = feathers();

// Configure socketio 
app.configure(socketio(socket));

// Create an own-net FeathersJS service with a default page size of 2 items
// and a maximum size of 4
app.use('/messages', Ownnet({
  paginate: {
    default: 2,
    max: 4
  }
}));

// Create a silly Message
app.service('messages').create({
  text: 'Message created on client'
}).then(message => console.log('Created message', message));
```

Run the example together with the example in `@feathersjs-offline/server` and you should see two messages displayed - one from this client and one from the server.

For at more useful example see `@feathersjs-offline/example`.


## Documentation

You can read the docs [here](https://auk.docs.feathersjs.com/guides/offline-first/readme.html#offline-first).

For own-net implementations you must assure that the table (or collection) under control *must* implement both `uuid`, `updatedAt`, and `onServerAt` attributes.

> **Pro tip:** If your key is not `uuid` then you have to manually set the key on the client *before* calling `create` as you have no guarantee that the backend answers.

> **Pro tip:** If you want the back-end to hold all users' data in one table (or collection), then all rows (or documents) must include a user identification (e.g. '`_id`' of `users`) and an appropriate query should be set in the `options` parameter when registering the replicator (e.g. `{query: {userId: <whatever-the-value-is>}}`).

Also, updates to the client from a requested sync will not execute any hooks but any queued events on the device will (both on back-end and on any other devices).


### The own-net principle implementation

There are multiple situations to consider

Situation | Client unit | Back-end
| --- | --- | --- |
|  |   | The back-end holds multiple users' data in same storage (the shared truth)
| Joins for first time | request sync from before app was born | deliver all relevant records |
| Joins after first time | request sync from newest `updatedAt` from latest sync | deliver all relevant records |
| Changes data (online) | change local data immediately | | |
| | record and send change to back-end. If data item already is in queue, alter it to reflect result | change relevant data and acknowledge | |
| | remove change from queue |  | |
| Changes data (offline) | change local data immediately |  |
| | queue mutation on device. If data item already is in queue, alter it to reflect result |  |
| Reconnects (online) | request sync from newest `updatedAt` from latest sync | deliver all relevant records |
| | send relevant (i.e. `updatedAt` newer on device or removed after `updatedAt`) queued mutations in order to back-end | change relevant data |
| | | (relevant hooks executes for each net change) |


## See also
If you want to handle each update on its own (e.g. if you have implemented hooks), then you probably should have a look at `@feathersjs-offline/owndata`.


## License

Copyright (c) 2020

Licensed under the [MIT license](LICENSE).
