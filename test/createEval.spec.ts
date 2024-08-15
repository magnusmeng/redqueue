import type RedisMemoryServer from "redis-memory-server";
import type { RedisClient } from "../src/interfaces";
import createEval from "../src/utils/createEval";
import { createTestRedisClient } from "./utils/redis-setup";

describe("createEval", () => {
	let client: RedisClient;
	let redisServer: RedisMemoryServer;
	beforeAll(async () => {
		({ client, redisServer } = await createTestRedisClient());
	});

	afterEach(async () => {
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		await (client.sendCommand as any)(["SCRIPT", "FLUSH", "SYNC"]);
	});

	afterAll(async () => {
		await client.disconnect();
		await redisServer.stop();
	});

	it("should run once", async () => {
		const script = createEval("return ARGV[1]");
		const ping = await script(client, [], ["pong"]);
		expect(ping).toBe("pong");
	});

	it("should run from cache", async () => {
		const script = createEval("return ARGV[1]");
		const spy = jest.spyOn(client, "eval");
		await script(client, [], ["pong"]);
		expect(spy).toHaveBeenCalled();

		// evalSha should be called instead from now on...
		spy.mockClear();
		const ping = await script(client, [], ["pong"]);
		expect(ping).toBe("pong");
		expect(spy).not.toHaveBeenCalled();
	});
});
