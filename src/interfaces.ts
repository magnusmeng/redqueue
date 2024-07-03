import type { RedisClientType } from "redis";

// biome-ignore lint/suspicious/noExplicitAny: Allow any for this instance...
export type RedisClient = RedisClientType<any, any, any>;
