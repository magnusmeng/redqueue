import type RedisMemoryServer from "redis-memory-server";
import { createCrontab } from "../src/crontab";
import type { RedisClient } from "../src/interfaces";
import { createTestRedisClient } from "./utils/redis-setup";

describe("Crontab", () => {
	let client: RedisClient;
	let redisServer: RedisMemoryServer;

	beforeAll(async () => {
		({ client, redisServer } = await createTestRedisClient());
	});

	beforeEach(async () => {
		try {
			await client.del("test:cron:next");
			await client.del("test:cron:lock");
			await client.del("test:cron");
		} finally {
			// no-op
		}
	});

	afterAll(async () => {
		await client.disconnect();
		await redisServer.stop();
	});

	it("should start and stop listening", async () => {
		const crontab = createCrontab(client, {
			crontab: "* * * * *",
			key: "test:cron",
		});
		expect(crontab).toBeDefined();
		expect(crontab.isListening).toBeFalsy();
		crontab.start();
		expect(crontab.isListening).toBeTruthy();
		await crontab.stop();
		expect(crontab.isListening).toBeFalsy();
	});

	it("should throw if already listening", async () => {
		const crontab = createCrontab(client, {
			crontab: "* * * * *",
			key: "test:cron",
		});
		crontab.start();
		expect(() => crontab.start()).toThrow(/already listening/);
		await crontab.stop();
		expect(crontab.isListening).toBeFalsy();
	});

	it("should send messages on cron-activation", async () => {
		const crontab = createCrontab(client, {
			crontab: "0 0 1 1 *", // first day of jan. at midnight
			key: "test:cron",
		});
		const initialLen = await client.xLen("test:cron");

		// It should only create 2; not initially, and then 2
		crontab.start();
		await client.set("test:cron:next", `${Date.now()}`); // Force
		await new Promise<void>((r) => setTimeout(r, 550));
		await client.set("test:cron:next", `${Date.now()}`); // Force
		await new Promise<void>((r) => setTimeout(r, 550));
		const len = await client.xLen("test:cron");
		expect(len).toBeGreaterThan(initialLen);
		expect(len).toBe(2); // should be initial message and then next message at least
		await crontab.stop();
	});

	it("should send a message on cron-activation if next is in past", async () => {
		const crontab = createCrontab(client, {
			crontab: "0 0 * * *", // this should not happen in test...
			key: "test:cron",
		});
		const initialLen = await client.xLen("test:cron");

		await client.set("test:cron:next", "10000");
		crontab.start();
		await new Promise<void>((r) => setTimeout(r, 100));
		const len = await client.xLen("test:cron");
		expect(len).toBeGreaterThan(initialLen);
		expect(len).toBe(1);

		await crontab.stop();
	});

	it("should not send a message if next is in future", async () => {
		const crontab = createCrontab(client, {
			crontab: "0 0 * * *", // this should not happen in test...
			key: "test:cron",
		});
		const initialLen = await client.xLen("test:cron");

		await client.set("test:cron:next", `${Date.now() + 1000}`); // a second into the future
		crontab.start();
		await new Promise<void>((r) => setTimeout(r, 100));
		const len = await client.xLen("test:cron");
		expect(len).toBeGreaterThan(initialLen);
		expect(len).toBe(1);

		await crontab.stop();
	});

	it("should only process a single crontab at a time", async () => {
		const ct1 = createCrontab(client, {
			crontab: "0 0 * * *", // this should not happen in test...
			key: "test:cron",
		});
		const ct2 = createCrontab(client, {
			crontab: "0 0 * * *", // this should not happen in test...
			key: "test:cron",
		});
		await client.set("test:cron:next", `${Date.now()}`);
		ct1.start();
		ct2.start();

		const spy = jest.spyOn(client, "get");
		spy.mockImplementation(async () => "0");

		// Enough time for both to run a listen loop IF allowed by mistake
		await new Promise<void>((r) => setTimeout(r, 100));

		const len = await client.xLen("test:cron");
		expect(len).toBe(1);
		await ct1.stop();
		await ct2.stop();
	});
});
