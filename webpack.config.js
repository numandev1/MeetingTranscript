const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const env = require('./utils/env');

const ASSET_PATH = process.env.ASSET_PATH || '/';
const isDevelopment = process.env.NODE_ENV !== 'production';

const fileExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'woff', 'woff2'];

const config = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    // Service worker
    background: path.join(__dirname, 'src', 'pages', 'Background', 'index.ts'),
    // One bundle per platform. These are injected by chrome.scripting at runtime,
    // so their names must match PLATFORM_CONFIGS in src/background-script/config.ts.
    contentGoogleMeet: path.join(__dirname, 'src', 'pages', 'ContentGoogleMeet', 'index.ts'),
    contentTeams: path.join(__dirname, 'src', 'pages', 'ContentTeams', 'index.ts'),
    contentZoom: path.join(__dirname, 'src', 'pages', 'ContentZoom', 'index.ts'),
    // Extension UI
    popup: path.join(__dirname, 'src', 'pages', 'Popup', 'index.ts'),
    meetings: path.join(__dirname, 'src', 'pages', 'Meetings', 'index.ts'),
    sidePanel: path.join(__dirname, 'src', 'pages', 'SidePanel', 'index.ts'),
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'build'),
    clean: true,
    publicPath: ASSET_PATH,
  },
  module: {
    rules: [
      {
        test: new RegExp(`\\.(${fileExtensions.join('|')})$`),
        type: 'asset/resource',
        exclude: /node_modules/,
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        options: {
          sources: false,
        },
        exclude: /node_modules/,
      },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: require.resolve('ts-loader'),
            options: {
              transpileOnly: isDevelopment,
            },
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@lib': path.resolve(__dirname, 'src', 'lib'),
    },
  },
  plugins: [
    new CleanWebpackPlugin({ verbose: false }),
    new webpack.ProgressPlugin(),
    new webpack.EnvironmentPlugin(['NODE_ENV']),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(__dirname, 'src', 'manifest.json'),
          to: path.join(__dirname, 'build'),
          force: true,
          transform(content) {
            const manifest = JSON.parse(content.toString());
            return Buffer.from(
              JSON.stringify(
                {
                  ...manifest,
                  // package.json wins when npm exposes these; otherwise the values
                  // committed in src/manifest.json are kept.
                  version: process.env.npm_package_version || manifest.version,
                  description: process.env.npm_package_description || manifest.description,
                },
                null,
                2
              )
            );
          },
        },
        {
          from: path.join(__dirname, 'src', 'rules.json'),
          to: path.join(__dirname, 'build', 'rules.json'),
          force: true,
        },
        {
          from: path.join(__dirname, 'src', 'icon.png'),
          to: path.join(__dirname, 'build', 'icon.png'),
          force: true,
        },
        {
          from: path.join(__dirname, 'src', 'icons'),
          to: path.join(__dirname, 'build', 'icons'),
          force: true,
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Popup', 'index.html'),
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Meetings', 'index.html'),
      filename: 'meetings.html',
      chunks: ['meetings'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'SidePanel', 'index.html'),
      filename: 'side-panel.html',
      chunks: ['sidePanel'],
      cache: false,
    }),
  ],
  infrastructureLogging: {
    level: 'info',
  },
};

if (env.NODE_ENV === 'development') {
  config.devtool = 'cheap-module-source-map';
} else {
  config.optimization = {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  };
}

module.exports = config;
