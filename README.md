# plugin-test

[![Build Status](https://travis-ci.org/mhillerstrom/feathersjs-offline.png?branch=master)](https://travis-ci.org/mhillerstrom/feathersjs-offline)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathersjs-offline/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathersjs-offline/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathersjs-offline/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathersjs-offline.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathersjs-offline)
[![Download Status](https://img.shields.io/npm/dm/feathersjs-offline.svg?style=flat-square)](https://www.npmjs.com/package/feathersjs-offline)

> Plugin test

## Installation

```
npm install plugin-test --save
```

## Documentation

TBD

## Complete Example

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

Copyright (c) 2018

Licensed under the [MIT license](LICENSE).
