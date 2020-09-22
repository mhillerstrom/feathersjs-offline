# @feathersjs-offline/owndata

[![Build Status](https://travis-ci.org/mhillerstrom/feathersjs-offline-owndata.png?branch=master)](https://travis-ci.org/mhillerstrom/feathersjs-offline-owndata)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-owndata/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathersjs-offline-owndata.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathersjs-offline-owndata)
[![Download Status](https://img.shields.io/npm/dm/feathersjs-offline-owndata.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-offline-owndata)
[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lerna.js.org/)

> Offline-first own-data replication with optimistic updates.


> I have a sample Quasar-Cordova-FeathersJS-MongoDB [app](https://github.com/mhillerstrom/Quasar-Cordova) showcasing `@feathersjs-offline/owndata`. It's still not complete, but it will show offline ability.

## Installation

```
npm install @feathersjs-offline/owndata --save
```


## Documentation

You can read the docs [here](https://docs.feathersjs.com/guides/offline-first/readme.html).

For own-data implementations you must assure that the table (or collection) under control *must* implement both `uuid`, `updatedAt`, and `onServerAt` attributes.

> **Pro tip:** If your key is not `uuid` then you have to manually set the key *before* calling `create` as you have no guarantee that the backend answers.

> **Pro tip:** If you want the back-end to hold all users' data in one table (or collection), then all rows (or documents) must include a user identification (e.g. '`_id`' of `users`) and an appropriate query should be set in the `options` parameter when registering the replicator (e.g. `{query: {userId: <whatever-the-value-is>}}`).

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


## License

Copyright (c) 2020

Licensed under the [MIT license](LICENSE).
