/* eslint-disable @typescript-eslint/require-await */
import type { RedisClientType } from "redis";
import { version } from "../package.json";
import type { RedisClient } from "./interfaces";

interface IRawMessage extends Record<string, string> {
	readonly version: string;
	readonly producer: string;
	readonly payload: string;
}

export interface IQuMessage<D>
	extends Pick<IRawMessage, "producer" | "version"> {
	id: string;
	payload: D;
	ack(): Promise<void>;
	noack(): Promise<void>;
	retries: number;
	moveToDlq(): Promise<void>;
}

export function createRawMessage<D>(payload: D): IRawMessage {
	return {
		payload: JSON.stringify(payload),
		version: version,
		producer: `qu:${version}`,
	};
}

export function parseRawMessage<D>(raw: {
	id: string;
	message: Record<string, string>;
}): IQuMessage<D> {
	return {
		id: raw.id,
		payload: JSON.parse(raw.message.payload),
		producer: raw.message.producer,
		version: raw.message.version,
		retries: 0, // TODO: Read the "deliveries" count from redis
		async ack() {
			// empty
		},
		async moveToDlq() {
			// empty
		},
		async noack() {
			// empty
		},
	};
}

export async function sendMessage<D>(
	client: RedisClient,
	key: string,
	payload: D,
): Promise<{ id: string }> {
	const rawMessage = createRawMessage(payload);
	const id = await client.xAdd(key, "*", rawMessage);
	return {
		id,
	};
}

export async function ackMessages(
	client: RedisClient,
	key: string,
	group: string,
	ids: string[],
): Promise<number> {
	const res = await client.xAck(key, group, ids);
	return res;
}
