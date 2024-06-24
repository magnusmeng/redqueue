import { RedisClientType } from 'redis';
import { ConsumersAlreadySetupError, QuNotFoundError } from './errors';
import { IQuMessage, sendMessage } from './message';
import { IQuConsumer, createConsumer } from './consumer';

type IQuHandler<D> = (task: IQuMessage<D>) => Promise<void>;

interface IQuOptions {
  cron?: string;
  dlq?: string;
  concurrency?: number;
}

interface IResolvedQuHandler<D> {
  options?: IQuOptions;
  handler: IQuHandler<D>;
}

type ExtractQuDataType<T> = T extends IResolvedQuHandler<infer U> ? U : never;

type IResolveQu<Q extends Record<string, IResolvedQuHandler<any>>> = {
  send<K extends keyof Q>(
    key: K,
    payload: ExtractQuDataType<Q[K]>
  ): Promise<{ id: string }>;
  startConsumers<K extends keyof Q>(options?: {
    keys?: K[];
    autoStart?: boolean;
  }): Promise<Record<K, IQuConsumer>>;
  stopConsumers(): Promise<void>;
};

export function defineQu<Q extends Record<string, IResolvedQuHandler<any>>>(
  redis: RedisClientType<any, any, any>,
  options: Q
): IResolveQu<Q> {
  let consumers: Record<keyof Q, IQuConsumer>;
  return {
    async send(key, payload) {
      if (!Object.keys(options).includes(String(key))) {
        throw new QuNotFoundError(
          `key ${String(key)} was not found in configuration!`
        );
      }
      const message = await sendMessage(redis, String(key), payload);
      return { id: message.id };
    },
    async startConsumers(
      { keys, autoStart = true } = { keys: undefined, autoStart: true }
    ) {
      if (consumers)
        throw new ConsumersAlreadySetupError('Consumers already setup');

      consumers = {} as Record<keyof Q, IQuConsumer>;

      const allKeys = Object.keys(options);
      const filteredKeys = keys
        ? keys.map(k => String(k)).filter(k => allKeys.includes(k))
        : allKeys;

      await Promise.all(
        filteredKeys.map<Promise<void>>(async key => {
          const opt = options[key];
          const consumer = await createConsumer(redis, opt.handler, {
            key: String(key),
            group: 'redqueue',
            concurrency: opt.options?.concurrency ?? 1,
          });
          if (autoStart) consumer.start();
          consumers[key as keyof Q] = consumer;
        })
      );
      return consumers;
    },
    async stopConsumers() {
      for (const consumer of Object.values(consumers)) {
        await consumer.stop();
      }
    },
  };
}
