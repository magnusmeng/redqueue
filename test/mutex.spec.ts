import type RedisMemoryServer from "redis-memory-server";
import type { RedisClient } from "../src/interfaces";
import { acquireMutex, mutex, refreshMutex } from "../src/mutex";
import { createTestRedisClient } from "./utils/redis-setup";

describe("Mutex", () => {
	let client: RedisClient;
	let redisServer: RedisMemoryServer;

	beforeAll(async () => {
		({ client, redisServer } = await createTestRedisClient());
	});

	afterEach(async () => {
		await client.del("test:lock");
	});

	afterAll(async () => {
		await client.disconnect();
		await redisServer.stop();
	});

	it("should acquire", async () => {
		const lock = mutex(client, "test:lock");
		const res = await lock.acquire();
		expect(res).toBe(true);
		expect(await client.get("test:lock")).toBe(lock.identifier);
	});

	it("should release", async () => {
		const lock = mutex(client, "test:lock");
		let res = await lock.acquire();
		expect(res).toBe(true);
		res = await lock.release();
		expect(res).toBe(true);
		expect(await client.get("test:lock")).toBe(null);
	});

	it("should run correct operation first", async () => {
		const lock1 = mutex(client, "test:lock");
		const lock2 = mutex(client, "test:lock");

		// Acquire lock 1 immediately
		await lock1.acquire();
		const op1 = new Promise((resolve) =>
			setTimeout(async () => {
				await lock1.release();
				resolve(lock1.identifier);
			}, 200),
		);
		// Acquire lock 2 in timeout
		const op2 = new Promise((resolve) =>
			setTimeout(async () => {
				await lock2.acquire(); // should stall here...
				await lock2.release();
				resolve(lock2.identifier);
			}, 10),
		);

		const res = await Promise.race([op1, op2]);
		expect(res).toBe(lock1.identifier);
		expect(res).not.toBe(lock2.identifier);
		// complete and ensure all are released...
		await Promise.all([op1, op2]);
		expect(await client.get("test:lock")).toBe(null);
	});

	it("should not deadlock", async () => {
		const t0 = Date.now();
		const lock1 = mutex(client, "test:lock");
		const lock2 = mutex(client, "test:lock");
		await lock1.acquire({
			lockTimeout: 100,
		});
		await lock2.acquire();
		// Not signalling completion
		// This should be called after 300 ms
		expect(Date.now() - t0).toBeGreaterThan(100);
		await lock2.release();
		expect(await client.get("test:lock")).toBe(null);
	});

	it("should not refresh non-existing lock", async () => {
		const refreshed = await refreshMutex(client, "test:lock", "id", 200);
		expect(refreshed).toBe(false);
	});

	it("should refresh lock", async () => {
		const lock = mutex(client, "test:lock");
		await lock.acquire();
		const exp0 = await client.pExpireTime("test:lock");
		await new Promise<void>((resolve) => setTimeout(resolve, 20));
		const res = await lock.refresh();
		expect(res).toBeTruthy();
		const exp1 = await client.pExpireTime("test:lock");
		expect(exp1).toBeGreaterThan(exp0);
		await lock.release();
	});

	it("should be able to reacquire self", async () => {
		const lock = mutex(client, "test:lock");
		const t0 = Date.now();
		await lock.acquire();
		expect(await lock.acquire()).toBeTruthy();
		expect(Date.now() - t0).toBeLessThan(10);
		await lock.release();
	});
});
