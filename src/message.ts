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

export function parseRawMessage<D>(
	client: RedisClient,
	raw: {
		id: string;
		message: Record<string, string>;
	},
	pending: {
		millisecondsSinceLastDelivery: number;
		deliveriesCounter: number;
	},
	{
		key,
		group,
		consumerName,
		dlq,
	}: { key: string; group: string; consumerName: string; dlq: string },
): IQuMessage<D> {
	const meta = {
		id: raw.id,
		payload: JSON.parse(raw.message.payload),
		producer: raw.message.producer,
		version: raw.message.version,
		retries: pending.deliveriesCounter - 1, // TODO: Read the "deliveries" count from redis
	};
	return {
		...meta,
		async ack() {
			await ackMessages(client, key, group, [raw.id]);
		},
		async moveToDlq() {
			const rawMessage = createRawMessage(meta);
			await client.xAdd(dlq, "*", {
				...rawMessage,
				ownerKey: key,
				ownerGroup: group,
			});
			await this.ack();
		},
		async noack() {
			await client.xClaimJustId(key, group, consumerName, 0, meta.id);
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
