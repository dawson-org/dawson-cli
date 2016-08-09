
# Documentation
* [Runtime dependencies](#runtime-dependencies)
* [Getting Started](./GETTINGSTARTED.md)
* [CLI Reference](./CLI.md)
* [API Documentation](./API.md)
* [Troubleshooting](./TROUBLESHOOTING.md)


## Runtime dependencies

`dawson` uses babel to transpile your code for the `nodejs4.3` runtime. These packages are **required**:

* babel-register
* babel-polyfill
* babel-preset-es2017

You need to `npm install babel-register babel-polyfill babel-preset-es2017` and to create a `.babelrc` file in your root with at least the `es2017` preset.

Example:
```bash
$ npm install --save babel-register babel-polyfill babel-preset-es2017
$ echo '{"presets":["es2017"]}' > .babelrc
```
