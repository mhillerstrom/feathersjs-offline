# plugin-test

[![Build Status](https://travis-ci.org/mhillerstrom/feathers-plugin-test.png?branch=master)](https://travis-ci.org/mhillerstrom/feathers-plugin-test)
[![Code Climate](https://codeclimate.com/github/mhillerstrom/feathers-plugin-test/badges/gpa.svg)](https://codeclimate.com/github/mhillerstrom/feathers-plugin-test)
[![Test Coverage](https://codeclimate.com/github/mhillerstrom/feathers-plugin-test/badges/coverage.svg)](https://codeclimate.com/github/mhillerstrom/feathers-plugin-test/coverage)
[![Dependency Status](https://img.shields.io/david/mhillerstrom/feathers-plugin-test.svg?style=flat-square)](https://david-dm.org/mhillerstrom/feathers-plugin-test)
[![Download Status](https://img.shields.io/npm/dm/plugin-test.svg?style=flat-square)](https://www.npmjs.com/package/plugin-test)

> Plugin test

## Installation

```
npm install plugin-test --save
```

## Documentation

TBD

## Complete Example

Here's an example of a Feathers server that uses `plugin-test`. 

```js
const feathers = require('@feathersjs/feathers');
const plugin = require('plugin-test');

// Initialize the application
const app = feathers();

// Initialize the plugin
app.configure(plugin());
```

## License

Copyright (c) 2018

Licensed under the [MIT license](LICENSE).
