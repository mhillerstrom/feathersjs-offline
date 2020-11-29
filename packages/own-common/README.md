# @feathersjs-offline/own-common

[![Build Status](https://travis-ci.org/mhillerstrom/feathersjs-offline-own-common.png?branch=master)](https://travis-ci.org/mhillerstrom/feathersjs-offline-own-common)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-own-common/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-own-common)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-own-common/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline-own-common/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathersjs-offline-own-common.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathersjs-offline-own-common)
[![Download Status](https://img.shields.io/npm/dm/feathersjs-offline-own-common.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-offline-own-common)
[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lerna.js.org/)

>  Part of `@feathersjs-offline`. ___*** For internal use only ***__

[offline original docs](https://auk.docs.feathersjs.com/guides/offline-first/readme.html#offline-first)


## The inner working of the wrapper
An overview of the wrapper structuring can be seen on the following 
## Function break-down
The wrapper handles most of the necessary bookkeeping for implementing the `own-data` and `own-net` principle. It is meant to be extended by the actual wrapper implementing the `own-data`/`own-net` specific function - the handling of updating the server with the local changes while offline. This is all done in a `async` method called `_processQueuedEvents()`.

In the following we will try to explain the handling of CRUD in a `own-data`/`own-net` setting followed by an in-depth walk-though of synchronization and the two implementations of `_processQueuedEvents()`.

## CRUD handling in own-common

The table below summarises the necessary steps for each CRUD method:

CRUD method | client preparation | client DB | client queue | server
----------- | ----------- | -------- | ----------- | --------- | ----- | 
**create**<br>_when server online_| set onServerAt = 0<br>updatedAt = &lt;now&gt;<br>uuid = &lt;new uuid&gt;  | | |
&nbsp; | | insert new row with prepared info | add 'create' queue entry
&nbsp; | | | | create data with onServerAt = <now>
&nbsp; | | update row with server data | remove 'create' queue entry
&nbsp; | 
**create**<br>_when server offline_| set onServerAt = 0<br>updatedAt = &lt;now&gt;<br>uuid = &lt;new uuid&gt;  | | |
&nbsp; | | insert new row with prepared info | add 'create' queue entry
&nbsp; | 
**create**<br>_when server error_| set onServerAt = 0<br>updatedAt = &lt;now&gt;<br>uuid = &lt;new uuid&gt;  | | |
&nbsp; | | insert new row with prepared info | add 'create' queue entry

