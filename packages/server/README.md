# @feathersjs-offline/server


[![Build Status](https://travis-ci.org/mhillerstrom/feathersjs-offline-server.png?branch=master)](https://travis-ci.org/mhillerstrom/feathersjs-offline-server)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-server/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-server)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-server/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-server/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathersjs-offline-server.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathersjs-offline-server)
[![Download Status](https://img.shields.io/npm/dm/feathersjs-offline-server.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-offline-server)
[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lerna.js.org/)



> Offline-first service adapter wrapper for servers supporting own-data/own-net replication with optimistic updates.

## Installation

```
const server = require('@feathersjs-offline/server');
```

### Options:

All options available for the wrapped adapter can be used in addition to:

- `useShortUuid` (optional, default `true`) - Generate short `uuid`s. If `false` long `uuid`s are generated. This option should match whatever you choose on the client.
- `adapterTest` (optional, default `false`) - This is usually only used for running adapter tests as it suppresses the generation of `uuid`, and updating of `onServerAt`.

## Documentation

You can read the docs [here](https://auk.docs.feathersjs.com/guides/offline-first/readme.html#offline-first).

For own-data implementations you must assure that the table (or collection) under control *must* implement both `uuid`, `updatedAt`, and `onServerAt` attributes.

> **Pro tip:** If your key is not `uuid` then you have to manually set the key *before* calling `create` as you have no guarantee that the backend answers.

> **Pro tip:** If you want the back-end to hold all users' data in one table (or collection), then all rows (or documents) must include a user identification (e.g. '`_id`' of `users`) and an appropriate query should be set in the `options` parameter on the client when registering the service (e.g. `{query: {userId: <whatever-the-value-is>}}`).

Also, updates to the client from a requested sync will not execute any hooks but any queued events on the device will (both on back-end and on any other devices).

## Example
Here is an example of a FeathersJS server with a messages in-memory service that supports pagination:

```bash
$ npm install @feathersjs/feathers @feathersjs/express @feathersjs/socketio @feathersjs/errors feathers-memory @feathersjs-offline/server
```

In app.js:

```js
const feathers = require('@feathersjs/feathers');
const express = require('@feathersjs/express');
const socketio = require('@feathersjs/socketio');
const RealtimeServiceWrapper = require('@feathersjs-offline/server');

const memory = require('feathers-memory');
const RealtimeService = RealtimeServiceWrapper(memory)

// Create an Express compatible Feathers application instance.
const app = express(feathers());
// Turn on JSON parser for REST services
app.use(express.json());
// Turn on URL-encoded parser for REST services
app.use(express.urlencoded({ extended: true }));
// Enable REST services
app.configure(express.rest());
// Enable REST services
app.configure(socketio());
// Create an in-memory FeathersJS offline realtime service with a default page size of 2 items
// and a maximum size of 4
app.use('/messages', RealtimeService({
  paginate: {
    default: 2,
    max: 4
  }
}));

// Set up default error handler
app.use(express.errorHandler());

// Create a dummy Message
app.service('messages').create({
  text: 'Message created on server'
}).then(message => console.log('Created message', message));

// Start the server.
const port = 3030;

app.listen(port, () => {
  console.log(`Feathers server listening on port ${port}`)
});
```

Run the example with node app and go to `http://localhost:3030/messages`.


## See also
This service wrapper works in conjunction with either the own-data or the own-net counterparts `@feathersjs-offline/owndata` and `@feathersjs-offline/ownnet` respectively.

> I have a sample Quasar-Cordova-FeathersJS-MongoDB [app](https://github.com/mhillerstrom/Quasar-Cordova) showcasing `@feathersjs-offline/owndata`. It's still not complete, but it will show offline ability.

## License

Copyright (c) 2020

Licensed under the [MIT license](LICENSE).
