import type RedisMemoryServer from "redis-memory-server";
import { ConsumersAlreadySetupError, QuNotFoundError } from "../src/errors";
import type { RedisClient } from "../src/interfaces";
import type { IQuMessage } from "../src/message";
import { defineQu } from "../src/qu";
import { createTestRedisClient } from "./utils/redis-setup";

describe("Qu", () => {
	let client: RedisClient;
	let redisServer: RedisMemoryServer;
	beforeAll(async () => {
		({ client, redisServer } = await createTestRedisClient());
	});

	beforeEach(async () => {
		try {
			await client.xGroupDestroy("test:consumer", "test-group");
		} catch {
			// noop
		}
	});

	afterAll(async () => {
		await client.disconnect();
		await redisServer.stop();
	});

	it("should define consumers", async () => {
		const qu = defineQu(client, {
			testConsumer: {
				handler: async (message: IQuMessage<{ test: "test" }>) => {
					await message.ack();
				},
			},
		});
		const consumers = await qu.startConsumers();
		expect(Object.keys(consumers).length).toBe(1);
		expect(consumers.testConsumer).toBeDefined();
		expect(consumers.testConsumer.isConsuming).toBeTruthy();
		await consumers.testConsumer.stop();
		expect(consumers.testConsumer.isConsuming).toBeFalsy();
	});
	it("should throw error if sending unknown key", async () => {
		const qu = defineQu(client, {
			testConsumer: {
				handler: async (message: IQuMessage<{ test: "test" }>) => {
					await message.ack();
				},
			},
		});

		// @ts-ignore
		await expect(qu.send("not there", {})).rejects.toThrowError(
			QuNotFoundError,
		);
	});
	it("should throw error if starting consumers multiple times", async () => {
		const qu = defineQu(client, {});
		await qu.startConsumers();
		await expect(qu.startConsumers()).rejects.toThrowError(
			ConsumersAlreadySetupError,
		);
	});
	it("should start subset of consumers", async () => {
		const qu = defineQu(client, {
			hello: {
				handler: async () => {
					//empty
				},
			},
			world: {
				handler: async () => {
					//empty
				},
			},
		});
		const consumers = await qu.startConsumers({ keys: ["hello"] });
		expect(consumers.hello).toBeDefined();
		expect(Object.keys(consumers).length).toBe(1);
		await qu.stopConsumers();
	});
	it("should send message", async () => {
		let received = false;
		const qu = defineQu(client, {
			testConsumer: {
				handler: async (message: IQuMessage<{ test: "test" }>) => {
					await message.ack();
					received = true;
				},
			},
		});
		await qu.startConsumers();
		await qu.send("testConsumer", { test: "test" });
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(received).toBeTruthy();
		await qu.stopConsumers();
	});
});
