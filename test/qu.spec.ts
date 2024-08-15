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
	it("should await consumers", async () => {
		const qu = defineQu(client, {
			testConsumer: {
				handler: async (message: IQuMessage<{ test: "test" }>) => {
					await message.ack();
				},
			},
		});
		await qu.startConsumers();
		let awaited = false;
		setTimeout(async () => {
			await qu.stopConsumers();
			awaited = true;
		}, 100);
		await qu.awaitConsumers();
		expect(awaited).toBeTruthy();
	});
	it("should start worker and stop with SIGINT", async () => {
		const origOn = process.on;
		const mockCallback = jest.fn();
		const onSpy = jest.fn((signal, cb) => {
			if (signal === "SIGINT") {
				mockCallback.mockImplementation(cb);
			}
		});
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
		process.on = onSpy as any;
		try {
			const qu = defineQu(client, {
				testConsumer: {
					handler: async (message: IQuMessage<{ test: "test" }>) => {
						await message.ack();
					},
				},
			});
			const stopSpy = jest.spyOn(qu, "stopConsumers");
			void qu.startWorker(); // Do not await as that will stall forever.
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
			expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));

			mockCallback();

			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(stopSpy).toHaveBeenCalled();
			await qu.awaitConsumers();
		} finally {
			process.on = origOn;
		}
	});
	it("should work with redis client", async () => {
		const qu = defineQu(client, {});
		expect(qu).toBeDefined();
	});
	it("should work with redis config", async () => {
		const qu = defineQu(
			{
				client: {
					url: "redis://test",
				},
			},
			{},
		);
		expect(qu).toBeDefined();
	});
	it("should work with redis cluster config", async () => {
		const qu = defineQu(
			{
				cluster: {
					rootNodes: [{ url: "redis://test" }],
				},
			},
			{},
		);
		expect(qu).toBeDefined();
	});
	it("should open client when sending if not open", async () => {
		const copy = client.duplicate();
		try {
			const spy = jest.spyOn(copy, "connect");
			const qu = defineQu(copy, {
				testConsumer: {
					handler: async (message: IQuMessage<{ test: "test" }>) => {
						await message.ack();
					},
				},
			});
			await qu.send("testConsumer", { test: "test" });
			expect(spy).toHaveBeenCalled();
		} finally {
			await copy.disconnect();
		}
	});
	it("should open client when consuming if not open", async () => {
		const copy = client.duplicate();
		const spy = jest.spyOn(copy, "connect");
		const qu = defineQu(copy, {
			testConsumer: {
				handler: async (message: IQuMessage<{ test: "test" }>) => {
					await message.ack();
				},
			},
		});
		await qu.startConsumers();
		await qu.stopConsumers();
		expect(spy).toHaveBeenCalled();
		await copy.disconnect();
	});
	it("should setup consumer concurrency and groupName", async () => {
		const qu = defineQu(client, {
			testConsumer: {
				handler: async (message: IQuMessage<{ test: "test" }>) => {
					await message.ack();
				},
				options: {
					concurrency: 2,
					group: "test-group",
				},
			},
		});
		const consumers = await qu.startConsumers();
		expect(consumers.testConsumer.group).toBe("test-group");
		expect(consumers.testConsumer.concurrency).toBe(2);
		await qu.stopConsumers();
	});

	it("should setup crontabs", async () => {
		let received = 0;
		const qu = defineQu(
			client,
			{
				"test.cron": {
					handler: async (message: IQuMessage) => {
						++received;
						await message.ack();
					},
				},
			},
			{
				"test.cron": { crontab: "* * * * *" },
			},
		);
		// Force a cron trigger (as it is now)
		await client.set("test.cron:next", `${Date.now()}`);
		await qu.startConsumers();

		await new Promise((resolve) => setTimeout(resolve, 10));

		await qu.stopConsumers();
		expect(received).toBe(1);
	});
});
