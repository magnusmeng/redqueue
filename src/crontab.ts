import { parseExpression } from "cron-parser";
import type { RedisClient } from "./interfaces";
import { sendMessage } from "./message";
import { mutex } from "./mutex";

export type CrontabString = `${string} ${string} ${string} ${string} ${string}`;

export interface ICrontab {
	readonly key: string;
	readonly crontab: CrontabString;
	start(): void;
	stop(): Promise<void>;
	isListening: boolean;
}

export function createCrontab(
	client: RedisClient,
	options: {
		key: string;
		crontab: CrontabString;
	},
): ICrontab {
	let listening = false;
	let listenProm: Promise<void> | undefined = undefined;

	const lock = mutex(client, `${options.key}:lock`);

	const listen = async () => {
		if (!listening) {
			await lock.release();
			return;
		}
		await lock.acquire({ lockTimeout: 2000 });

		const nextTimestamp = parseExpression(options.crontab).next().getTime();

		const storedNext = await client.get(`${options.key}:next`);
		if (!storedNext) {
			await client.set(`${options.key}:next`, `${nextTimestamp}`);
			return listen();
		}

		const next = Number.parseInt(storedNext);
		if (next === nextTimestamp) {
			// Wait... then listen again...
			await new Promise<void>((resolve) => setTimeout(resolve, 500));
			return listen();
		}
		// Fire the event and update the storedNext!
		await client.set(`${options.key}:next`, `${nextTimestamp}`);
		await sendMessage(client, `${options.key}`, {
			...options,
			triggered: new Date().toISOString(),
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 500));
		return listen();
	};

	return {
		get key() {
			return options.key;
		},
		get crontab() {
			return options.crontab;
		},
		get isListening() {
			return listening;
		},
		start() {
			if (listening)
				throw new Error(`Crontab for ${options.key} is already listening`);

			listening = true;
			listenProm = listen();
		},
		async stop() {
			listening = false;
			await listenProm;
		},
	};

	// Create a delayed job
}
