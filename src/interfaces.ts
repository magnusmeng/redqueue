import type { RedisClientType, RedisClusterType } from "redis";

export type RedisClient =
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	| RedisClientType<any, any, any>
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	| RedisClusterType<any, any, any>;
