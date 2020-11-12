# @feathersjs-offline

[![Build Status](https://travis-ci.org/mhillerstrom/feathersjs-offline.png?branch=master)](https://travis-ci.org/mhillerstrom/feathersjs-offline)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathersjs-offline/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathersjs-offline/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathersjs-offline.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathersjs-offline)
[![Download Status](https://img.shields.io/npm/dm/feathersjs-offline.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-offline)
[![lerna](https://img.shields.io/badge/maintained%20with-lerna-cc00ff.svg)](https://lerna.js.org/)

> An example client and server showcasing FeathersJS offline realtime support for own-data and own-net protocols as described in the docs [here](https://auk.docs.feathersjs.com/guides/offline-first/readme.html#offline-first).


## Installation

```
npm install @feathersjs-offline/example --save
```

## Documentation

This collection of packages i interesting due to to mainly two things:
- it fully supports own-data and own-net as described in You can read the docs [offline-first](https://docs.feathersjs.com/guides/offline-first/readme.html).
- it can be used almost invisibly - you do not have to change your coding habits to utilize it, just set it up and forget all about it!


## Running the Example

Here's an example of a Feathers client that uses `feathersjs-offline`. 

```js
const feathers = require('@feathersjs/feathers');
const plugin = require('@feathersjs-offline/owndata');

// Initialize the application
const app = feathers();

// Initialize the plugin
app.configure(plugin());
```

## License

Copyright (c) 2020

Licensed under the [MIT license](LICENSE).
