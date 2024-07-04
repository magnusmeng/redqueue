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

You are selling pizzas, and you can take a single order at a time. Each order contains a quantity of pizzas that needs to be baked. Your oven can hold 5 pizzas at a time.

The following example demonstrates how to handle this simple use-case using redqueue on two queues `pizza.ordered` and `pizza.bake`.

```ts
import { defineQu, type IQuMessage } from "redqueue";

const redisOptions = ... // Some redis connection, client options or cluster options

const qu = defineQu(redisOptions, {
	"pizza.ordered": {
		handler: async (order: IQuMessage<{ qty: number }>) => {
			// Bake some pizzas
			for (let i = 0; i < order.payload.qty; i++) {
				await qu.send("pizza.bake", { topping: "cheese" });
			}
			await order.ack();
		},
		concurrency: 1, // Handle one order at a time
	},
	"pizza.bake": {
		handler: async (pizza: IQuMessage<{ topping: string }>) => {
			console.log(`Baking a ${pizza.payload.topping} pizza!`);
			await pizza.ack();
		},
		concurrency: 5, // The oven can bake 5 pizzas at a time
	},
});

async function main() {
	// Start the consumers
	await qu.startConsumers();

	console.log("Consumers are running! Stop with ctrl-c");

	// Send a pizza order each 1000ms
	const t = setInterval(() => {
		qu.send("pizza.ordered", { qty: 3 });
	}, 1000);

	// Await the consumers (e.g. run until they are stopped)
	await qu.awaitConsumers();
	clearInterval(t);
}

void main();

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
