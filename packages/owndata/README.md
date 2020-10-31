# @feathersjs-offline/owndata

[![Build Status](https://travis-ci.org/mhillerstrom/feathersjs-offline-owndata.png?branch=master)](https://travis-ci.org/mhillerstrom/feathersjs-offline-owndata)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathersjs-offline-owndata.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathersjs-offline-owndata)
[![Download Status](https://img.shields.io/npm/dm/feathersjs-offline-owndata.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-offline-owndata)
[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lerna.js.org/)

> Offline-first own-data replication with optimistic updates.


## Installation

```bash
npm install @feathersjs-offline/owndata --save
```

This module only delivers full own-data functionality if the service on the server has been configured correctly with `@feathersjs-offline/server`.

## API

```js
Owndata([options])
```
Returns a new service instance initialized with the given options.

```js
import { Owndata } from '@feathersjs-offline/owndata');

app.use('/messages', Owndata());
app.use('/messages', Owndata({ id, events, paginate }));
````

or

```js
owndataWrapper(app, path, [options])
```
Returns a new wrapped service instance initialized with the given options.

```js
import memory from 'feathers-memory');
import { owndataWrapper } from '@feathersjs-offline/owndata');

// Wrap local db with own-data
app.use('/messages', memory());
owndataWrapper(app, 'messages');

// Wrap local db with own-data (and special options)
app.use('/messages', memory());
owndataWrapper(app, 'messages', { id, events, paginate }));

// Wrap server path `snippets`. (No prior `app.use('snippets', ...);` )
ownnetWrapper(app, 'snippets');
````

### Options:
All options available for the wrapped adapter can be used in addition to:

- `id` (optional, default: `id`) - The name of the id field property.
- `store` (optional) - An object used for initializing the storage (see `feathers-memory`).
- `storage` (optional, default: `localStorage`) - Decides where data will be stored locally. You can choose between `localStorage` and `sessionStorage` on the client, but only `localStorage` on a NodeJS app.
- `events` (optional) - A list of custom service events sent by this service.
- `paginate` (optional) - A pagination object containing a default and max page size.
- `whitelist` (optional) - A list of additional query parameters to allow.
- `multi` (optional) - Allow create with arrays and update and remove with id null to change multiple items. Can be true for all methods or an array of allowed methods (e.g. [ 'remove', 'create' ]).
- `useShortUuid` (optional, default `true`) - Generate short `uuid`s (sufficient for most applications). If `false` long `uuid`s are generated. This option should match whatever you choose on the server side.
- `trackMutations` (optional, default `true`) - Should we track mutations à la the `feathers-realtime-offline` way. Today the preferred way is to register a listener on the service on the relevant message (`created`, `updated`, `patched`, or `removed`). We have three services: two on the client (`app.service('mypath').local` and `app.service('mypath').queue`) and one on the "server" (`app.service('mypath').remote`). The "server" can be the client, but it's hard to imagine the real world usefulness of this...
- `publication` (optional, default `null`) - 
- `subscriber` (optional, default `() => {}`) - 
- `fixedName` (optional, default `false`) - 
- `adapterTest` (optional, default `false`) - This is usually only used for running adapter tests as it suppresses results containing `uuid`, `updatedAt`, `deletedAt`, and `onServerAt`.

### Example
Here is an example of a FeathersJS server with a messages in-memory service that supports pagination:

```bash
$ npm install @feathersjs/feathers @feathersjs/express @feathersjs/socketio @feathersjs/errors feathers-memory @feathersjs-offline/owndata
```

In app.js:

```js
const feathers = require('@feathersjs/feathers');
const io = require('socket.io-client');
const port = 3030;
const socket = io(`http://localhost:${port}`);
const socketio = require('@feathersjs/socketio-client');
const io = require('@feathersjs/socketio');
const { Owndata } = require('@feathersjs-offline/owndata');

// Create an Express compatible Feathers application instance.
const app = feathers();

// Configure socketio 
app.configure(socketio(socket));

// Create an own-data FeathersJS service with a default page size of 2 items
// and a maximum size of 4
app.use('/messages', Owndata({
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

You can read the docs [here](https://auk.docs.feathersjs.com/guides/offline-first).

For own-data implementations you must assure that the table (or collection) under control *must* implement attributes `uuid`, `updatedAt`, `onServerAt`, and `deletedAt`.

> **Pro tip:** If your key is not `uuid` then you have to manually set the key on the client *before* calling `create` as you have no guarantee that the backend answers. You set your key with the `id` parameter.

> **Pro tip:** If you want the back-end to hold all users' data in one table (or collection), then all rows (or documents) must include a user identification (e.g. '`_id`' of `users`) and an appropriate query should be set in the `query` parameter when registering the replicator (e.g. `{query: {userId: <whatever-the-value-is>}}`).

Also, updates to the client from a requested sync will not execute any hooks but any queued events on the device will (both on back-end and on any other devices).

### The own-data principle implementation

There are multiple situations to consider

Situation | Client unit | Back-end
| --- | --- | --- |
|  |   | The back-end holds (multiple) users' data in same storage (the shared truth)
| Joins for first time | request sync from before app was born | deliver all relevant records |
| Joins after first time | request sync from latest sync (oldest and newest `onServerAt` is used) | deliver all relevant records |
| Changes data (online) | change local data immediately | | |
| | record and send change to back-end | change relevant data and acknowledge | |
| | remove record of change | | |
| Changes data (offline) | change local data immediately |  |
| | queue mutation on device |  |
| Reconnects (online) | request sync from newest `updatedAt` from latest sync (`onServerAt == 0`) | deliver all relevant records |
| | send relevant (i.e. `onServerAt == 0` newer on device or removed after `onServerAt`) queued mutations in order to back-end | change relevant data |
| | | (relevant hooks executes for each change) |


## See also
If you do not need to handle each update on its own, but are satisfied with the net result, then you should have a look at `@feathersjs-offline/ownnet` as this will keep network traffic to a minimum.

This wrapper works properly only in conjunction with the server counterpart `@feathersjs-offline/server` configured correctly on the servers service.

> I have a sample Quasar-Cordova-FeathersJS-MongoDB [app](https://github.com/mhillerstrom/Quasar-Cordova) showcasing `@feathersjs-offline/owndata`. It's still not complete, but it will show offline ability.

## License

Copyright (c) 2020

Licensed under the [MIT license](LICENSE).
