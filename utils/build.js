process.env.NODE_ENV = 'production';
process.env.ASSET_PATH = '/';

const path = require('path');
const fs = require('fs');
const ZipPlugin = require('zip-webpack-plugin');
const config = require('../webpack.config');

delete config.chromeExtension;
config.mode = 'production';

const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));

config.plugins = (config.plugins || []).concat(
  new ZipPlugin({
    filename: `${packageInfo.name}-${packageInfo.version}.zip`,
    path: path.join(__dirname, '..', 'zip'),
  })
);

module.exports = config;
