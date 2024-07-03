import type RedisMemoryServer from "redis-memory-server";
import { createConsumer } from "../src/consumer";
import type { RedisClient } from "../src/interfaces";
import { sendMessage } from "../src/message";
import { createTestRedisClient } from "./utils/redis-setup";

const asyncNoOp = async () => {
	// No op
};

describe("consumer", () => {
	let client: RedisClient;
	let redisServer: RedisMemoryServer;
	beforeAll(async () => {
		({ client, redisServer } = await createTestRedisClient());
	});

	beforeEach(async () => {
		try {
			await client.xGroupDestroy("test:consumer", "test-group");
			await client.del("test:consumer");
		} catch {
			// noop
		}
	});

	afterAll(async () => {
		await client.disconnect();
		await redisServer.stop();
	});

	it("should create a consumer", async () => {
		const consumer = await createConsumer(client, asyncNoOp, {
			concurrency: 1,
			group: "test-group",
			key: "test:consumer",
		});
		expect(consumer).toBeDefined();

		const groups = await client.xInfoGroups("test:consumer");
		expect(groups.length).toBe(1);
		expect(groups[0].name).toBe("test-group");
		expect(groups[0].consumers).toBe(1);

		// consumer.start();

		// await new Promise(resolve => setTimeout(resolve, 100));
		// await consumer.stop();
	});

	it("should not fail for multiple consumers", async () => {
		await createConsumer(client, asyncNoOp, {
			concurrency: 1,
			group: "test-group",
			key: "test:consumer",
			name: "c1",
		});
		await createConsumer(client, asyncNoOp, {
			concurrency: 1,
			group: "test-group",
			key: "test:consumer",
			name: "c2",
		});

		const groups = await client.xInfoGroups("test:consumer");
		expect(groups.length).toBe(1);
		expect(groups[0].name).toBe("test-group");
		expect(groups[0].consumers).toBe(2);
	});

	it("should start and stop a consumer", async () => {
		const consumer = await createConsumer(client, asyncNoOp, {
			concurrency: 1,
			group: "test-group",
			key: "test:consumer",
		});
		expect(consumer).toBeDefined();

		consumer.start();
		await new Promise((resolve) => setTimeout(resolve, 100));
		await consumer.stop();

		// This test should pass silently and without timing out..
	});

	it("should consume messages", async () => {
		let received = 0;
		const consumer = await createConsumer<{ test: "test" }>(
			client,
			(message) => {
				if (message.payload.test === "test") {
					received++;
				}
			},
			{
				concurrency: 1,
				group: "test-group",
				key: "test:consumer",
				name: "c1",
			},
		);
		consumer.start();
		await sendMessage(client, "test:consumer", { test: "test" });
		await new Promise((resolve) => setTimeout(resolve, 30));
		await sendMessage(client, "test:consumer", { test: "test" });
		await new Promise((resolve) => setTimeout(resolve, 30));
		await consumer.stop();
		expect(received).toBe(2);
	});

	it("should consume old messages not processed", async () => {
		await sendMessage(client, "test:consumer", { test: "test1" });

		let received = 0;
		const consumer = await createConsumer<{ test: "test" }>(
			client,
			(message) => {
				received++;
			},
			{
				concurrency: 1,
				group: "test-group",
				key: "test:consumer",
				name: "c1",
			},
		);
		await sendMessage(client, "test:consumer", { test: "test2" });
		await sendMessage(client, "test:consumer", { test: "test3" });
		consumer.start();
		await new Promise((resolve) => setTimeout(resolve, 30));
		await consumer.stop();
		expect(received).toBe(3);
	});

	it("should not consume old messages not processed", async () => {
		let received = 0;
		const consumer = await createConsumer<{ test: "test" }>(
			client,
			(message) => {
				received++;
			},
			{
				concurrency: 1,
				group: "test-group",
				key: "test:consumer",
				name: "c1",
			},
		);

		await sendMessage(client, "test:consumer", { test: "test1" });
		await sendMessage(client, "test:consumer", { test: "test2" });
		await sendMessage(client, "test:consumer", { test: "test3" });

		// Read to add to PEL
		await client.xReadGroup("test-group", "c2", {
			key: "test:consumer",
			id: ">",
		});

		consumer.start();
		await new Promise((resolve) => setTimeout(resolve, 30));
		await consumer.stop();
		expect(received).toBe(0);
	});

	it("shold autoclaim and consume old messages not acked, but in PEL", async () => {
		let received = 0;
		const consumer = await createConsumer<{ test: "test" }>(
			client,
			async (message) => {
				received++;
				await message.ack();
			},
			{
				concurrency: 1,
				group: "test-group",
				key: "test:consumer",
				name: "c1",
				maxIdleTime: 50,
			},
		);

		await sendMessage(client, "test:consumer", { test: "test" });
		await client.xReadGroup("test-group", "c2", {
			key: "test:consumer",
			id: ">",
		});

		await new Promise((resolve) => setTimeout(resolve, 100));
		consumer.start();
		await new Promise((resolve) => setTimeout(resolve, 30));
		await consumer.stop();
		expect(received).toBe(1);
	});
});
