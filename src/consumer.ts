import { hostname } from "node:os";
import type { RedisClient } from "./interfaces";
import { type IQuMessage, parseRawMessage } from "./message";

export interface IQuConsumer {
	readonly name: string;
	readonly group: string;
	readonly concurrency: number;
	stop(): Promise<void>;
	start(): void;
	await(): Promise<void>;
	isConsuming: boolean;
}

export interface IConsumerOptions {
	key: string;
	group: string;
	concurrency: number;
	name?: string;
	maxIdleTime?: number;
	maxAttempts?: number;
}

export async function createConsumer<D>(
	client: RedisClient,
	handler: (message: IQuMessage<D>) => void | Promise<void>,
	{ key, group, concurrency, name, maxIdleTime = 600_000 }: IConsumerOptions,
): Promise<IQuConsumer> {
	let shouldStop = true;

	const consumerName = name ?? `redqueue:${hostname()}`;

	try {
		await client.xGroupCreate(key, group, "0", { MKSTREAM: true });
	} catch (error) {
		// Allow: BUSYGROUP Consumer Group name already exists
		// It simply states that we tried to create a group where one already exists.
		if (!(error as Error).message?.includes("BUSYGROUP")) {
			throw error;
		}
	}
	await client.xGroupCreateConsumer(key, group, consumerName);

	// Why initialRead? Read this: https://redis.io/docs/latest/commands/xreadgroup/#usage-example
	let initialRead = true;
	let _client: RedisClient;

	const innerConsume = async () => {
		if (!_client) {
			// Duplicate client (each consumer must have its own client)
			_client = client.duplicate();
			await _client.connect();
		}
		if (!initialRead) {
			const ids = await _client.xAutoClaimJustId(
				key,
				group,
				consumerName,
				maxIdleTime,
				"0-0",
				{ COUNT: concurrency },
			);
			if (ids.messages.length > 0) initialRead = true;
		}

		const raw = await _client.xReadGroup(
			group,
			consumerName,
			{ key, id: initialRead ? "0-0" : ">" },
			{ COUNT: concurrency, BLOCK: 2000, NOACK: true },
		);

		if (initialRead && raw?.length === 1 && raw[0].messages.length === 0) {
			initialRead = false;
		}

		if (raw?.length === 1) {
			const items = raw[0].messages;
			await Promise.all(
				items.map(async (item) => {
					try {
						await Promise.resolve(
							handler(parseRawMessage(_client, key, group, item)),
						);
					} catch (err) {
						// Handling message failed.
						// TODO: Requeue it (reclaim it).
						console.error(
							"A message failed to be processed by your handler. You should ALWAYS catch application side errors yourself. The message will be reclaimed/requed.",
						);
					}
				}),
			);
		}
		if (!shouldStop) await innerConsume();
		else await _client.disconnect();
	};

	let consumePromise: Promise<void>;

	const consumer = {
		name: consumerName,
		group,
		concurrency,
		get isConsuming() {
			return !shouldStop;
		},
		async stop() {
			shouldStop = true;
			await consumePromise;
		},
		async await() {
			await consumePromise;
		},
		start() {
			// start consumer
			shouldStop = false;
			consumePromise = innerConsume();
		},
	};

	return consumer;
}
