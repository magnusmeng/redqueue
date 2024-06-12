/* eslint-disable @typescript-eslint/require-await */
import { RedisClientType } from 'redis';
import { version } from '../package.json';

interface IRawMessage extends Record<string, string> {
  readonly version: string;
  readonly producer: string;
  readonly payload: string;
}

export interface IQuMessage<D>
  extends Pick<IRawMessage, 'producer' | 'version'> {
  id: string;
  payload: D;
}

type RedisClient = RedisClientType<any, any, any>;

export function createRawMessage<D>(payload: D): IRawMessage {
  return {
    payload: JSON.stringify(payload),
    version: version,
    producer: `qu:${version}`,
  };
}

export async function sendMessage<D>(
  client: RedisClient,
  key: string,
  payload: D
): Promise<IQuMessage<D>> {
  const rawMessage = createRawMessage(payload);
  const id = await client.xAdd(key, '*', rawMessage);
  return {
    id,
    payload,
    version: rawMessage.version,
    producer: rawMessage.producer,
  };
}

export async function ackMessages(
  client: RedisClient,
  key: string,
  group: string,
  ids: string[]
): Promise<number> {
  const res = await client.xAck(key, group, ids);
  return res;
}
