process.env.NODE_ENV = 'development';
process.env.ASSET_PATH = '/';

const webpack = require('webpack');
const config = require('../webpack.config');

delete config.chromeExtension;
config.mode = 'development';
config.devtool = 'cheap-module-source-map';

webpack(config, (err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  process.stdout.write(stats.toString({ colors: true, chunks: false, modules: false }) + '\n');
  if (stats.hasErrors()) process.exit(1);
});
