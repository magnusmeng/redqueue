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
	dlq?: string;
	initialId?: string;
}

export async function createConsumer<D>(
	client: RedisClient,
	handler: (message: IQuMessage<D>) => void | Promise<void>,
	{
		key,
		group,
		concurrency,
		name,
		maxIdleTime = 600_000,
		maxAttempts = 3,
		dlq,
		initialId = "0-0",
	}: IConsumerOptions,
): Promise<IQuConsumer> {
	dlq = dlq ?? `${key}:dlq`;
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

		await _client.xAutoClaimJustId(
			key,
			group,
			consumerName,
			maxIdleTime,
			"0-0",
			{ COUNT: concurrency },
		);

		const pending = await _client.xPendingRange(key, group, "-", "+", 1, {
			consumer: consumerName,
		});

		const raw = await _client.xReadGroup(
			group,
			consumerName,
			{ key, id: initialRead || pending.length ? initialId : ">" },
			{ COUNT: concurrency, BLOCK: 2000 },
		);
		initialRead = false;

		if (raw?.length === 1) {
			const items = raw[0].messages;
			const pending = await buildPendingMap(_client, items, {
				consumerName,
				group,
				key,
			});

			await Promise.all(
				items.map(async (item) => {
					const message = parseRawMessage<D>(_client, item, pending[item.id], {
						dlq,
						key,
						group,
						consumerName,
					});
					if (message.id < initialId) {
						await message.ack();
						return;
					}
					try {
						// If too many retries, we move to dlq and ack
						if (message.retries >= maxAttempts) {
							await message.moveToDlq();
						} else {
							await Promise.resolve(handler(message));
						}
					} catch (err) {
						console.error(
							`A message failed to be processed by your handler. You should ALWAYS catch application side errors yourself. The message will be reclaimed/requed.\n${err}`,
						);
						await message.noack();
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

async function buildPendingMap(
	client: RedisClient,
	items: { id: string }[],
	{
		consumerName,
		key,
		group,
	}: { consumerName: string; key: string; group: string },
) {
	if (items.length === 0) return {};
	// Read pending list to read retries.
	const minKey = items[0].id;
	const maxKey = items[items.length - 1].id;

	const pending = await client.xPendingRange(
		key,
		group,
		minKey,
		maxKey,
		items.length * 2,
		{
			consumer: consumerName,
		},
	);
	return pending.reduce(
		(p, n) => {
			p[n.id] = n;
			return p;
		},
		{} as {
			[id: string]: {
				millisecondsSinceLastDelivery: number;
				deliveriesCounter: number;
			};
		},
	);
}
