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

```
npm install feathers-offline-ownnet --save
```


## Documentation

You can read the docs [here](https://docs.feathersjs.com/guides/offline-first/readme.html).

For own-net implementations you must assure that the table (or collection) under control *must* implement both `uuid`, `updatedAt`, and `onServerAt` attributes.

> **Pro tip:** If your key is not `uuid` then you have to manually set the key *before* calling `create` as you have no guarantee that the backend answers.

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
