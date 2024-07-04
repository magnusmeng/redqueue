# redqueue

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

A strongly typed, fast, developer friendly job-queue for node.js backed by Redis Streams.

## Install

```bash
npm install redqueue
```

## Usage

```ts
import { myPackage } from "my-package-name";

myPackage("hello");
//=> 'hello from my package'
```

## API

### myPackage(input, options?)

#### input

Type: `string`

Lorem ipsum.

#### options

Type: `object`

##### postfix

Type: `string`
Default: `rainbows`

Lorem ipsum.

[build-img]: https://github.com/magnusmeng/redqueue/actions/workflows/release.yml/badge.svg
[build-url]: https://github.com/magnusmeng/redqueue/actions/workflows/release.yml
[downloads-img]: https://img.shields.io/npm/dt/redqueue
[downloads-url]: https://www.npmtrends.com/redqueue
[npm-img]: https://img.shields.io/npm/v/redqueue
[npm-url]: https://www.npmjs.com/package/redqueue
[issues-img]: https://img.shields.io/github/issues/magnusmeng/redqueue
[issues-url]: https://github.com/magnusmeng/redqueue/issues
[semantic-release-img]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg
[semantic-release-url]: https://github.com/semantic-release/semantic-release
[commitizen-img]: https://img.shields.io/badge/commitizen-friendly-brightgreen.svg
[commitizen-url]: http://commitizen.github.io/cz-cli/
