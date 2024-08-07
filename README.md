# redqueue

[![npm package][npm-img]][npm-url]
[![Build Status][build-img]][build-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]
[![Commitizen Friendly][commitizen-img]][commitizen-url]
[![Semantic Release][semantic-release-img]][semantic-release-url]

A strongly typed, fast, developer friendly job-queue for node.js backed by Redis Streams.

## Table of Contents

- [Introduction](#introduction)
- [Installation](#installation)
- [Features](#features)
- [Getting Started](#getting-started)
  - [Defining a Queue](#defining-a-queue)
  - [Starting Consumers](#starting-consumers)
  - [Sending Messages](#sending-messages)
- [API Reference](#api-reference)
  - [`defineQu`](#definequ)
  - [`send`](#send)
  - [`startConsumers`](#startconsumers)
  - [`awaitConsumers`](#awaitconsumers)
- [Best Practices](#best-practices)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

## Introduction

`redqueue` is a lightweight and flexible library designed for managing message queues using Redis. It simplifies the definition and handling of distributed tasks, making it perfect for situations where you need to process tasks concurrently or in a specific order. By leveraging Redis Streams, `redqueue` efficiently handles message distribution, persistence, and consumer management.

`redqueue` is more than just a queue library—it's also an event-driven messaging library. With its simple and strongly typed API, it allows you to easily build event-based architectures. However, it's important to note that `redqueue` is *not your traditional queue library*.

`redqueue` is exceptionally fast, thanks to its use of Redis Streams. However, this performance comes with certain trade-offs. Unlike traditional task-queue libraries, `redqueue` does not support features like delayed tasks, cron jobs, or anything that isn't an "event to act on now." If your use case requires undelayed action on events, `redqueue` is the right choice.

## Installation

To install `redqueue`, simply use npm or yarn:

```bash
npm install redqueue
```

or

```bash
yarn add redqueue
```

## Features

- **Redis-Based Message Queue:** redqueue utilizes Redis for efficient and reliable message queueing, allowing for distributed task processing across multiple consumers.

- **Task Definition with Handlers:** Define tasks with custom handlers that process messages as they are received. Each task is tied to a specific queue, allowing for organized and scalable task management.

- **Concurrency Control:** Set the concurrency level for each queue, controlling the number of simultaneous task executions. This ensures optimal resource utilization and task throughput.

- **Message Acknowledgment:** Messages are acknowledged after successful processing, ensuring that tasks are only marked as completed when they've been fully handled. This prevents message loss or duplication.

- **Flexible Configuration:** Easily configure Redis connection options, queue behaviors, and handler functions to fit your application's needs.

- **Consumer Management:** Start and stop consumers with simple commands. The library handles message dispatch and task execution, making it easy to manage consumers in a distributed environment.

- **Support for Complex Workflows:** Chain tasks together by sending new messages from within handlers, enabling complex workflows like multi-stage processing or task delegation.

- **TypeScript Support:** Written in TypeScript, redqueue provides type safety and IntelliSense support, ensuring a robust development experience.

- **Automatic Task Re-scheduling:** Failed tasks can be retried or moved to a dead-letter queue depending on your specific needs, providing resilience in your task processing pipeline.

- **Graceful Shutdown:** Consumers can be gracefully awaited and stopped, ensuring that all in-progress tasks are completed before shutdown, which helps in maintaining data consistency.

## Getting Started

### Defining a Queue

To start using `redqueue`, you need to define your queues and their associated handlers. Each queue can process messages with a specific concurrency level, allowing you to control how many tasks are handled simultaneously.

```typescript
import { defineQu, type IQuMessage } from "redqueue";

const redisOptions = {
  // Your Redis connection options here
};

const qu = defineQu(redisOptions, {
  "order.placed": {
    handler: async (message: IQuMessage<{ orderId: string }>) => {
      // Handle the order
      await qu.send("order.process", { orderId: message.payload.orderId });
      await message.ack(); // Acknowledge message completion
    },
    concurrency: 2, // Process two orders concurrently
  },
  "order.process": {
    handler: async (message: IQuMessage<{ orderId: string }>) => {
      console.log(`Processing order ${message.payload.orderId}`);
      await message.ack();
    },
    concurrency: 5, // Process up to five tasks concurrently
  },
});
```

### Starting Consumers

Once you've defined your queues, you need to start the consumers that will process incoming messages.

```typescript
async function main() {
  await qu.startConsumers(); // Start the consumers

  console.log("Consumers are running! Stop with ctrl-c");
}

void main();
```

### Sending Messages

To send a message to a queue, use the `send` method. This will place a message in the queue, where it will be picked up by the appropriate handler.

```typescript
qu.send("order.placed", { orderId: "12345" });
```

## API Reference

### `defineQu`

```typescript
defineQu(redisOptions: RedisOptions, queues: { [key: string]: QueueDefinition }): QuInstance;
```

Defines a set of queues with associated handlers and concurrency settings.

- `redisOptions`: Configuration object for Redis connection.
- `queues`: An object where keys are queue names and values are queue definitions including handlers and options like concurrency levels.

### `send`

```typescript
send(queueName: string, payload: any): Promise<void>;
```

Sends a message to the specified queue.

- `queueName`: The name of the queue to send the message to.
- `payload`: The data to be sent with the message.

### `startConsumers`

```typescript
startConsumers(): Promise<void>;
```

Starts the consumers to begin processing messages.

### `awaitConsumers`

```typescript
awaitConsumers(): Promise<void>;
```

Waits for the consumers to finish processing messages. Useful for ensuring a graceful shutdown.

## Best Practices

- **Concurrency Control**: Set appropriate concurrency levels for each queue to optimize resource usage without overwhelming your system.
- **Acknowledgments**: Always acknowledge messages after processing to avoid message loss or duplication.
- **Error Handling**: Implement robust error handling in your handlers to manage failures and retries effectively.
- **Graceful Shutdown**: Use `awaitConsumers` to ensure all in-progress tasks are completed before shutting down your application.

## Limitations

- **No Delayed Tasks**: `redqueue` is designed for immediate task execution and does not support delayed tasks or scheduled jobs.
- **No Cron Jobs**: There is no built-in support for cron jobs or recurring tasks.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub if you have ideas for improvements or new features.

## License

`redqueue` is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.


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
