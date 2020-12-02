const path = require('path');
const webpack = require('webpack');
const { merge } = require('webpack-merge');
// const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

function createConfig (name, isProduction = false) {
  const output = name === 'index' ? 'feathersjs-offline' : 'feathersjs-offline-' + name;
  const entry = 'index';
  const commons = {
    entry: `./packages/${name}/lib/${entry}.js`,
    node: {
      // net: 'empty',
      // tls: 'empty',
      // dns: 'empty',
      // module: 'empty',
      fs: 'empty'
    },
    output: {
      library: `feathersjsOffline${name.substr(0,1).toUpperCase()}${name.substr(1)}`,
      libraryTarget: 'var', // 'umd',
      globalObject: 'this',
      path: path.resolve(__dirname, 'dist'),
      filename: `${output}.js`
    },
    // resolve: {
    //   mainFields: ["browser", "main", "module"],
    // },
    module: {
      rules: [{
        test: /\.js/,
        exclude: /node_modules\/(?!(@feathersjs|debug))/,
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env']
        }
      }]
    }
  };

  const dev = {
    mode: 'development',
    devtool: 'source-map'
  };

  const production = {
    mode: 'production',
    output: {
      filename: `${output}.min.js`
    },
    optimization: {
      minimize: true
    }
    // plugins: [
    //   new UglifyJSPlugin({
    //     uglifyOptions: {
    //       ie8: false,
    //       comments: false,
    //       sourceMap: false
    //     }
    //   }),
    //   new webpack.DefinePlugin({
    //     'process.env.NODE_ENV': JSON.stringify('production')
    //   })
    // ]
  };

  return merge(commons, isProduction ? production : dev);
}

function createMaster (packages, isProduction = false) {
  const output = 'feathersjs-offline';
  const entry = 'index';
  const entries = {};
  packages.map(v => entries[v] = `./packages/${v}/lib/index.js`);
  // const entries = [];
  // packages.map(v => entries.push(`./packages/${v}/lib/index.js`));
  // entries = { 'feathersjs-offline' : entries }
console.log(`entries=${JSON.stringify(entries)}`);
  const commons = {
    entry: entries,
    node: {
      // net: 'empty',
      // tls: 'empty',
      // dns: 'empty',
      // module: 'empty',
      fs: 'empty'
    },
    output: {
      library: `feathersjsOffline`,
      libraryTarget: 'var', // 'umd',
      globalObject: 'this',
      path: path.resolve(__dirname, 'dist'),
      filename: `${output}.js`
    },
    // resolve: {
    //   mainFields: ["browser", "main", "module"],
    // },
    module: {
      rules: [{
        test: /\.js/,
        exclude: /node_modules\/(?!(@feathersjs|debug))/,
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env']
        }
      }]
    }
  };

  const dev = {
    mode: 'development',
    devtool: 'source-map'
  };

  const production = {
    mode: 'production',
    output: {
      filename: `${output}.min.js`
    },
    optimization: {
      minimize: true
    }
  };

  return merge(commons, isProduction ? production : dev);
}

module.exports = [
  // createConfig('index'),
  // createConfig('index', true),
  createConfig('common'),
  createConfig('common', true),
  // createConfig('optimistic-mutation'),
  // createConfig('optimistic-mutation', true),
  createConfig('owndata'),
  createConfig('owndata', true),
  createConfig('ownnet'),
  createConfig('ownnet', true),
  createConfig('server'),
  createConfig('server', true),
  createConfig('snapshot'),
  createConfig('snapshot', true),
  createConfig('client'),
  createConfig('client', true)
  // createMaster(['server', 'owndata', 'ownnet']),
  // createMaster(['server', 'owndata', 'ownnet'], true)
];
