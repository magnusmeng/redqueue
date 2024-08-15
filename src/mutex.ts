import { randomUUID } from "node:crypto";
import type { RedisClient } from "./interfaces";
import createEval from "./utils/createEval";

const defaultOptions: MutexOptions = {
	lockTimeout: 10000, // 10 seconds
	acquireTimeout: 10000,
	acquireAttemptsLimit: Number.POSITIVE_INFINITY,
	retryInterval: 10,
};

export interface MutexOptions {
	lockTimeout: number;
	acquireTimeout: number;
	acquireAttemptsLimit: number;
	retryInterval: number;
}

export async function acquireMutex(
	client: RedisClient,
	key: string,
	identifier: string,
	options: MutexOptions,
) {
	const { lockTimeout, acquireTimeout, acquireAttemptsLimit, retryInterval } =
		options;
	let attempt = 0;
	const end = Date.now() + acquireTimeout;
	while (Date.now() < end && ++attempt <= acquireAttemptsLimit) {
		const result = await client.set(key, identifier, {
			PX: lockTimeout,
			NX: true,
		});
		if (result === "OK") {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, retryInterval));
	}
	return false;
}

export const expireIfEqualLua = createEval<0 | 1>(
	`
  local key = KEYS[1]
  local identifier = ARGV[1]
  local lockTimeout = ARGV[2]

  local value = redis.call('get', key)

  if value == identifier then
    redis.call('pexpire', key, lockTimeout)
    return 1
  end

  return 0
  `,
);

export async function refreshMutex(
	client: RedisClient,
	key: string,
	identifier: string,
	lockTimeout: number,
) {
	const result = await expireIfEqualLua(
		client,
		[key],
		[identifier, `${lockTimeout}`],
	);
	return result === 1;
}

export const delIfEqualLua = createEval<0 | 1>(
	`
  local key = KEYS[1]
  local identifier = ARGV[1]

  if redis.call('get', key) == identifier then
    return redis.call('del', key)
  end

  return 0
  `,
);

export async function releaseMutex(
	client: RedisClient,
	key: string,
	identifier: string,
) {
	const result = await delIfEqualLua(client, [key], [identifier]);
	return result === 1;
}

export function mutex(client: RedisClient, key: string) {
	const identifier = randomUUID();

	return {
		get identifier() {
			return identifier;
		},
		async acquire(options?: Partial<MutexOptions>) {
			const opt = { ...defaultOptions, ...options };
			const refreshed = await this.refresh(opt?.lockTimeout);
			if (refreshed) return true;
			return acquireMutex(client, key, identifier, opt);
		},
		async refresh(lockTimeout = defaultOptions.lockTimeout) {
			return refreshMutex(client, key, identifier, lockTimeout);
		},
		async release() {
			return releaseMutex(client, key, identifier);
		},
	};
}
