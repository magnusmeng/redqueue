import {
	type RedisClientOptions,
	type RedisClusterOptions,
	createClient,
	createCluster,
} from "redis";
import { type IQuConsumer, createConsumer } from "./consumer";
import { ConsumersAlreadySetupError, QuNotFoundError } from "./errors";
import type { RedisClient } from "./interfaces";
import { type IQuMessage, sendMessage } from "./message";

type IQuHandler<D> = (task: IQuMessage<D>) => Promise<void>;

export interface IQuOptions {
	dlq?: string;
	concurrency?: number;
	group?: string;
}

export interface IResolvedQuHandler<D> {
	options?: IQuOptions;
	handler: IQuHandler<D>;
}

type ExtractQuDataType<T> = T extends IResolvedQuHandler<infer U> ? U : never;

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
type IResolveQu<Q extends Record<string, IResolvedQuHandler<any>>> = {
	send<K extends keyof Q>(
		key: K,
		payload: ExtractQuDataType<Q[K]>,
	): Promise<{ id: string }>;
	startWorker(): Promise<void>;
	startConsumers<K extends keyof Q>(options?: {
		keys?: K[];
	}): Promise<Record<K, IQuConsumer>>;
	stopConsumers(): Promise<void>;
	awaitConsumers(): Promise<void>;
};

export function defineQu<
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	Q extends Record<string, IResolvedQuHandler<any>>,
	R extends RedisClient,
>(
	redis: R | { client: RedisClientOptions } | { cluster: RedisClusterOptions },
	options: Q,
): IResolveQu<Q> {
	let client: RedisClient;
	let shouldCloseConnection = false;
	if (!(redis as R).duplicate) {
		shouldCloseConnection = true;
		const redisConfig = redis as {
			client?: RedisClientOptions;
			cluster?: RedisClusterOptions;
		};
		if (redisConfig.client) {
			client = createClient(redisConfig.client);
		} else if (redisConfig.cluster) {
			client = createCluster(redisConfig.cluster);
		}
	} else {
		client = redis as R;
	}

	let consumers: Record<keyof Q, IQuConsumer>;
	return {
		async send(key, payload) {
			if (!Object.keys(options).includes(String(key))) {
				throw new QuNotFoundError(
					`key ${String(key)} was not found in configuration!`,
				);
			}
			if (!client.isOpen) await client.connect();
			const message = await sendMessage(client, String(key), payload);
			return { id: message.id };
		},
		async startConsumers(
			{ keys } = {
				keys: undefined,
			},
		) {
			if (consumers) {
				throw new ConsumersAlreadySetupError("Consumers already setup");
			}

			if (!client.isOpen) await client.connect();

			consumers = {} as Record<keyof Q, IQuConsumer>;

			const allKeys = Object.keys(options);
			const filteredKeys = keys
				? keys.map((k) => String(k)).filter((k) => allKeys.includes(k))
				: allKeys;

			for (const key of filteredKeys) {
				const opt = options[key];
				const consumer = await createConsumer(client, opt.handler, {
					key: String(key),
					group: opt.options?.group ?? "redqueue",
					concurrency: opt.options?.concurrency ?? 1,
				});
				consumer.start();
				consumers[key as keyof Q] = consumer;
			}

			return consumers;
		},
		async stopConsumers() {
			await Promise.all(
				Object.values(consumers).map((consumer) => consumer.stop()),
			);
		},
		async awaitConsumers() {
			return new Promise<void>((resolve, reject) =>
				setTimeout(() => {
					Promise.all(Object.values(consumers).map((c) => c.await()))
						.then(() => resolve())
						.catch(reject);
				}, 0),
			);
		},
		async startWorker() {
			await this.startConsumers();
			for (const signal of ["SIGINT", "SIGTERM"] as const) {
				process.on(signal, () => {
					void this.stopConsumers();
					if (shouldCloseConnection) {
						void client.disconnect();
					}
				});
			}
			await this.awaitConsumers();
		},
	};
}
