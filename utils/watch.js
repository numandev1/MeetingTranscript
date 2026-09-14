// Watch-mode build. A webpack-dev-server is deliberately not used: TranscripTonic's
// content scripts run on meet.google.com / teams.microsoft.com / zoom.us, whose CSP
// blocks scripts and websockets from localhost. Watching and writing to build/ keeps
// the "edit, reload the extension, refresh the meeting tab" loop working everywhere.
process.env.NODE_ENV = 'development';
process.env.ASSET_PATH = '/';

const webpack = require('webpack');
const config = require('../webpack.config');

delete config.chromeExtension;
config.mode = 'development';
config.devtool = 'cheap-module-source-map';

webpack(config).watch({ ignored: /node_modules/ }, (err, stats) => {
  if (err) {
    console.error(err);
    return;
  }
  process.stdout.write(stats.toString({ colors: true, chunks: false, modules: false }) + '\n');
});
