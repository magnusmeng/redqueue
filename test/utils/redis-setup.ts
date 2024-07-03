import { createClient } from "redis";
import { RedisMemoryServer } from "redis-memory-server";
import type { RedisClient } from "../../src/interfaces";

export const createTestRedisClient = async (): Promise<{
	client: RedisClient;
	redisServer: RedisMemoryServer;
}> => {
	const redisServer = new RedisMemoryServer();

	const host = await redisServer.getHost();
	const port = await redisServer.getPort();
	const client = createClient({
		url: `redis://${host}:${port}/0`,
	});
	await client.connect();
	return { client, redisServer };
};
