import {
	type RedisClientOptions,
	type RedisClusterOptions,
	createClient,
	createCluster,
} from "redis";
import { type IQuConsumer, createConsumer } from "./consumer";
import { type CrontabString, type ICrontab, createCrontab } from "./crontab";
import { ConsumersAlreadySetupError, QuNotFoundError } from "./errors";
import type { RedisClient } from "./interfaces";
import { type IQuMessage, sendMessage } from "./message";

type IQuHandler<D> = (task: IQuMessage<D>) => Promise<void>;

export interface IQuOptions {
	dlq?: string;
	concurrency?: number;
	group?: string;
	initialId?: string;
	blockTime?: number;
}

interface ICronQuHandler {
	crontab: CrontabString;
}

type IQuHandlerOptions<D> = {
	options?: IQuOptions;
	handler: IQuHandler<D>;
};

export type IResolvedQuHandler<D> =
	| IQuHandlerOptions<D>
	| IQuHandlerOptions<D>[];

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
	}): Promise<Record<K, Q[K] extends unknown[] ? IQuConsumer[] : IQuConsumer>>;
	stopConsumers(): Promise<void>;
	awaitConsumers(): Promise<void>;
};

export function defineQu<
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	Q extends Record<string, IResolvedQuHandler<any>>,
	R extends RedisClient,
>(
	redis: R | { client: RedisClientOptions } | { cluster: RedisClusterOptions },
	handlers: Q,
	cron?: Record<string, ICronQuHandler>,
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
	type IConsumerMap = Record<
		keyof Q,
		Q[keyof Q] extends unknown[] ? IQuConsumer[] : IQuConsumer
	>;
	let consumerMap: IConsumerMap;
	let crontabs: Record<string, ICrontab>;
	return {
		async send(key, payload) {
			if (!Object.keys(handlers).includes(String(key))) {
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
			if (consumerMap) {
				throw new ConsumersAlreadySetupError("Consumers already setup");
			}

			if (!client.isOpen) await client.connect();

			consumerMap = {} as IConsumerMap;
			crontabs = {};
			if (cron) {
				Object.keys(cron).forEach((name) => {
					const opt = cron[name];
					const crontab = createCrontab(client, {
						key: name,
						crontab: opt.crontab,
					});
					crontab.start();
					crontabs[name] = crontab;
				});
			}

			const allKeys = Object.keys(handlers);
			const filteredKeys = keys
				? keys.map((k) => String(k)).filter((k) => allKeys.includes(k))
				: allKeys;

			const startConsumer = async (
				key: string,
				// biome-ignore lint/suspicious/noExplicitAny: Must use any in this case
				opt: IQuHandlerOptions<any>,
			) => {
				const consumer = await createConsumer(client, opt.handler, {
					key: String(key),
					group: opt.options?.group ?? "redqueue",
					concurrency: opt.options?.concurrency ?? 1,
					initialId: opt.options?.initialId,
					blockTime: opt.options?.blockTime,
				});
				consumer.start();
				return consumer;
			};

			for (const key of filteredKeys) {
				let consumers: IQuConsumer | IQuConsumer[];
				if (Array.isArray(handlers[key])) {
					consumers = await Promise.all(
						handlers[key].map((opt, i) =>
							startConsumer(key, {
								...opt,
								options: {
									...opt.options,
									group: opt.options?.group ?? `redqueue:${i}`,
								},
							}),
						),
					);
				} else {
					consumers = await startConsumer(key, handlers[key]);
				}
				// biome-ignore lint/suspicious/noExplicitAny: Must use any in this case
				consumerMap[key as keyof Q] = consumers as any;
			}

			return consumerMap;
		},
		async stopConsumers() {
			await Promise.all(Object.values(crontabs).map((tab) => tab.stop()));
			await Promise.all(
				Object.values(consumerMap)
					.flat()
					.map((c) => c.stop()),
			);
		},
		async awaitConsumers() {
			return new Promise<void>((resolve, reject) =>
				setTimeout(() => {
					Promise.all(
						Object.values(consumerMap)
							.flat()
							.map((c) => c.await()),
					)
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
