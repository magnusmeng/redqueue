import { RedisClientType } from 'redis';
import { QuNotFoundError } from './errors';
import { createRawMessage, sendMessage } from './message';

interface IQuMessage<T> {
  id: string;
  payload: T;
  ack(): Promise<void>;
  noack(): Promise<void>;
  retries: number;
  moveToDlq?: string;
}

type IQuHandler<D> = (task: IQuMessage<D>) => Promise<void>;

interface IQuOptions {
  cron?: string;
  dlq?: string;
}

interface IResolvedQuHandler<D> {
  options?: IQuOptions;
  handler: IQuHandler<D>;
}

type UnwrappedHandlerPayload<T> = T extends IResolvedQuHandler<infer U>
  ? U
  : never;

type IResolveQu<T extends Record<string, IResolvedQuHandler<any>>> = {
  send<K extends keyof T>(
    key: K,
    payload: UnwrappedHandlerPayload<T[K]>
  ): Promise<void>;
  setupConsumers(): Promise<void>;
};

export function defineQu<T extends Record<string, IResolvedQuHandler<any>>>(
  redis: RedisClientType,
  options: T
): IResolveQu<T> {
  return {
    async send(key, payload) {
      if (!Object.keys(options).includes(String(key))) {
        throw new QuNotFoundError(
          `key ${String(key)} was not found in configuration!`
        );
      }
      const message = await sendMessage(redis, payload);
    },
    async setupConsumers() {},
  };
}
